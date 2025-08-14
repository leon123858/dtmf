// src/graphql/subscriptions.js
import { gql } from '@apollo/client';

export const SUB_RECORD_CREATE = gql`
	subscription SubRecordCreate($tripId: ID!) {
		subRecordCreate(tripId: $tripId) {
			id
			name
			amount
			prePayAddress
			shouldPayAddress
			extendPayMsg
			category
		}
	}
`;

export const SUB_RECORD_DELETE = gql`
	subscription SubRecordDelete($tripId: ID!) {
		subRecordDelete(tripId: $tripId)
	}
`;

export const SUB_RECORD_UPDATE = gql`
	subscription SubRecordUpdate($tripId: ID!) {
		subRecordUpdate(tripId: $tripId) {
			id
			name
			amount
			prePayAddress
			shouldPayAddress
			extendPayMsg
			category
		}
	}
`;

export const SUB_ADDRESS_CREATE = gql`
	subscription SubAddressCreate($tripId: ID!) {
		subAddressCreate(tripId: $tripId)
	}
`;

export const SUB_ADDRESS_DELETE = gql`
	subscription SubAddressDelete($tripId: ID!) {
		subAddressDelete(tripId: $tripId)
	}
`;
