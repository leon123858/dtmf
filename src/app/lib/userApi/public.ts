import { MyError } from '../errors';
import type { UpdateProfileInput, User } from './types';

export interface FavoriteInput {
	tripId: string;
	lastViewedAt: string;
}

export class UserApiError extends MyError {
	constructor(
		code: string,
		message: string
	) {
		super(code, 0, message);
		this.name = 'UserApiError';
	}
}

/** Domain boundary consumed by MemberProvider. Construction is internal. */
export interface MemberApi {
	initialize(): Promise<void>;
	updateProfile(input: UpdateProfileInput): Promise<void>;
	bind(tripId: string, addressId?: string | null): Promise<void>;
	unbind(tripId: string): Promise<void>;
	subscribeTrip(input: FavoriteInput & { name: string }): Promise<void>;
	unsubscribeTrip(tripId: string): Promise<void>;
	touchSubscribedTrip(input: FavoriteInput): Promise<void>;
	renameTrip(tripId: string, name: string): void;
	getSnapshot(): User | null;
	subscribe(listener: () => void): () => void;
	dispose(): void;
	clear(): void;
}
