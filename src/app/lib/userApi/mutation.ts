import { gql } from '@apollo/client';

export const SUBSCRIBE_TRIP = gql`
	mutation SubscribeTrip($tripId: ID!) {
		subscribeTrip(tripId: $tripId) { id }
	}
`;
export const UNSUBSCRIBE_TRIP = gql`
	mutation UnsubscribeTrip($tripId: ID!) {
		unsubscribeTrip(tripId: $tripId) { id }
	}
`;
export const TOUCH_SUBSCRIBED_TRIP = gql`
	mutation TouchSubscribedTrip($tripId: ID!) {
		touchSubscribedTrip(tripId: $tripId) { id }
	}
`;
