// src/graphql/queries.js
import { gql } from '@apollo/client';

export const GET_TRIP = gql`
	query GetTrip($tripId: ID!) {
		trip(tripId: $tripId) {
			id
			name
			records {
				id
				name
				amount
				prePayAddress
				time
				shouldPayAddress
				extendPayMsg
				category
				isValid
			}
			moneyShare {
				input {
					amount
					address
				}
				output {
					amount
					address
				}
			}
			addressList
			isValid
		}
	}
`;
