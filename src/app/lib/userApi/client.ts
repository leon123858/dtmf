import type { ApolloClient } from '@apollo/client';
import { CURRENT_USER } from './query';
import { SUBSCRIBE_TRIP, UNSUBSCRIBE_TRIP, TOUCH_SUBSCRIBED_TRIP } from './mutation';
import { UserCache, type UserChange } from './cache';
import type { Operation, User } from './types';
import { UserApiError, type MemberApi, type FavoriteInput } from './public';

type ChangeInput = {
	[Kind in UserChange['type']]: Omit<Extract<UserChange, { type: Kind }>, 'userId'>;
}[UserChange['type']];

const mutations = {
	subscribeTrip: SUBSCRIBE_TRIP,
	unsubscribeTrip: UNSUBSCRIBE_TRIP,
	touchSubscribedTrip: TOUCH_SUBSCRIBED_TRIP,
};

/** One instance per authenticated session. Identity never lives in a server singleton. */
export class UserApi implements MemberApi {
	private readonly cache: UserCache;
	private active = true;
	private readonly names = new Map<string, string>();
	private readonly observers = new Set<() => void>();

	constructor(
		private readonly client: ApolloClient<object>,
		private readonly isCurrent: () => boolean,
	) {
		this.cache = new UserCache(client.cache);
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

	async initialize(): Promise<void> {
		this.assertCurrent();
		try {
			const { data } = await this.client.query<{ me: User | null }>({
				query: CURRENT_USER,
				fetchPolicy: 'no-cache',
				context: { queryDeduplication: false },
			});
			this.assertCurrent();
			if (!data.me) throw new UserApiError('unavailable', '會員服務暫時無法使用，請重試。');
			this.cache.replace({
				...data.me,
				subscribedTrips: data.me.subscribedTrips.map(trip => ({
					...trip,
					name: this.names.get(trip.id) ?? trip.name,
				})),
			});
		} catch (error) {
			throw this.failure(error);
		}
	}

	subscribeTrip(input: FavoriteInput & { name: string }): Promise<void> {
		return this.mutate('subscribeTrip', { type: 'subscribe', ...input });
	}

	unsubscribeTrip(tripId: string): Promise<void> {
		return this.mutate('unsubscribeTrip', { type: 'unsubscribe', tripId });
	}

	touchSubscribedTrip(input: FavoriteInput): Promise<void> {
		return this.mutate('touchSubscribedTrip', { type: 'touch', ...input });
	}

	renameTrip(tripId: string, name: string): void {
		if (!this.active || !this.isCurrent()) return;
		this.names.set(tripId, name);
		const user = this.cache.read();
		if (user) this.cache.apply({ type: 'rename', userId: user.id, tripId, name });
	}

	dispose(): void {
		this.active = false;
		this.names.clear();
		for (const unsubscribe of this.observers) unsubscribe();
	}

	clear(): void {
		this.cache.clear();
	}

	private assertCurrent(): void {
		if (!this.active || !this.isCurrent()) {
			throw new UserApiError('session-changed', '登入已變更。');
		}
	}

	private failure(error: unknown): UserApiError {
		return error instanceof UserApiError ? error : new UserApiError(
			'unavailable', error instanceof Error ? error.message : '收藏同步失敗，請重試。',
		);
	}

	private async mutate(operation: Operation, change: ChangeInput): Promise<void> {
		this.assertCurrent();
		try {
			const { data, errors } = await this.client.mutate<Record<Operation, { id: string }>>({
				mutation: mutations[operation],
				variables: { tripId: change.tripId },
				fetchPolicy: 'no-cache',
			});
			this.assertCurrent();
			const userId = data?.[operation]?.id;
			if (errors?.length || !userId) {
				throw new UserApiError('unavailable', '無法更新會員收藏，請重試。');
			}
			if (this.cache.read()?.id !== userId) {
				throw new UserApiError('user-mismatch', '會員資料不符。');
			}
			const confirmed: UserChange = { ...change, userId };
			this.cache.apply(confirmed.type === 'subscribe' ? {
				...confirmed, name: this.names.get(change.tripId) ?? confirmed.name,
			} : confirmed);
		} catch (error) {
			throw this.failure(error);
		}
	}
}
