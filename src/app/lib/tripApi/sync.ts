import { ApolloClient, makeVar } from '@apollo/client';

export const tripSyncFailures = makeVar<readonly string[]>([]);

/** Refresh failures must never turn a successful write into a failed mutation. */
export async function refreshTrip(client: ApolloClient<object>, tripId: string) {
	try {
		const queries = [...client.getObservableQueries('active').values()].filter(
			query => query.queryName === 'GetTrip' && query.variables?.tripId === tripId
		);
		// Also invalidate inactive variants so opening history cannot return stale data.
		for (const haveHistory of [false, true]) {
			client.cache.evict({ id: 'ROOT_QUERY', fieldName: 'trip', args: { tripId, haveHistory }, broadcast: false });
		}
		const results = await Promise.allSettled(queries.map(query => query.refetch()));
		if (results.some(result => result.status === 'rejected' || result.value.error || result.value.errors?.length)) {
			throw new Error('Trip refresh failed');
		}
		tripSyncFailures(tripSyncFailures().filter(id => id !== tripId));
		return true;
	} catch {
		tripSyncFailures([...new Set([...tripSyncFailures(), tripId])]);
		return false;
	}
}
