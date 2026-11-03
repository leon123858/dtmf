import type { CacheReader, CacheAdapter } from '../domainCache';
import { ApolloCache, InMemoryCache, TypePolicies } from '@apollo/client';
import { GET_TRIP } from './query';
import { normalizeTrip } from './recordInput';
import { produce, type Draft } from 'immer';
import type { Trip, TripPayload, TripQueryData } from './types';

export const tripTypePolicies: TypePolicies = {
	Query: {
		fields: { trip: { keyArgs: ['tripId', 'haveHistory'], merge: false } },
	},
	// The two query variants contain different record lists for the same trip.
	Trip: { keyFields: false },
};

export function createTripCache() {
	return new InMemoryCache({ typePolicies: tripTypePolicies });
}

/** Targets for clearing snapshots or retiring in-flight reads. */
export type TripCacheTarget =
	| { scope: 'all' }
	| { scope: 'trip'; tripId: string }
	| { scope: 'variant'; tripId: string; haveHistory: boolean };

export type TripEditCommand = {
	type: 'trip.edit';
	target: Exclude<TripCacheTarget, { scope: 'all' }>;
	edit: (draft: Draft<TripPayload>, context: Readonly<{ haveHistory: boolean }>) => undefined;
};

export type TripCacheCommand = TripEditCommand
	| { type: 'trip.replace'; tripId: string; haveHistory: boolean; value: TripPayload | null }
	| { type: 'trip.clear'; target: TripCacheTarget };

export type TripCacheReader = CacheReader<Trip | null | undefined, [tripId: string, haveHistory: boolean], [tripId: string]>;

type Cache = ApolloCache<unknown>;

function editTripCache(cache: Cache, command: TripEditCommand) {
	cache.batch({
		update(cache) {
			const { target } = command;
			const variants = target.scope === 'variant' ? [target.haveHistory] : [false, true];
			for (const haveHistory of variants) {
				const variables = { tripId: target.tripId, haveHistory };
				const data = cache.readQuery<TripQueryData>({ query: GET_TRIP, variables });
				if (data?.trip) {
					const trip = produce(data.trip, draft => command.edit(draft, { haveHistory }));
					if (trip !== data.trip) cache.writeQuery({ query: GET_TRIP, variables, data: { trip } });
				}
			}
		},
	});
}

/** Trip snapshots, invalidation versions, and local change application. */
export class TripCache implements CacheAdapter<Trip | null | undefined, [tripId: string, haveHistory: boolean], [tripId: string], TripCacheCommand> {
	private readonly snapshots = new Map<string, { source: TripPayload; value: Trip }>();
	constructor(private readonly cache: Cache) { }
	read(tripId: string, haveHistory: boolean): Trip | null | undefined {
		const source = this.cache.readQuery<TripQueryData>({ query: GET_TRIP, variables: { tripId, haveHistory } })?.trip;
		if (!source) return source;
		const key = `${tripId}:${haveHistory}`;
		const previous = this.snapshots.get(key);
		if (previous?.source === source) return previous.value;
		const value = normalizeTrip(source);
		this.snapshots.set(key, { source, value });
		return value;
	}
	subscribe(tripId: string, listener: () => void): () => void {
		const stops = [false, true].map(haveHistory => this.cache.watch({ query: GET_TRIP, variables: { tripId, haveHistory }, optimistic: true, callback: listener }));
		return () => stops.forEach(stop => stop());
	}
	execute(command: TripCacheCommand): void {
		switch (command.type) {
			case 'trip.replace':
				this.commitRead(command.tripId, command.haveHistory, { trip: command.value });
				return;
			case 'trip.clear': {
				const target = command.target;
				const tripId = target.scope === 'all' ? undefined : target.tripId;
				const history = target.scope === 'variant' ? target.haveHistory : undefined;
				this.invalidate(tripId, history);
				return;
			}
			default:
				editTripCache(this.cache, command);
		}
	}

	private invalidate(tripId?: string, haveHistory?: boolean) {
		this.cache.evict({ id: 'ROOT_QUERY', fieldName: 'trip', ...(tripId ? { args: { tripId, haveHistory: haveHistory ?? false } } : {}) });
		if (tripId && haveHistory === undefined) this.cache.evict({ id: 'ROOT_QUERY', fieldName: 'trip', args: { tripId, haveHistory: true } });
		this.snapshots.clear();
		this.cache.gc();
	}
	private commitRead(tripId: string, haveHistory: boolean, data: TripQueryData) {
		this.cache.writeQuery({ query: GET_TRIP, variables: { tripId, haveHistory }, data });
	}
}
