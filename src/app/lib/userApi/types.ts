export interface SubscribedTrip {
	__typename?: "SubscribedTrip";
	id: string;
	name: string;
	lastViewedAt: string;
}

export interface User {
	id: string;
	name: string | null;
	email: string | null;
	subscribedTrips: SubscribedTrip[];
}

export type Operation = 'subscribeTrip' | 'unsubscribeTrip' | 'touchSubscribedTrip';

export interface TripBinding { tripId: string; address: { id: string; name: string; useNickname: boolean } | null }
export interface UpdateProfileInput { name: string }
