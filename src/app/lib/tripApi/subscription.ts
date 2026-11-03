import { gql } from '@apollo/client';

const SUB_RECORD_FIELDS = gql`
	fragment SubscriptionRecordFields on RecordSnapshot {
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
export const SUB_RECORD_CREATE = gql`
	${SUB_RECORD_FIELDS}
	subscription SubRecordCreate($tripId: ID!) {
		subRecordCreate(tripId: $tripId) { ...SubscriptionRecordFields }
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
		subAddressCreate(tripId: $tripId) { id name useNickname }
	}
`;

export const SUB_ADDRESS_UPDATE = gql`
	subscription SubAddressUpdate($tripId: ID!) {
		subAddressUpdate(tripId: $tripId) { id name useNickname }
	}
`;

export const SUB_ADDRESS_DELETE = gql`
	subscription SubAddressDelete($tripId: ID!) {
		subAddressDelete(tripId: $tripId) { id name useNickname }
	}
`;
