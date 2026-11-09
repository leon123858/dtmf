'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApiScope } from './ApiProvider';
import { TripClient } from '../lib/tripApi/client';
import { createTripStore } from '../lib/tripApi/store';
import { TripApiError, type TripApi } from '../lib/tripApi/public';

interface TripContextValue {
	ready: boolean;
	error: Error | null;
	retry: () => Promise<void>;
	createTrip: (tripId: string, arg: { haveHistory: boolean }) => TripApi;
}
const Context = createContext<TripContextValue | null>(null);
export function TripProvider({ children }: { children: ReactNode }) {
	const { scope, error, retry } = useApiScope();
	const createTrip = useMemo(() => {
		const currentIdentity = () =>
			scope?.isCurrent() ? scope.identity : 'unavailable';
		const service = scope
			? new TripClient(scope.client, currentIdentity, scope.domain, scope.lock)
			: null;
		return (tripId: string, arg: { haveHistory: boolean }) => {
			if (!scope?.isCurrent() || !service)
				throw new TripApiError('api-not-ready', 'API 尚未就緒，請稍後重試。');
			return createTripStore(
				service,
				tripId,
				arg.haveHistory,
				currentIdentity,
				scope.identity
			);
		};
	}, [scope]);
	return (
		<Context.Provider value={{ ready: !!scope, error, retry, createTrip }}>
			{children}
		</Context.Provider>
	);
}
export function useTripApi() {
	const value = useContext(Context);
	if (!value) throw new Error('TripProvider is required');
	return value;
}
