import type { CacheReader, CacheAdapter } from '../domainCache';
import type { ApolloCache, TypePolicies } from '@apollo/client';
import { produce, type Draft } from 'immer';
import { CURRENT_USER } from './query';
import type { User } from './types';

export const userTypePolicies: TypePolicies = {
	User: { fields: { subscribedTrips: { merge: false } } },
};

function writeCurrentUser(cache: ApolloCache<unknown>, user: User) {
	cache.writeQuery({ query: CURRENT_USER, data: { me: user } });
}

function clearCurrentUser(cache: ApolloCache<unknown>) {
	const previous = cache.readQuery<{ me: User | null }>({
		query: CURRENT_USER,
	});
	cache.evict({ id: 'ROOT_QUERY', fieldName: 'me' });
	if (previous?.me) {
		const id = cache.identify({ __typename: 'User', id: previous.me.id });
		if (id) cache.evict({ id });
	}
	cache.gc();
}

export interface UserEditContext {
	readonly nameFor: (tripId: string) => string | undefined;
	readonly rememberName: (tripId: string, name: string) => void;
}

export type UserEditCommand = {
	type: 'user.edit';
	userId: string;
	edit: (draft: Draft<User> | null, context: UserEditContext) => undefined;
};

export type UserCacheCommand = UserEditCommand
	| { type: 'user.replace'; value: User }
	| { type: 'user.clear' };

export type UserCacheReader = CacheReader<User | null, [], []>;

/** Internal adapter; domain consumers only use UserApi. */
export class UserCache implements CacheAdapter<User | null, [], [], UserCacheCommand> {
	private readonly names = new Map<string, string>();
	constructor(private readonly cache: ApolloCache<unknown>) {}
	read = (): User | null =>
		this.cache.readQuery<{ me: User | null }>({ query: CURRENT_USER })?.me ??
		null;
	private replace(user: User) {
		writeCurrentUser(this.cache, {
			...user,
			subscribedTrips: user.subscribedTrips.map(trip => ({ ...trip, name: this.names.get(trip.id) ?? trip.name })),
		});
	}
	execute(command: UserCacheCommand): void {
		switch (command.type) {
			case 'user.replace': this.replace(command.value); return;
			case 'user.clear': this.clear(); return;
			case 'user.edit': {
				const current = this.read();
				if (current && current.id !== command.userId) return;
				const context: UserEditContext = {
					nameFor: tripId => this.names.get(tripId),
					rememberName: (tripId, name) => { this.names.set(tripId, name); },
				};
				if (!current) { command.edit(null, context); return; }
				const next = produce(current, draft => command.edit(draft, context));
				if (next !== current) writeCurrentUser(this.cache, next);
				return;
			}
		}
	}

	private clear() {
		this.names.clear();
		clearCurrentUser(this.cache);
	}
	subscribe = (listener: () => void): (() => void) =>
		this.cache.watch({
			query: CURRENT_USER,
			optimistic: true,
			callback: listener,
		});
}
