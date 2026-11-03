import type { ApolloClient } from '@apollo/client';
import { CURRENT_USER } from './query';
import {
	SUBSCRIBE_TRIP,
	UNSUBSCRIBE_TRIP,
	TOUCH_SUBSCRIBED_TRIP,
	UPDATE_PROFILE,
	BIND_TRIP,
	UNBIND_TRIP,
} from './mutation';
import { type UserEditCommand } from './cache';
import { patchProfile, upsertFavorite, removeFavorite, touchFavorite, renameFavorite } from './commands';
import { apiLockFor, type APILock, type RefreshResult } from '../apiLock';
import { domainCacheFor, type DomainCache, type CacheCommand } from '../domainCache';
import { MyApolloError } from '../graphClient/errors';
import type { UpdateProfileInput, Operation, User } from './types';
import { UserApiError, type MemberApi, type FavoriteInput } from './public';

const mutations = {
	subscribeTrip: SUBSCRIBE_TRIP,
	unsubscribeTrip: UNSUBSCRIBE_TRIP,
	touchSubscribedTrip: TOUCH_SUBSCRIBED_TRIP,
};

/** One instance per authenticated session. Identity never lives in a server singleton. */
export class UserApi implements MemberApi {
	private get cache() { return this.domain.user; }
	private revision = 0;
	private static nextIdentity = 0;
	private readonly identity = ++UserApi.nextIdentity;
	private active = true;
	private readonly reads = new WeakMap<Promise<RefreshResult>, Promise<void>>();
	private readonly observers = new Set<() => void>();

	constructor(
		private readonly client: ApolloClient<object>,
		private readonly isCurrent: () => boolean,
		private readonly domain: DomainCache = domainCacheFor(client.cache),
		private readonly lock: APILock = apiLockFor(client)
	) {}

	updateProfile(input: UpdateProfileInput): Promise<void> {
		return this.write(() => this.identityMutation(UPDATE_PROFILE, { input }, 'updateMe', user => {
			if (user.name === undefined) throw new UserApiError('unavailable', '會員回應不完整。');
			return [
				patchProfile({ userId: user.id, name: user.name }),
				{ type: 'trip.clear', target: { scope: 'all' } },
			];
		}));
	}
	bind(tripId: string, addressId?: string | null): Promise<void> {
		return this.write(() => this.identityMutation(BIND_TRIP, { tripId, addressId }, 'bind', () => []));
	}
	unbind(tripId: string): Promise<void> {
		return this.write(() => this.identityMutation(UNBIND_TRIP, { tripId }, 'unbind', () => [false, true].some(history => this.domain.trip.read(tripId, history)?.private)
			? { type: 'trip.clear', target: { scope: 'trip', tripId } } : []));
	}
	private write(operation: () => Promise<void>): Promise<void> {
		const userId = this.cache.read()?.id;
		const revision = this.revision;
		return this.lock.update(async () => {
			this.assertCurrent(revision);
			if (!userId || this.cache.read()?.id !== userId)
				throw new UserApiError('user-mismatch', '會員資料不符。');
			await operation();
		});
	}

	private async identityMutation(
		document: import('@apollo/client').DocumentNode,
		variables: Record<string, unknown>,
		field: string,
		change: (user: User) => CacheCommand | readonly CacheCommand[]
	): Promise<void> {
		this.assertCurrent();
		const revision = this.revision;
		const userId = this.cache.read()?.id;
		try {
			const { data } = await this.client.mutate<Record<string, User>>({
				mutation: document,
				variables,
				fetchPolicy: 'no-cache',
				errorPolicy: 'none',
			});
			this.assertCurrent(revision);
			if (
				!userId ||
				data?.[field]?.id !== userId ||
				this.cache.read()?.id !== userId
			)
				throw new UserApiError('user-mismatch', '會員資料不符。');
			this.domain.exec(change(data[field]));
		} catch (error) {
			throw this.failure(error);
		}
	}
	getSnapshot = (): User | null => this.cache.read();

	subscribe = (listener: () => void): (() => void) => {
		if (!this.active) return () => {};
		const stop = this.cache.subscribe(listener);
		const unsubscribe = () => {
			stop();
			this.observers.delete(unsubscribe);
		};
		this.observers.add(unsubscribe);
		return unsubscribe;
	};

