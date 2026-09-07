import { gql } from '@apollo/client';

export const GET_TRIP = gql`
	query GetTrip($tripId: ID!, $haveHistory: Boolean! = false) {
		trip(tripId: $tripId, haveHistory: $haveHistory) {
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
				isDeleted
				isActive
				parentRecordId
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
