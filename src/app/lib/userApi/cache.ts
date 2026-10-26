import type { ApolloCache, TypePolicies } from '@apollo/client';
import { CURRENT_USER } from './query';
import type { User } from './types';

export const userTypePolicies: TypePolicies = {
	User: { fields: { subscribedTrips: { merge: false } } },
};

export function writeCurrentUser(cache: ApolloCache<unknown>, user: User) {
	cache.writeQuery({ query: CURRENT_USER, data: { me: user } });
}

export function clearCurrentUser(cache: ApolloCache<unknown>) {
	const previous = cache.readQuery<{ me: User | null }>({ query: CURRENT_USER });
	cache.evict({ id: 'ROOT_QUERY', fieldName: 'me' });
	if (previous?.me) {
		const id = cache.identify({ __typename: 'User', id: previous.me.id });
		if (id) cache.evict({ id });
	}
}

export type UserChange = { userId: string; tripId: string } & (
	| { type: 'subscribe'; name: string; lastViewedAt: string }
	| { type: 'unsubscribe' }
	| { type: 'touch'; lastViewedAt: string }
	| { type: 'rename'; name: string }
);

export function applyUserChange(user: User, change: UserChange): User {
	if (user.id !== change.userId) return user;
	const existing = user.subscribedTrips.some(trip => trip.id === change.tripId);
	let subscribedTrips = user.subscribedTrips;
	switch (change.type) {
		case 'unsubscribe':
			subscribedTrips = subscribedTrips.filter(trip => trip.id !== change.tripId);
			break;
		case 'subscribe':
			subscribedTrips = existing ? subscribedTrips.map(trip => trip.id === change.tripId ? { ...trip, name: change.name, lastViewedAt: change.lastViewedAt } : trip)
				: [...subscribedTrips, { __typename: 'SubscribedTrip', id: change.tripId, name: change.name, lastViewedAt: change.lastViewedAt }];
			break;
		case 'touch':
			subscribedTrips = subscribedTrips.map(trip => trip.id === change.tripId ? { ...trip, lastViewedAt: change.lastViewedAt } : trip);
			break;
		case 'rename':
			subscribedTrips = subscribedTrips.map(trip => trip.id === change.tripId ? { ...trip, name: change.name } : trip);
	}
	return { ...user, subscribedTrips };
}

export function updateUserCache(cache: ApolloCache<unknown>, change: UserChange) {
	const current = cache.readQuery<{ me: User | null }>({ query: CURRENT_USER });
	if (current?.me && current.me.id === change.userId) writeCurrentUser(cache, applyUserChange(current.me, change));
}

/** Internal adapter; domain consumers only use UserApi. */
export class UserCache {
	constructor(private readonly cache: ApolloCache<unknown>) {}
	read = (): User | null => this.cache.readQuery<{ me: User | null }>({ query: CURRENT_USER })?.me ?? null;
	replace(user: User) { writeCurrentUser(this.cache, user); }
	apply(change: UserChange) { updateUserCache(this.cache, change); }
	clear() { clearCurrentUser(this.cache); }
	subscribe = (listener: () => void): (() => void) => this.cache.watch({
		query: CURRENT_USER, optimistic: true, callback: listener,
	});
}
