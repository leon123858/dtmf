import { gql } from '@apollo/client';

export const USER_FIELDS = gql`
	fragment UserFields on User {
		id
		subscribedTrips { id name lastViewedAt }
	}
`;

export const CURRENT_USER = gql`
	query CurrentUser {
		me { ...UserFields }
	}
	${USER_FIELDS}
`;
