import type { User } from './types';

export interface FavoriteInput {
	tripId: string;
	lastViewedAt: string;
}

export class UserApiError extends Error {
	constructor(
		public readonly code: 'session-changed' | 'user-mismatch' | 'unavailable',
		message: string,
	) {
		super(message);
		this.name = 'UserApiError';
	}
}

/** Domain boundary consumed by MemberProvider. Construction is internal. */
export interface MemberApi {
	initialize(): Promise<void>;
	subscribeTrip(input: FavoriteInput & { name: string }): Promise<void>;
	unsubscribeTrip(tripId: string): Promise<void>;
	touchSubscribedTrip(input: FavoriteInput): Promise<void>;
	renameTrip(tripId: string, name: string): void;
	getSnapshot(): User | null;
	subscribe(listener: () => void): () => void;
	dispose(): void;
	clear(): void;
}
