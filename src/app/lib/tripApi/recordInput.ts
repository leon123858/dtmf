import { Address, NewRecordInput, Record, RecordPayload, Trip, TripPayload } from './types';

// GraphQL permits nulls even though the current backend materializes these fields.
export function normalizeRecord(record: RecordPayload): Record {
	return {
		...record,
		name: record.name ?? '',
		amount: record.amount ?? 0,
		prePayAddress: record.prePayAddress ?? { id: '', name: 'Unknown member', useNickname: false },
		shouldPayAddress: record.shouldPayAddress ?? [],
		extendPayMsg: record.extendPayMsg ?? [],
	};
}

export function normalizeTrip(trip: TripPayload): Trip {
	const names = new Map(trip.addresses.map(address => [address.id,
		address.useNickname === false && address.bind?.userName?.trim()
			? address.bind.userName : address.name]));
	const displayAddress = (address: Address): Address => {
		const name = names.get(address.id) ?? address.name;
		return name === address.name ? address : { ...address, name };
	};
	return {
		...trip,
		addresses: trip.addresses.map(displayAddress),
		records: trip.records.map(value => {
			const record = normalizeRecord(value);
			return { ...record, prePayAddress: displayAddress(record.prePayAddress), shouldPayAddress: record.shouldPayAddress.map(displayAddress) };
		}),
		moneyShare: trip.moneyShare.map(tx => ({
			...tx,
			input: tx.input.map(payment => ({ ...payment, address: displayAddress(payment.address) })),
			output: { ...tx.output, address: displayAddress(tx.output.address) },
		})),
	};
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