	initialize(): Promise<void> {
		const revision = this.revision;
		const refresh = this.lock.refresh(
			JSON.stringify(['user', this.identity, revision]),
			'foreground_refresh',
			0,
			async () => {
				this.assertCurrent(revision);
				try {
					const { data } = await this.client.query<{ me: User | null }>({
						query: CURRENT_USER,
						fetchPolicy: 'no-cache',
						errorPolicy: 'none',
						context: { queryDeduplication: false },
					});
					this.assertCurrent(revision);
					if (!data.me)
						throw new UserApiError('unavailable', '會員服務暫時無法使用，請重試。');
					this.domain.exec({ type: 'user.replace', value: data.me });
				} catch (error) {
					throw this.failure(error);
				}
			}
		);
		let promise = this.reads.get(refresh);
		if (!promise) {
			promise = refresh.then(() => {});
			this.reads.set(refresh, promise);
		}
		return promise;
	}

	subscribeTrip(input: FavoriteInput & { name: string }): Promise<void> {
		return this.write(() => this.mutate('subscribeTrip', input.tripId, user => {
			const confirmed = confirmedFavorite(user, input.tripId);
			return upsertFavorite({ userId: user.id, tripId: input.tripId, name: confirmed.name, lastViewedAt: confirmed.lastViewedAt });
		}));
	}

	unsubscribeTrip(tripId: string): Promise<void> {
		return this.write(() => this.mutate('unsubscribeTrip', tripId, user => removeFavorite({ userId: user.id, tripId })));
	}

	touchSubscribedTrip(input: FavoriteInput): Promise<void> {
		return this.write(() => this.mutate('touchSubscribedTrip', input.tripId, user => touchFavorite({ userId: user.id, tripId: input.tripId, lastViewedAt: confirmedFavorite(user, input.tripId).lastViewedAt })));
	}

	renameTrip(tripId: string, name: string): void {
		if (!this.active || !this.isCurrent()) return;
		this.domain.exec(renameFavorite({ userId: this.cache.read()?.id ?? '', tripId, name }));
	}

	dispose(): void {
		this.active = false;
		this.revision++;
		for (const unsubscribe of this.observers) unsubscribe();
	}

	clear(): void {
		this.revision++;
		void this.lock.flush(() => this.domain.exec({ type: 'user.clear' })).catch(() => {});
	}

	private assertCurrent(revision = this.revision): void {
		if (!this.active || !this.isCurrent() || revision !== this.revision) {
			throw new UserApiError('session-changed', '登入已變更。');
		}
	}

	private failure(error: unknown): UserApiError {
		if (!this.active || !this.isCurrent())
			return new UserApiError('session-changed', '登入已變更。');
		const business = MyApolloError(error);
		if (business) return new UserApiError(business.code, business.message);
		return error instanceof UserApiError
			? error
			: new UserApiError(
					'unavailable',
					error instanceof Error ? error.message : '收藏同步失敗，請重試。'
				);
	}

	private async mutate(
		operation: Operation,
		tripId: string,
		change: (user: User) => UserEditCommand
	): Promise<void> {
		this.assertCurrent();
		const revision = this.revision;
		try {
			const { data, errors } = await this.client.mutate<
				Record<Operation, User>
			>({
				mutation: mutations[operation],
				variables: { tripId },
				fetchPolicy: 'no-cache',
				errorPolicy: 'none',
			});
			this.assertCurrent(revision);
			const userId = data?.[operation]?.id;
			if (errors?.length || !userId) {
				throw new UserApiError('unavailable', '無法更新會員收藏，請重試。');
			}
			if (this.cache.read()?.id !== userId) {
				throw new UserApiError('user-mismatch', '會員資料不符。');
			}
			this.domain.exec(change(data![operation]));
		} catch (error) {
			throw this.failure(error);
		}
	}
}

function confirmedFavorite(user: User, tripId: string) {
	const favorite = user.subscribedTrips?.find(trip => trip.id === tripId);
	if (!favorite) throw new UserApiError('unavailable', '收藏回應不完整。');
	return favorite;
}
