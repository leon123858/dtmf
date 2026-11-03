import { gql } from '@apollo/client';
import { USER_FIELDS } from './query';

export const SUBSCRIBE_TRIP = gql`
	mutation SubscribeTrip($tripId: ID!) {
		subscribeTrip(tripId: $tripId) { ...UserFields }
	}
	${USER_FIELDS}
`;
export const UNSUBSCRIBE_TRIP = gql`
	mutation UnsubscribeTrip($tripId: ID!) {
		unsubscribeTrip(tripId: $tripId) { ...UserFields }
	}
	${USER_FIELDS}
`;
export const TOUCH_SUBSCRIBED_TRIP = gql`
	mutation TouchSubscribedTrip($tripId: ID!) {
		touchSubscribedTrip(tripId: $tripId) { ...UserFields }
	}
	${USER_FIELDS}
`;

export const UPDATE_PROFILE = gql`
 mutation UpdateProfile($input: UpdateMe!) { updateMe(input: $input) { ...UserFields } }
	${USER_FIELDS}
`;
export const BIND_TRIP = gql`
 mutation BindTrip($tripId: ID!, $addressId: ID) { bind(tripId: $tripId, addressId: $addressId) { ...UserFields } }
	${USER_FIELDS}
`;
export const UNBIND_TRIP = gql`
 mutation UnbindTrip($tripId: ID!) { unbind(tripId: $tripId) { ...UserFields } }
	${USER_FIELDS}
`;
