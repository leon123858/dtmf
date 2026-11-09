import {
	ApolloError,
	type ApolloClient,
	type DocumentNode,
	type OperationVariables,
} from '@apollo/client';
import { MyApolloError } from '../graphClient/errors';
import { MyError } from '../errors';
import { type TripEditCommand, type TripCacheTarget } from './cache';
import { patchTrip, upsertRecord, addAddress, patchAddress, removeAddress } from './commands';
import { renameFavorite } from '../userApi/commands';
import { apiLockFor, type APILock } from '../apiLock';
import { domainCacheFor, type DomainCache } from '../domainCache';
import { TRIP_POLL_INTERVAL } from './public';
import { GET_TRIP } from './query';
import {
	CREATE_TRIP,
	UPDATE_TRIP,
	CREATE_RECORD,
	UPDATE_RECORD,
	CREATE_ADDRESS,
	UPDATE_ADDRESS,
	DELETE_ADDRESS,
} from './mutation';
import { TripApiError } from './public';
import type * as Input from './public';
import type * as Graph from './types';

/** Request and cache coordination stays behind this domain facade. */
export class TripClient {
	constructor(
		private readonly client: ApolloClient<object>,
		private readonly session: () => string | number = () => 0,
		private readonly domain: DomainCache = domainCacheFor(client.cache),
		private readonly lock: APILock = apiLockFor(client)
	) {}
	private get cache() { return this.domain.trip; }
	flush = (tripId?: string, haveHistory?: boolean): Promise<void> =>
		this.lock.flush(() => this.domain.exec({ type: 'trip.clear', target: tripTarget(tripId, haveHistory) }));
	forceRefresh(input: Pick<Input.RefreshTripInput, 'tripId' | 'haveHistory'>): Promise<Input.RefreshTripResult> {
		const flushed = this.flush(input.tripId, !input.haveHistory);
		void flushed.catch(() => {});
		return this.refresh({ ...input, source: 'foreground' }, flushed);
	}
	private runMutation(
		operation: (session: string | number) => Promise<void>
	): Promise<void> {
		const session = this.session();
		return this.lock.update(async () => {
			if (session !== this.session())
				throw new TripApiError('session-changed', '登入已變更。');
			await operation(session);
		});
	}
	getSnapshot = (tripId: string, haveHistory: boolean) =>
		this.cache.read(tripId, haveHistory);
	subscribe = (tripId: string, listener: () => void) =>
		this.cache.subscribe(tripId, listener);

	refresh(input: Input.RefreshTripInput, prerequisite?: Promise<void>): Promise<Input.RefreshTripResult> {
		const session = this.session();
		return this.lock.refresh(
			JSON.stringify(['trip', input.tripId, input.haveHistory, session]),
			input.source === 'background' ? 'background_refresh' : 'foreground_refresh',
			TRIP_POLL_INTERVAL,
			async () => {
				try {
					if (prerequisite) await prerequisite;
					if (session !== this.session())
						throw new TripApiError('session-changed', '登入已變更。');
					const { data, errors } = await this.client.query<
						Graph.TripQueryData,
						Graph.TripQueryVariables
					>({
						query: GET_TRIP,
						variables: { tripId: input.tripId, haveHistory: input.haveHistory },
						fetchPolicy: 'no-cache',
						errorPolicy: 'none',
						context: { queryDeduplication: false },
					});
					if (errors?.length || !data || data.trip === undefined) {
						throw new TripApiError(
							'unavailable',
							'行程查詢回應不完整，請重試。'
						);
					}
					if (session !== this.session())
						throw new TripApiError('session-changed', '登入已變更。');
					this.domain.exec({ type: 'trip.replace', tripId: input.tripId, haveHistory: input.haveHistory, value: data.trip });
				} catch (error) {
					const failure =
						session !== this.session()
							? new TripApiError('session-changed', '登入已變更。')
							: toTripError(error);
					if (session === this.session() && MyError.isAccessError(failure))
						this.domain.exec({ type: 'trip.clear', target: tripTarget(input.tripId) });
					throw failure;
				}
			}
		);
	}

	createTrip(input: Graph.NewTripInput): Promise<{ id: string }> {
		const session = this.session();
		return this.lock.update(async () => {
			if (session !== this.session()) throw new TripApiError('session-changed', '登入已變更。');
			const data = await this.request<
				Graph.CreateTripMutationData,
				Graph.CreateTripMutationVariables
			>(CREATE_TRIP, { input });
			if (!data.createTrip?.id) {
				throw new TripApiError('unavailable', '創建新旅程失敗，請稍後再試。');
			}
			return { id: data.createTrip.id };
		});
	}

