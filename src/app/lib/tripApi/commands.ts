import type { Draft } from 'immer';
import type { TripEditCommand } from './cache';
import type { Address, AddressSnapshot, RecordSnapshot, TripSnapshot, TripPayload } from './types';

type TripInput = { tripId: string };

export function editTrip(target: TripEditCommand['target'], edit: TripEditCommand['edit']): TripEditCommand {
	return { type: 'trip.edit', target, edit };
}

export function patchTrip({ tripId, value }: TripInput & { value: TripSnapshot }): TripEditCommand {
	return editTrip({ scope: 'trip', tripId }, trip => {
		trip.name = value.name;
		trip.private = value.private ?? trip.private;
	});
}

/** Confirmed record versions preserve history and separately confirmed member names. */
export function upsertRecord({ tripId, value, editedRecordId }: TripInput & {
	value: RecordSnapshot; editedRecordId?: string;
}): TripEditCommand {
	return editTrip({ scope: 'trip', tripId }, (trip, { haveHistory }) => {
		const member = (address: AddressSnapshot) => trip.addresses.find(item => item.id === address.id) ?? {
			id: address.id, name: address.name, useNickname: address.useNickname, __typename: 'Address',
		};
		const incoming = {
			...value, __typename: 'Record',
			prePayAddress: value.prePayAddress && member(value.prePayAddress),
			shouldPayAddress: value.shouldPayAddress?.map(member) ?? null,
		};
		// A repeated or delayed response must not reactivate a known parent version.
		if (trip.records.some(record => record.parentRecordId === incoming.id)) incoming.isActive = false;
		const index = trip.records.findIndex(record => record.id === incoming.id);
		for (const record of trip.records) {
			if (record.id !== incoming.id && (record.id === incoming.parentRecordId || record.id === editedRecordId)) record.isActive = false;
		}
		if (index < 0) trip.records.push(incoming);
		else trip.records[index] = incoming;
		if (!haveHistory) trip.records = trip.records.filter(record => record.isActive && !record.isDeleted);
	});
}

function applyAddress(trip: Draft<TripPayload>, value: AddressSnapshot, insert: boolean) {
	const fields = { id: value.id, name: value.name, useNickname: value.useNickname, __typename: 'Address' };
	const patch = (address: Draft<Address>) => {
		if (address.id === value.id) Object.assign(address, fields);
	};
	for (const address of trip.addresses) patch(address);
	if (insert && !trip.addresses.some(address => address.id === value.id)) {
		trip.addresses.push({ ...fields, bind: null, statistics: null });
	}
	for (const record of trip.records) {
		if (record.prePayAddress) patch(record.prePayAddress);
		record.shouldPayAddress?.forEach(patch);
	}
	for (const tx of trip.moneyShare) {
		tx.input.forEach(payment => patch(payment.address));
		patch(tx.output.address);
	}
}

export function addAddress({ tripId, value }: TripInput & { value: AddressSnapshot }): TripEditCommand {
	return editTrip({ scope: 'trip', tripId }, trip => { applyAddress(trip, value, true); });
}

export function patchAddress({ tripId, value }: TripInput & { value: AddressSnapshot }): TripEditCommand {
	return editTrip({ scope: 'trip', tripId }, trip => { applyAddress(trip, value, false); });
}

export function removeAddress({ tripId, addressId }: TripInput & { addressId: string }): TripEditCommand {
	return editTrip({ scope: 'trip', tripId }, trip => {
		// Historical records and settlement snapshots retain their member references.
		trip.addresses = trip.addresses.filter(address => address.id !== addressId);
	});
}
