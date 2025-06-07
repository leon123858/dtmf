// src/graphql/mutations.js
import { gql } from '@apollo/client';

export const CREATE_TRIP = gql`
	mutation CreateTrip($input: NewTrip!) {
		createTrip(input: $input) {
			id
		}
	}
`;

export const UPDATE_TRIP = gql`
	mutation UpdateTrip($tripId: ID!, $input: NewTrip!) {
		updateTrip(tripId: $tripId, input: $input) {
			id
			name
		}
	}
`;

export const CREATE_RECORD = gql`
	mutation CreateRecord($tripId: ID!, $input: NewRecord!) {
		createRecord(tripId: $tripId, input: $input) {
			id
			name
			amount
			prePayAddress
			shouldPayAddress
		}
	}
`;

export const UPDATE_RECORD = gql`
	mutation UpdateRecord($recordId: ID!, $input: NewRecord!) {
		updateRecord(recordId: $recordId, input: $input) {
			id
			name
			amount
			prePayAddress
			shouldPayAddress
		}
	}
`;

export const REMOVE_RECORD = gql`
	mutation RemoveRecord($recordId: ID!) {
		removeRecord(recordId: $recordId)
	}
`;

export const CREATE_ADDRESS = gql`
	mutation CreateAddress($tripId: ID!, $address: String!) {
		createAddress(tripId: $tripId, address: $address)
	}
`;

export const DELETE_ADDRESS = gql`
	mutation DeleteAddress($tripId: ID!, $address: String!) {
		deleteAddress(tripId: $tripId, address: $address)
	}
`;
