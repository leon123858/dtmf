import { ApolloError, type ApolloClient, type DocumentNode, type OperationVariables } from '@apollo/client';
import { TripCache, type TripChange } from './cache';
import { GET_TRIP } from './query';
import {
	CREATE_TRIP, UPDATE_TRIP, CREATE_RECORD, UPDATE_RECORD,
	CREATE_ADDRESS, UPDATE_ADDRESS, DELETE_ADDRESS,
} from './mutation';
import { TripApiError, type TripService } from './public';
import type * as Input from './public';
import type * as Graph from './types';

/** Request and cache coordination stays behind this domain facade. */
export class TripApi implements TripService {
	private readonly cache: TripCache;

	constructor(private readonly client: ApolloClient<object>) {
		this.cache = new TripCache(client.cache);
	}

	getSnapshot = (tripId: string, haveHistory: boolean) => this.cache.read(tripId, haveHistory);
	subscribe = (tripId: string, listener: () => void) => this.cache.subscribe(tripId, listener);

	refresh(input: Input.RefreshTripInput): Promise<Input.RefreshTripResult> {
		return this.cache.runRefresh(input, async () => {
			try {
				const { data, errors } = await this.client.query<Graph.TripQueryData, Graph.TripQueryVariables>({
					query: GET_TRIP,
					variables: { tripId: input.tripId, haveHistory: input.haveHistory },
					fetchPolicy: 'no-cache',
					context: { queryDeduplication: false },
				});
				if (errors?.length || !data || data.trip === undefined) {
					throw new TripApiError('unavailable', '行程查詢回應不完整，請重試。');
				}
				this.cache.commitRead(input.tripId, input.haveHistory, data);
			} catch (error) { throw toTripError(error); }
		});
	}

	async createTrip(input: Graph.NewTripInput): Promise<{ id: string }> {
		const data = await this.request<Graph.CreateTripMutationData, Graph.CreateTripMutationVariables>(CREATE_TRIP, { input });
		if (!data.createTrip?.id) {
			throw new TripApiError('unavailable', '創建新旅程失敗，請稍後再試。');
		}
		return { id: data.createTrip.id };
	}

	updateTrip(input: Input.UpdateTripInput): Promise<void> {
		return this.cache.runMutation(input.tripId, async () => {
			const data = await this.request<Graph.UpdateTripMutationData, Input.UpdateTripInput>(UPDATE_TRIP, input);
			this.apply(input.tripId, { kind: 'trip', value: data.updateTrip });
		});
	}

	createRecord(input: Input.CreateRecordInput): Promise<void> {
		return this.cache.runMutation(input.tripId, async () => {
			const data = await this.request<Graph.CreateRecordMutationData, Input.CreateRecordInput>(CREATE_RECORD, input);
			this.apply(input.tripId, { kind: 'record', value: data.createRecord });
		});
	}

	updateRecord({ tripId, ...input }: Input.UpdateRecordInput): Promise<void> {
		return this.cache.runMutation(tripId, async () => {
			const data = await this.request<Graph.UpdateRecordMutationData, Graph.UpdateRecordMutationVariables>(UPDATE_RECORD, input);
			this.apply(tripId, { kind: 'record', value: data.updateRecord, editedRecordId: input.recordId });
		});
	}

	createAddress(input: Input.CreateAddressInput): Promise<void> {
		return this.cache.runMutation(input.tripId, async () => {
			const data = await this.request<Graph.CreateAddressMutationData, Input.CreateAddressInput>(CREATE_ADDRESS, input);
			this.apply(input.tripId, { kind: 'createAddress', value: data.createAddress });
		});
	}

	updateAddress(input: Input.UpdateAddressInput): Promise<void> {
		return this.cache.runMutation(input.tripId, async () => {
			const data = await this.request<Graph.UpdateAddressMutationData, Input.UpdateAddressInput>(UPDATE_ADDRESS, input);
			this.apply(input.tripId, { kind: 'updateAddress', value: data.updateAddress });
		});
	}

	deleteAddress(input: Input.DeleteAddressInput): Promise<void> {
		return this.cache.runMutation(input.tripId, async () => {
			const data = await this.request<Graph.DeleteAddressMutationData, Input.DeleteAddressInput>(DELETE_ADDRESS, input);
			this.apply(input.tripId, { kind: 'deleteAddress', value: data.deleteAddress });
		});
	}

	private async request<Data, Variables extends OperationVariables>(
		document: DocumentNode, input: Variables,
	): Promise<Data> {
		try {
			const { data, errors } = await this.client.mutate<Data, Variables>({
				mutation: document, variables: input, fetchPolicy: 'no-cache',
			});
			if (errors?.length || !data) {
				throw new TripApiError('unavailable', errors?.map(error => error.message).join('\n') || '行程操作失敗，請重試。');
			}
			return data;
		} catch (error) {
			throw toTripError(error);
		}
	}

	private apply(tripId: string, change: TripChange): void {
		if (!change.value?.id) {
			throw new TripApiError('unavailable', '行程操作回應不完整，請重試。');
		}
		this.cache.apply(tripId, change);
	}
}

/** Internal translation used by request paths. */
function toTripError(error: unknown): TripApiError {
	if (error instanceof TripApiError) return error;
	if (error instanceof ApolloError) {
		const network = error.networkError;
		if (network && 'statusCode' in network && network.statusCode === 401) {
			return new TripApiError('unauthenticated', '登入已失效，請重新登入。');
		}
		if (network) return new TripApiError('network', '行程服務暫時無法使用，請重試。');
		return new TripApiError('unavailable', error.graphQLErrors.map(item => item.message).join('\n') || '行程操作失敗，請重試。');
	}
	return new TripApiError('unavailable', error instanceof Error ? error.message : '行程操作失敗，請重試。');
}
