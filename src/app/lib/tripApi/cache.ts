import { ApolloCache, InMemoryCache, TypePolicies } from '@apollo/client';
import { GET_TRIP } from './query';
import { TRIP_POLL_INTERVAL, type RefreshTripInput, type RefreshTripResult } from './public';
import { normalizeTrip } from './recordInput';
import type { Trip } from './types';
import type {
	Address,
	AddressSnapshot,
	RecordSnapshot,
	TripPayload,
	TripQueryData,
	UpdateTripMutationData,
} from './types';

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

export type TripChange =
	| { kind: 'trip'; value: UpdateTripMutationData['updateTrip'] }
	| { kind: 'record'; value: RecordSnapshot; editedRecordId?: string }
	| {
			kind: 'createAddress' | 'updateAddress' | 'deleteAddress';
			value: AddressSnapshot;
	  };

/** Apply server-confirmed changes without fabricating a complete, uncached trip. */
export function applyTripChange(
	trip: TripPayload,
	haveHistory: boolean,
	change: TripChange
): TripPayload {
	switch (change.kind) {
		case 'trip':
			return { ...trip, name: change.value.name };

		case 'record': {
			// Record responses include member snapshots. Keep names from the trip's member list
			// so a slow record mutation cannot undo a separately confirmed member rename.
			const members = new Map(
				trip.addresses.map((address) => [address.id, address])
			);
			const member = (address: AddressSnapshot) =>
				members.get(address.id) ?? {
					id: address.id,
					name: address.name,
					__typename: 'Address',
				};
			const incoming = {
				...change.value,
				__typename: 'Record',
				prePayAddress:
					change.value.prePayAddress && member(change.value.prePayAddress),
				shouldPayAddress: change.value.shouldPayAddress?.map(member) ?? null,
			};
			// A delayed/repeated response must not reactivate a version with a known child.
			const value = trip.records.some(
				(record) => record.parentRecordId === incoming.id
			)
				? { ...incoming, isActive: false }
				: incoming;
			const records = trip.records.map((record) =>
				record.id === value.id
					? value
					: record.id === value.parentRecordId ||
						  record.id === change.editedRecordId
						? { ...record, isActive: false }
						: record
			);
			if (!records.some((record) => record.id === value.id)) records.push(value);
			return {
				...trip,
				records: haveHistory
					? records
					: records.filter((record) => record.isActive && !record.isDeleted),
			};
		}

		case 'deleteAddress': {
			// Historical records and settlement snapshots still reference removed members.
			return {
				...trip,
				addresses: trip.addresses.filter((item) => item.id !== change.value.id),
			};
		}

		case 'createAddress':
		case 'updateAddress': {
			const address = {
				id: change.value.id,
				name: change.value.name,
				__typename: 'Address',
			};
			const replace = (item: Address) =>
				item.id === address.id ? { ...item, ...address } : item;
			const addresses = trip.addresses.map(replace);
			if (
				change.kind === 'createAddress' &&
				!addresses.some((item) => item.id === address.id)
			)
				addresses.push({ ...address, statistics: null });
			return {
				...trip,
				addresses,
				records: trip.records.map((record) => ({
					...record,
					prePayAddress: record.prePayAddress && replace(record.prePayAddress),
					shouldPayAddress: record.shouldPayAddress?.map(replace) ?? null,
				})),
				moneyShare: trip.moneyShare.map((tx) => ({
					input: tx.input.map((payment) => ({
						...payment,
						address: replace(payment.address),
					})),
					output: { ...tx.output, address: replace(tx.output.address) },
				})),
			};
		}
	}
}

type Cache = ApolloCache<unknown>;
type ActiveOperation =
	| { kind: 'mutation' }
	| { kind: 'refresh'; haveHistory: boolean; promise: Promise<RefreshTripResult> };

/** One trip's operation queue, active reader, and polling eligibility. */
class TripLock {
	private active?: ActiveOperation;
	private readonly queue: Array<() => void> = [];
	private refreshAt?: number;
	private backgroundPending = false;

