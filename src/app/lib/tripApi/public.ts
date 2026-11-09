import { MyError } from '../errors';
import type { Trip, EditTripInput, NewRecordInput, EditRecordInput, NewAddressInput } from './types';

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

/** A parameter-bound, cache-only external store and operation facade. */
export interface TripApi {
 subscribe(listener: () => void): () => void;
 getSnapshot(): Trip | null | undefined;
 flush(): Promise<void>;
 refresh(options?: { source?: 'foreground' | 'background' }): Promise<RefreshTripResult>;
 forceRefresh(): Promise<RefreshTripResult>;
 updateTrip(input: Omit<UpdateTripInput, 'tripId'>): Promise<void>;
 createRecord(input: Omit<CreateRecordInput, 'tripId'>): Promise<void>;
 updateRecord(input: Omit<UpdateRecordInput, 'tripId'>): Promise<void>;
 createAddress(input: Omit<CreateAddressInput, 'tripId'>): Promise<void>;
 updateAddress(input: Omit<UpdateAddressInput, 'tripId'>): Promise<void>;
 deleteAddress(input: Omit<DeleteAddressInput, 'tripId'>): Promise<void>;
}
