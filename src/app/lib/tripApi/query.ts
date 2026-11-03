import { gql } from '@apollo/client';

export const GET_TRIP = gql`
	query GetTrip($tripId: ID!, $haveHistory: Boolean! = false) {
		trip(tripId: $tripId, haveHistory: $haveHistory) {
			id
			name
			private
			records {
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
			moneyShare {
				input { amount address { id name useNickname } }
				output { amount address { id name useNickname } }
			}
			users { userId userName }
			addresses { id name useNickname bind { userId userName } statistics { totalExpense totalPrepaid activeRecordCount } }
			isValid
		}
	}
`;
