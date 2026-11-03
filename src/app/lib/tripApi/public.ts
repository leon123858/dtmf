import { MyError } from '../errors';
import type { Trip, EditTripInput, NewTripInput, NewRecordInput, EditRecordInput, NewAddressInput } from './types';

export interface UpdateTripInput { tripId: string; input: EditTripInput }
export interface CreateRecordInput { tripId: string; input: NewRecordInput }
export interface UpdateRecordInput { tripId: string; recordId: string; input: EditRecordInput }
export interface CreateAddressInput { tripId: string; input: NewAddressInput; bindToMe?: boolean }
export interface UpdateAddressInput { tripId: string; addressId: string; input: NewAddressInput }
export interface DeleteAddressInput { tripId: string; addressId: string }

export type RefreshTripResult = 'refreshed' | 'skipped';
export interface RefreshTripInput { tripId: string; haveHistory: boolean; source?: 'foreground' | 'background' }

export const TRIP_POLL_INTERVAL = 20_000;
export class TripApiError extends MyError {
	constructor(code: string, message: string) {
		super(code, 0, message);
		this.name = 'TripApiError';
	}
}

/** Domain boundary consumed by providers, hooks and server actions. */
export interface TripService {
	flush(tripId?: string, haveHistory?: boolean): Promise<void>;
	forceRefresh(input: Pick<RefreshTripInput, 'tripId' | 'haveHistory'>): Promise<RefreshTripResult>;
	refresh(input: RefreshTripInput): Promise<RefreshTripResult>;
	getSnapshot(tripId: string, haveHistory: boolean): Trip | null | undefined;
	subscribe(tripId: string, listener: () => void): () => void;
	createTrip(input: NewTripInput): Promise<{ id: string }>;
	updateTrip(input: UpdateTripInput): Promise<void>;
	createRecord(input: CreateRecordInput): Promise<void>;
	updateRecord(input: UpdateRecordInput): Promise<void>;
	createAddress(input: CreateAddressInput): Promise<void>;
	updateAddress(input: UpdateAddressInput): Promise<void>;
	deleteAddress(input: DeleteAddressInput): Promise<void>;
}
