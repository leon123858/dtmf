import { ApolloCache, ApolloClient, ApolloQueryResult } from '@apollo/client';
import { beginTripRead } from './cache';
import { GET_TRIP } from './query';
import type { TripQueryData, TripQueryVariables } from './types';

export const TRIP_POLL_INTERVAL = 20_000;

type Synchronize = (haveHistory: boolean) => Promise<ApolloQueryResult<TripQueryData>>;
const synchronizers = new WeakMap<ApolloCache<unknown>, Map<string, Synchronize>>();

/** One owner per trip page; readers and mutations never initiate a trip query. */
export function createTripSynchronizer(client: ApolloClient<object>, tripId: string) {
	const trips = synchronizers.get(client.cache) ?? new Map<string, Synchronize>();
	synchronizers.set(client.cache, trips);
	const existingSynchronizer = trips.get(tripId);
	if (existingSynchronizer) return existingSynchronizer;
	const pending = new Map<boolean, { request: number; promise: Promise<ApolloQueryResult<TripQueryData>> }>();
	let latestRequest = 0;
	let committedRequest = 0;
	const synchronize: Synchronize = haveHistory => {
		const existing = pending.get(haveHistory);
		if (existing?.request === latestRequest) return existing.promise;
		const request = ++latestRequest;
		const read = beginTripRead(client.cache, tripId);
		const variables = { tripId, haveHistory };
		const promise = client.query<TripQueryData, TripQueryVariables>({
			query: GET_TRIP, variables,
			// Write only after reconciling mutations that finished while this query ran.
			fetchPolicy: 'no-cache',
			// Only the current generation is coalesced above; Apollo must not reuse an older one.
			context: { queryDeduplication: false },
		}).then(result => {
			const data = read.merge(result.data, haveHistory);
			// A response from a previous mode must not overwrite newer normalized entities.
			if (request > committedRequest) {
				client.cache.writeQuery({ query: GET_TRIP, variables, data });
				committedRequest = request;
			}
			return { ...result, data };
		}).finally(() => {
			read.finish();
			if (pending.get(haveHistory)?.request === request) pending.delete(haveHistory);
		});
		pending.set(haveHistory, { request, promise });
		return promise;
	};
	// Preserve request ordering if the page unmounts and re-enters during a slow query.
	trips.set(tripId, synchronize);
	return synchronize;
}