	isPromiseCanMerge(input: RefreshTripInput): boolean {
		return this.active?.kind === 'refresh' && this.active.haveHistory === input.haveHistory;
	}

	private isPromiseCanSkip(input: RefreshTripInput): boolean {
		return input.source === 'background' && (this.backgroundPending || this.isRefreshRecent());
	}

	private isRefreshRecent(): boolean {
		return this.refreshAt !== undefined && Date.now() - this.refreshAt < TRIP_POLL_INTERVAL;
	}

	/** Only the active refresh can be joined, even with writers waiting. */
	runRefresh(input: RefreshTripInput, operation: () => Promise<void>): Promise<RefreshTripResult> {
		if (this.isPromiseCanMerge(input)) {
			const active = this.active as Extract<ActiveOperation, { kind: 'refresh' }>;
			return active.promise;
		}
		if (this.isPromiseCanSkip(input)) return Promise.resolve('skipped');
		const background = input.source === 'background';
		if (background) this.backgroundPending = true;
		return this.enqueue<RefreshTripResult>(async () => {
			try {
				// A foreground refresh may have finished while this poll waited.
				if (background && this.isRefreshRecent()) return 'skipped';
				try { await operation(); return 'refreshed'; }
				finally { this.refreshAt = Date.now(); }
			} finally {
				if (background) this.backgroundPending = false;
			}
		}, promise => ({ kind: 'refresh', haveHistory: input.haveHistory, promise }));
	}

	runMutation(operation: () => Promise<void>): Promise<void> {
		return this.enqueue(operation, () => ({ kind: 'mutation' }));
	}

	private enqueue<T>(operation: () => Promise<T>, active: (promise: Promise<T>) => ActiveOperation): Promise<T> {
		let resolve!: (value: T) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
		const start = () => {
			this.active = active(promise);
			const execute = async () => {
				try { resolve(await operation()); }
				catch (error) { reject(error); }
				finally {
					this.active = undefined;
					this.queue.shift()?.();
				}
			};
			void execute();
		};
		if (this.active) this.queue.push(start);
		else start();
		return promise;
	}
}
const locks = new WeakMap<Cache, Map<string, TripLock>>();

export function updateTripCache(
	cache: Cache,
	tripId: string,
	change: TripChange
) {
	cache.batch({
		update(cache) {
			for (const haveHistory of [false, true]) {
				const variables = { tripId, haveHistory };
				const data = cache.readQuery<TripQueryData>({
					query: GET_TRIP,
					variables,
				});
				if (data?.trip)
					cache.writeQuery({
						query: GET_TRIP,
						variables,
						data: { trip: applyTripChange(data.trip, haveHistory, change) },
					});
			}
		},
	});
}

/** Cache storage and per-trip network-operation coordination. */
export class TripCache {
	private readonly snapshots = new Map<string, { source: TripPayload; value: Trip }>();
	constructor(private readonly cache: Cache) {}
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
	apply(tripId: string, change: TripChange) { updateTripCache(this.cache, tripId, change); }
	private lock(tripId: string): TripLock {
		let trips = locks.get(this.cache);
		if (!trips) { trips = new Map(); locks.set(this.cache, trips); }
		let state = trips.get(tripId);
		if (!state) { state = new TripLock(); trips.set(tripId, state); }
		return state;
	}

	runRefresh(input: RefreshTripInput, operation: () => Promise<void>): Promise<RefreshTripResult> {
		return this.lock(input.tripId).runRefresh(input, operation);
	}

	runMutation(tripId: string, operation: () => Promise<void>): Promise<void> {
		return this.lock(tripId).runMutation(operation);
	}

	commitRead(tripId: string, haveHistory: boolean, data: TripQueryData) {
		this.cache.writeQuery({ query: GET_TRIP, variables: { tripId, haveHistory }, data });
	}
}
