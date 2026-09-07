import { gql } from '@apollo/client';

const RECORD_FIELDS = gql`
	fragment RecordFields on Record {
		id
		name
		amount
		prePayAddress { id name }
		time
		shouldPayAddress { id name }
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
	mutation UpdateTrip($tripId: ID!, $input: NewTrip!) {
		updateTrip(tripId: $tripId, input: $input) { id name }
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
	mutation CreateAddress($tripId: ID!, $input: NewAddress!) {
		createAddress(tripId: $tripId, input: $input) { id name }
	}
`;

export const UPDATE_ADDRESS = gql`
	mutation UpdateAddress($tripId: ID!, $addressId: ID!, $input: NewAddress!) {
		updateAddress(tripId: $tripId, addressId: $addressId, input: $input) { id name }
	}
`;

export const DELETE_ADDRESS = gql`
	mutation DeleteAddress($tripId: ID!, $addressId: ID!) {
		deleteAddress(tripId: $tripId, addressId: $addressId) { id name }
	}
`;
