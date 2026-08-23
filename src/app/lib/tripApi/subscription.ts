import { gql } from '@apollo/client';

const SUB_RECORD_FIELDS = gql`
	fragment SubscriptionRecordFields on Record {
		id
		name
		amount
		prePayAddress { id name }
		time
		shouldPayAddress { id name }
		extendPayMsg
		category
		isValid
	}
`;
export const SUB_RECORD_CREATE = gql`
	${SUB_RECORD_FIELDS}
	subscription SubRecordCreate($tripId: ID!) {
		subRecordCreate(tripId: $tripId) { ...SubscriptionRecordFields }
	}
`;

export const SUB_RECORD_DELETE = gql`
	subscription SubRecordDelete($tripId: ID!) {
		subRecordDelete(tripId: $tripId)
	}
`;

export const SUB_RECORD_UPDATE = gql`
	${SUB_RECORD_FIELDS}
	subscription SubRecordUpdate($tripId: ID!) {
		subRecordUpdate(tripId: $tripId) { ...SubscriptionRecordFields }
	}
`;

export const SUB_ADDRESS_CREATE = gql`
	subscription SubAddressCreate($tripId: ID!) {
		subAddressCreate(tripId: $tripId) { id name }
	}
`;

export const SUB_ADDRESS_UPDATE = gql`
	subscription SubAddressUpdate($tripId: ID!) {
		subAddressUpdate(tripId: $tripId) { id name }
	}
`;

export const SUB_ADDRESS_DELETE = gql`
	subscription SubAddressDelete($tripId: ID!) {
		subAddressDelete(tripId: $tripId) { id name }
	}
`;
