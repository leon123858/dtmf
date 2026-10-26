'use client';

import { SaveTripInStorage, RenameTripInStorage } from '../lib/storage/trip';
import { authStore } from '../lib/auth/store';
import { useMember } from './MemberProvider';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDomainApis } from '../lib/ApiProvider';
import { TRIP_POLL_INTERVAL } from '../lib/tripApi/public';
import type { Trip } from '@/app/lib/tripApi/types';

export interface TripState {
	data: Trip | null | undefined;
	loading: boolean;
	error: Error | undefined;
	refetch: () => Promise<void>;
}

interface SingleTripContextType {
	tripId: string;
	showHistory: boolean;
	setShowHistory: (value: boolean) => void;
	trip: TripState;
}
export const SingleTripContext = React.createContext<SingleTripContextType | null>(null);

export function SingleTripProvider({ tripId, children }: { tripId: string; children: React.ReactNode }) {
	const { trip: api } = useDomainApis();
	const { user: memberUser, status: memberStatus, mutate: mutateMember, rename: renameMember } = useMember();
	const visited = useRef('');
	const touched = useRef('');
	const [touchError, setTouchError] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const latestRefresh = useRef(0);
	const [status, setStatus] = useState<{ haveHistory: boolean; loading: boolean; error?: Error }>({ haveHistory: false, loading: true });
	const subscribe = useCallback((listener: () => void) => api.subscribe(tripId, listener), [api, tripId]);
	const getSnapshot = useCallback(() => {
		const value = api.getSnapshot(tripId, showHistory);
		// An unavailable mode may fall back to the other cached variant; null is authoritative.
		return value === undefined ? api.getSnapshot(tripId, !showHistory) : value;
	}, [api, tripId, showHistory]);
	const trip = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
	const refreshTrip = useCallback((source: 'foreground' | 'background') => {
		const foreground = source === 'foreground';
		const refresh = foreground ? ++latestRefresh.current : latestRefresh.current;
		if (foreground) setStatus({ haveHistory: showHistory, loading: true });
		return api.refresh({ tripId, haveHistory: showHistory, source }).then(result => {
			if (result === 'skipped' || refresh !== latestRefresh.current) return;
			setStatus(previous => !foreground && previous.loading
				? previous : { haveHistory: showHistory, loading: false });
		}, cause => {
			const error = cause instanceof Error ? cause : new Error(String(cause));
			if (refresh === latestRefresh.current) {
				setStatus(previous => !foreground && previous.loading
					? previous : { haveHistory: showHistory, loading: false, error });
			}
			throw error;
		});
	}, [api, tripId, showHistory]);
	const refetch = useCallback(() => refreshTrip('foreground'), [refreshTrip]);
	useEffect(() => {
		void refetch().catch(() => { });
		const timer = setInterval(() => { void refreshTrip('background').catch(() => { }); }, TRIP_POLL_INTERVAL);
		return () => { clearInterval(timer); latestRefresh.current += 1; };
	}, [refetch, refreshTrip]);
	const name = trip?.name;
	useEffect(() => {
		if (!name || status.loading || status.error) return;
		if (visited.current !== tripId) { visited.current = tripId; SaveTripInStorage({ id: tripId, name }); }
		else RenameTripInStorage(tripId, name);
		renameMember(tripId, name);
	}, [name, tripId, status.loading, status.error, renameMember, memberStatus]);
	const touch = () => {
		const session = authStore.getSession();
		return mutateMember('touchSubscribedTrip', tripId).then(() => setTouchError(false)).catch(() => { if (session === authStore.getSession()) setTouchError(true); });
	};
	useEffect(() => {
		if (memberStatus === 'idle') setTouchError(false);
		const session = authStore.getSession();
		const key = `${session}:${tripId}`;
		if (visited.current !== tripId || memberStatus !== 'ready' || touched.current === key) return;
		touched.current = key;
		if (memberUser?.subscribedTrips.some(item => item.id === tripId)) {
			void mutateMember('touchSubscribedTrip', tripId).catch(() => { if (session === authStore.getSession()) setTouchError(true); });
		}
	}, [tripId, memberStatus, memberUser, status.loading, mutateMember]);
	return <SingleTripContext.Provider value={{
		tripId, showHistory, setShowHistory,
		trip: {
			data: trip, loading: status.haveHistory !== showHistory || status.loading,
			error: status.haveHistory === showHistory ? status.error : undefined, refetch
		}
	}}>
		{touchError && <div role='alert'>瀏覽時間同步失敗。<button onClick={() => void touch()}>重試同步瀏覽時間</button></div>}
		{children}
	</SingleTripContext.Provider>;
}
