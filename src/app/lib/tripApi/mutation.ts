import { gql } from '@apollo/client';

const RECORD_FIELDS = gql`
	fragment RecordFields on RecordSnapshot {
		id
		name
		amount
		prePayAddress { id name useNickname }
		time
		shouldPayAddress { id name useNickname }
		extendPayMsg
		category
		isValid
		isDeleted
		isActive
		parentRecordId
	}
`;
export const CREATE_TRIP = gql`
	mutation CreateTrip($input: NewTrip!) {
		createTrip(input: $input) { id }
	}
`;

export const UPDATE_TRIP = gql`
	mutation UpdateTrip($tripId: ID!, $input: EditTrip!) {
		updateTrip(tripId: $tripId, input: $input) { id name private }
	}
`;

export const CREATE_RECORD = gql`
	${RECORD_FIELDS}
	mutation CreateRecord($tripId: ID!, $input: NewRecord!) {
		createRecord(tripId: $tripId, input: $input) { ...RecordFields }
	}
`;

export const UPDATE_RECORD = gql`
	${RECORD_FIELDS}
	mutation UpdateRecord($recordId: ID!, $input: EditRecord!) {
		updateRecord(recordId: $recordId, input: $input) { ...RecordFields }
	}
`;


export const CREATE_ADDRESS = gql`
	mutation CreateAddress($tripId: ID!, $input: NewAddress!, $bindToMe: Boolean! = false) {
		createAddress(tripId: $tripId, input: $input, bindToMe: $bindToMe) { id name useNickname }
	}
`;

export const UPDATE_ADDRESS = gql`
	mutation UpdateAddress($tripId: ID!, $addressId: ID!, $input: NewAddress!) {
		updateAddress(tripId: $tripId, addressId: $addressId, input: $input) { id name useNickname }
	}
`;

export const DELETE_ADDRESS = gql`
	mutation DeleteAddress($tripId: ID!, $addressId: ID!) {
		deleteAddress(tripId: $tripId, addressId: $addressId) { id name useNickname }
	}
`;
