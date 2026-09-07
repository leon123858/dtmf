import { NewRecordInput, Record, RecordPayload, Trip, TripPayload } from './types';

// GraphQL permits nulls even though the current backend materializes these fields.
export function normalizeRecord(record: RecordPayload): Record {
	return {
		...record,
		name: record.name ?? '',
		amount: record.amount ?? 0,
		prePayAddress: record.prePayAddress ?? { id: '', name: 'Unknown member' },
		shouldPayAddress: record.shouldPayAddress ?? [],
		extendPayMsg: record.extendPayMsg ?? [],
	};
}

export function normalizeTrip(trip: TripPayload): Trip {
	return { ...trip, records: trip.records.map(normalizeRecord) };
}

export function recordToInput(record: Record): NewRecordInput {
	return {
		name: record.name,
		amount: record.amount,
		prePayAddressId: record.prePayAddress.id,
		shouldPayAddressIds: record.shouldPayAddress.map(address => address.id),
		time: record.time,
		extendPayMsg: [...record.extendPayMsg],
		category: record.category,
		isDeleted: record.isDeleted,
	};
}
