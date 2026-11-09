'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SingleTripContext, type TripState } from '@/app/context/SingleTripProvider';
import { useTripApi } from '@/app/context/TripProvider';
import type * as T from './public';

export function useTrip(tripId: string, haveHistory = false): TripState {
	const context = useContext(SingleTripContext);
	const data = context?.trip.data;
	const trip = useMemo(() => !data || haveHistory ? data : { ...data, records: data.records.filter(record => record.isActive && !record.isDeleted) }, [data, haveHistory]);
	if (!context || context.tripId !== tripId) throw new Error('useTrip requires the matching SingleTripProvider');
	return { ...context.trip, data: trip };
}

/** React owns operation state; the API owns request validation and cache writes. */
function useOperation<Input>(operation: (input: Input) => Promise<void>) {
	const context = useContext(SingleTripContext);
	const revoke = context?.revoke;
	const [state, setState] = useState<{ loading: boolean; error: Error | null }>({ loading: false, error: null });
	const active = useRef(false);
	const pending = useRef(0);
	const latest = useRef(0);
	useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
	const execute = useCallback(async (input: Input): Promise<void> => {
		const request = ++latest.current;
		pending.current++;
		setState({ loading: true, error: null });
		try { await operation(input); }
		catch (cause) {
			const error = cause instanceof Error ? cause : new Error(String(cause));
			revoke?.(error);
			if (active.current && request === latest.current) setState(current => ({ ...current, error }));
			throw error;
		} finally {
			pending.current--;
			if (active.current) setState(current => ({ ...current, loading: pending.current > 0 }));
		}
	}, [operation, revoke]);
	return { execute, ...state };
}
export function useUpdateTrip() {
	const { createTrip } = useTripApi();
	return useOperation(useCallback((input: T.UpdateTripInput) => createTrip(input.tripId, { haveHistory: false }).updateTrip(input), [createTrip]));
}
export function useCreateRecord(tripId: string) {
	const { createTrip } = useTripApi();
	return useOperation(useCallback((input: Omit<T.CreateRecordInput, 'tripId'>) => createTrip(tripId, { haveHistory: false }).createRecord(input), [createTrip, tripId]));
}
export function useUpdateRecord(tripId: string) {
	const { createTrip } = useTripApi();
	return useOperation(useCallback((input: Omit<T.UpdateRecordInput, 'tripId'>) => createTrip(tripId, { haveHistory: false }).updateRecord(input), [createTrip, tripId]));
}
export function useCreateAddress(tripId: string) {
	const { createTrip } = useTripApi();
	return useOperation(useCallback((input: Omit<T.CreateAddressInput, 'tripId'>) => createTrip(tripId, { haveHistory: false }).createAddress(input), [createTrip, tripId]));
}
export function useUpdateAddress(tripId: string) {
	const { createTrip } = useTripApi();
	return useOperation(useCallback((input: Omit<T.UpdateAddressInput, 'tripId'>) => createTrip(tripId, { haveHistory: false }).updateAddress(input), [createTrip, tripId]));
}
export function useDeleteAddress(tripId: string) {
	const { createTrip } = useTripApi();
	return useOperation(useCallback((input: Omit<T.DeleteAddressInput, 'tripId'>) => createTrip(tripId, { haveHistory: false }).deleteAddress(input), [createTrip, tripId]));
}
