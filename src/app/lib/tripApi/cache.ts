import { ApolloCache, InMemoryCache, TypePolicies } from '@apollo/client';
import { GET_TRIP } from './query';
import type { Address, RecordPayload, TripPayload, TripQueryData, UpdateTripMutationData } from './types';

export const tripTypePolicies: TypePolicies = {
	Query: { fields: { trip: { keyArgs: ['tripId', 'haveHistory'], merge: false } } },
	// The two query variants contain different record lists for the same trip.
	Trip: { keyFields: false },
};

export function createTripCache() { return new InMemoryCache({ typePolicies: tripTypePolicies }); }

export type TripChange =
	| { kind: 'trip'; value: UpdateTripMutationData['updateTrip'] }
	| { kind: 'record'; value: RecordPayload; editedRecordId?: string }
	| { kind: 'createAddress' | 'updateAddress' | 'deleteAddress'; value: Address };

/** Apply server-confirmed changes without fabricating a complete, uncached trip. */
export function applyTripChange(trip: TripPayload, haveHistory: boolean, change: TripChange): TripPayload {
	if (change.kind === 'trip') return { ...trip, name: change.value.name };
	if (change.kind === 'record') {
		// Record responses include member snapshots. Keep names from the trip's member list
		// so a slow record mutation cannot undo a separately confirmed member rename.
		const members = new Map(trip.addresses.map(address => [address.id, address]));
		const member = (address: Address) => members.get(address.id) ?? address;
		const incoming = { ...change.value,
			prePayAddress: change.value.prePayAddress && member(change.value.prePayAddress),
			shouldPayAddress: change.value.shouldPayAddress?.map(member) ?? null,
		};
		// A delayed/repeated response must not reactivate a version with a known child.
		const value = trip.records.some(record => record.parentRecordId === incoming.id)
			? { ...incoming, isActive: false } : incoming;
		const records = trip.records.map(record => record.id === value.id ? value
			: record.id === value.parentRecordId || record.id === change.editedRecordId ? { ...record, isActive: false } : record);
		if (!records.some(record => record.id === value.id)) records.push(value);
		return { ...trip, records: haveHistory ? records : records.filter(record => record.isActive && !record.isDeleted) };
	}
	const address = change.value;
	if (change.kind === 'deleteAddress') {
		// Historical records and settlement snapshots still reference removed members.
		return { ...trip, addresses: trip.addresses.filter(item => item.id !== address.id) };
	}
	const replace = (item: Address) => item.id === address.id ? { ...item, ...address } : item;
	const addresses = trip.addresses.map(replace);
	if (change.kind === 'createAddress' && !addresses.some(item => item.id === address.id)) addresses.push(address);
	return {
		...trip, addresses,
		records: trip.records.map(record => ({
			...record,
			prePayAddress: record.prePayAddress && replace(record.prePayAddress),
			shouldPayAddress: record.shouldPayAddress?.map(replace) ?? null,
		})),
		moneyShare: trip.moneyShare.map(tx => ({
			input: tx.input.map(payment => ({ ...payment, address: replace(payment.address) })),
			output: { ...tx.output, address: replace(tx.output.address) },
		})),
	};
}

type Cache = ApolloCache<unknown>;
interface PendingRead { tripId: string; changes: TripChange[] }
const pendingReads = new WeakMap<Cache, Set<PendingRead>>();

export function updateTripCache(cache: Cache, tripId: string, change: TripChange) {
	for (const read of pendingReads.get(cache) ?? []) {
		if (read.tripId === tripId) read.changes.push(change);
	}
	cache.batch({ update(cache) {
		for (const haveHistory of [false, true]) {
			const variables = { tripId, haveHistory };
			const data = cache.readQuery<TripQueryData>({ query: GET_TRIP, variables });
			if (data?.trip) cache.writeQuery({ query: GET_TRIP, variables,
				data: { trip: applyTripChange(data.trip, haveHistory, change) } });
		}
	} });
}

/** Replay writes completed during a slow query before its result enters Apollo cache. */
export function beginTripRead(cache: Cache, tripId: string) {
	const reads = pendingReads.get(cache) ?? new Set<PendingRead>();
	pendingReads.set(cache, reads);
	const read: PendingRead = { tripId, changes: [] };
	reads.add(read);
	return {
		merge(data: TripQueryData, haveHistory: boolean): TripQueryData {
			const trip = data.trip ?? (read.changes.length
				? cache.readQuery<TripQueryData>({ query: GET_TRIP, variables: { tripId, haveHistory } })?.trip : null);
			return { trip: trip ? read.changes.reduce((value, change) => applyTripChange(value, haveHistory, change), trip) : null };
		},
		finish() { reads.delete(read); },
	};
}
