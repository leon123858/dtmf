export interface SubscribedTrip {
	__typename?: "SubscribedTrip";
	id: string;
	name: string;
	lastViewedAt: string;
}

export interface User {
	id: string;
	subscribedTrips: SubscribedTrip[];
}

export type Operation = 'subscribeTrip' | 'unsubscribeTrip' | 'touchSubscribedTrip';