	updateTrip(input: Input.UpdateTripInput): Promise<void> {
		return this.runMutation(async (session) => {
			const data = await this.request<
				Graph.UpdateTripMutationData,
				Input.UpdateTripInput
			>(UPDATE_TRIP, input);
			this.commit(patchTrip({ tripId: input.tripId, value: data.updateTrip }), session, data.updateTrip?.id);
			this.domain.exec(renameFavorite({ userId: this.domain.user.read()?.id ?? '', tripId: input.tripId, name: data.updateTrip.name }));
		});
	}

	createRecord(input: Input.CreateRecordInput): Promise<void> {
		return this.runMutation(async (session) => {
			const data = await this.request<
				Graph.CreateRecordMutationData,
				Input.CreateRecordInput
			>(CREATE_RECORD, input);
			this.commit(upsertRecord({ tripId: input.tripId, value: data.createRecord }), session, data.createRecord?.id);
		});
	}

	updateRecord({ tripId, ...input }: Input.UpdateRecordInput): Promise<void> {
		return this.runMutation(async (session) => {
			const data = await this.request<
				Graph.UpdateRecordMutationData,
				Graph.UpdateRecordMutationVariables
			>(UPDATE_RECORD, input);
			this.commit(upsertRecord({ tripId,
				value: data.updateRecord,
				editedRecordId: input.recordId,
			}), session, data.updateRecord?.id);
		});
	}

	createAddress(input: Input.CreateAddressInput): Promise<void> {
		return this.runMutation(async (session) => {
			const data = await this.request<
				Graph.CreateAddressMutationData,
				Input.CreateAddressInput
			>(CREATE_ADDRESS, input);
			this.commit(addAddress({ tripId: input.tripId,
				value: data.createAddress,
			}), session, data.createAddress?.id);
		});
	}

	updateAddress(input: Input.UpdateAddressInput): Promise<void> {
		return this.runMutation(async (session) => {
			const data = await this.request<
				Graph.UpdateAddressMutationData,
				Input.UpdateAddressInput
			>(UPDATE_ADDRESS, input);
			this.commit(patchAddress({ tripId: input.tripId,
				value: data.updateAddress,
			}), session, data.updateAddress?.id);
		});
	}

	deleteAddress(input: Input.DeleteAddressInput): Promise<void> {
		return this.runMutation(async (session) => {
			const data = await this.request<
				Graph.DeleteAddressMutationData,
				Input.DeleteAddressInput
			>(DELETE_ADDRESS, input);
			this.commit(removeAddress({ tripId: input.tripId,
				addressId: data.deleteAddress?.id,
			}), session, data.deleteAddress?.id);
		});
	}

	private async request<Data, Variables extends OperationVariables>(
		document: DocumentNode,
		input: Variables
	): Promise<Data> {
		const session = this.session();
		try {
			const { data, errors } = await this.client.mutate<Data, Variables>({
				mutation: document,
				variables: input,
				fetchPolicy: 'no-cache',
				errorPolicy: 'none',
			});
			if (errors?.length || !data) {
				throw new TripApiError(
					'unavailable',
					errors?.map((error) => error.message).join('\n') ||
						'行程操作失敗，請重試。'
				);
			}
			if (session !== this.session())
				throw new TripApiError('session-changed', '登入已變更。');
			return data;
		} catch (error) {
			const failure =
				session !== this.session()
					? new TripApiError('session-changed', '登入已變更。')
					: toTripError(error);
			if (
				session === this.session() &&
				MyError.isAccessError(failure) &&
				typeof input.tripId === 'string'
			)
				this.domain.exec({ type: 'trip.clear', target: tripTarget(input.tripId) });
			throw failure;
		}
	}

	private commit(command: TripEditCommand, session: string | number, id: string | undefined): void {
		if (session !== this.session()) throw new TripApiError('session-changed', '登入已變更。');
		if (!id) throw new TripApiError('unavailable', '行程操作回應不完整，請重試。');
		this.domain.exec(command);
	}
}

/** Internal translation used by request paths. */
function toTripError(error: unknown): TripApiError {
	if (error instanceof TripApiError) return error;
	if (
		error instanceof ApolloError &&
		error.networkError &&
		'statusCode' in error.networkError &&
		error.networkError.statusCode === 401
	)
		return new TripApiError('unauthenticated', '登入已失效，請重新登入。');
	const business = MyApolloError(error);
	if (business) return new TripApiError(business.code, business.message);
	if (error instanceof ApolloError) {
		const network = error.networkError;
		if (network)
			return new TripApiError('network', '行程服務暫時無法使用，請重試。');
		return new TripApiError(
			'unavailable',
			error.graphQLErrors.map((item) => item.message).join('\n') ||
				'行程操作失敗，請重試。'
		);
	}
	return new TripApiError(
		'unavailable',
		error instanceof Error ? error.message : '行程操作失敗，請重試。'
	);
}

function tripTarget(tripId?: string, haveHistory?: boolean): TripCacheTarget {
	if (tripId === undefined) return { scope: 'all' };
	return haveHistory === undefined ? { scope: 'trip', tripId } : { scope: 'variant', tripId, haveHistory };
}
