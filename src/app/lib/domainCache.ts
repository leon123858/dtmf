import type { ApolloCache } from '@apollo/client';
import { TripCache, type TripCacheCommand, type TripCacheReader } from './tripApi/cache';
import { UserCache, type UserCacheCommand, type UserCacheReader } from './userApi/cache';

/** Cache-only reads and subscriptions; adapters never schedule requests. */
export interface CacheReader<Value, ReadArgs extends unknown[], SubscribeArgs extends unknown[]> {
	read(...args: ReadArgs): Value;
	subscribe(...args: [...SubscribeArgs, listener: () => void]): () => void;
}
export interface CacheAdapter<Value, ReadArgs extends unknown[], SubscribeArgs extends unknown[], Command> extends CacheReader<Value, ReadArgs, SubscribeArgs> {
	execute(command: Command): void;
}

export type CacheCommand = TripCacheCommand | UserCacheCommand;

/** The only application write boundary. Commands have no implicit cross-domain effects. */
export class DomainCache {
	readonly trip: TripCacheReader;
	readonly user: UserCacheReader;

	constructor(private readonly tripCache: TripCache, private readonly userCache: UserCache) {
		// Facades preserve the existing read/watch implementations without exposing writers.
		this.trip = {
			read: (tripId, history) => tripCache.read(tripId, history),
			subscribe: (tripId, listener) => tripCache.subscribe(tripId, listener),
		};
		this.user = { read: userCache.read, subscribe: userCache.subscribe };
	}

	exec(command: CacheCommand | readonly CacheCommand[]): void {
		const commands = 'type' in command ? [command] : command;
		for (const item of commands) {
			switch (item.type) {
				case 'trip.replace':
				case 'trip.edit':
				case 'trip.clear':
					this.tripCache.execute(item);
					break;
				case 'user.replace':
				case 'user.edit':
				case 'user.clear':
					this.userCache.execute(item);
					break;
				default: {
					const unhandled: never = item;
					throw new Error(`Unknown cache command: ${JSON.stringify(unhandled)}`);
				}
			}
		}
	}
}

const caches = new WeakMap<ApolloCache<unknown>, DomainCache>();
export function domainCacheFor(cache: ApolloCache<unknown>): DomainCache {
	let domain = caches.get(cache);
	if (!domain) {
		domain = new DomainCache(new TripCache(cache), new UserCache(cache));
		caches.set(cache, domain);
	}
	return domain;
}
