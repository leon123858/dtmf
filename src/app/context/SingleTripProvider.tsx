'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApolloError, ApolloQueryResult, useApolloClient, useQuery } from '@apollo/client';
import { GET_TRIP } from '@/app/lib/tripApi/query';
import { normalizeTrip } from '@/app/lib/tripApi/recordInput';
import { createTripSynchronizer, TRIP_POLL_INTERVAL } from '@/app/lib/tripApi/sync';
import type { Trip, TripQueryData, TripQueryVariables } from '@/app/lib/tripApi/types';

export interface TripState {
	data: Trip | null | undefined;
	loading: boolean;
	error: ApolloError | undefined;
	refetch: () => Promise<ApolloQueryResult<TripQueryData>>;
}

interface SingleTripContextType {
	tripId: string;
	showHistory: boolean;
	setShowHistory: (value: boolean) => void;
	trip: TripState;
}
export const SingleTripContext = React.createContext<SingleTripContextType | null>(null);

export function SingleTripProvider({ tripId, children }: { tripId: string; children: React.ReactNode }) {
	const client = useApolloClient();
	const [showHistory, setShowHistory] = useState(false);
	const synchronize = useMemo(() => createTripSynchronizer(client, tripId), [client, tripId]);
	const latestRefresh = useRef(0);
	const [status, setStatus] = useState<{ haveHistory: boolean; loading: boolean; error?: ApolloError }>({ haveHistory: false, loading: true });
	const { data: currentData } = useQuery<TripQueryData, TripQueryVariables>(GET_TRIP, {
		variables: { tripId, haveHistory: false }, fetchPolicy: 'cache-only',
	});
	const { data: historyData } = useQuery<TripQueryData, TripQueryVariables>(GET_TRIP, {
		variables: { tripId, haveHistory: true }, fetchPolicy: 'cache-only',
	});
	const refetch = useCallback(() => {
		const refresh = ++latestRefresh.current;
		setStatus({ haveHistory: showHistory, loading: true });
		return synchronize(showHistory).then(result => {
			if (refresh === latestRefresh.current) setStatus({ haveHistory: showHistory, loading: false });
			return result;
		}, cause => {
			const error = cause instanceof ApolloError ? cause : new ApolloError({ networkError: cause instanceof Error ? cause : new Error(String(cause)) });
			if (refresh === latestRefresh.current) setStatus({ haveHistory: showHistory, loading: false, error });
			throw error;
		});
	}, [showHistory, synchronize]);
	useEffect(() => {
		void refetch().catch(() => {});
		const timer = setInterval(() => { void refetch().catch(() => {}); }, TRIP_POLL_INTERVAL);
		return () => { clearInterval(timer); latestRefresh.current += 1; };
	}, [refetch]);
	// A failed mode switch still observes live cache updates, not a previousData snapshot.
	const data = showHistory ? historyData : currentData;
	const fallback = showHistory ? currentData : historyData;
	const payload = data?.trip === undefined ? fallback?.trip : data.trip;
	const trip = useMemo(() => payload ? normalizeTrip(payload) : payload, [payload]);
	return <SingleTripContext.Provider value={{ tripId, showHistory, setShowHistory,
		trip: { data: trip, loading: status.haveHistory !== showHistory || status.loading,
			error: status.haveHistory === showHistory ? status.error : undefined, refetch } }}>
		{children}
	</SingleTripContext.Provider>;
}
