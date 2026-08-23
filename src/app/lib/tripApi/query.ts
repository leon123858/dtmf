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
				prePayAddress { id name }
				time
				shouldPayAddress { id name }
				extendPayMsg
				category
				isValid
			}
			moneyShare {
				input { amount address { id name } }
				output { amount address { id name } }
			}
			addresses { id name }
			isValid
		}
	}
`;
