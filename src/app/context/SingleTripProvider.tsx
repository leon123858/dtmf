'use client';

import { SaveTripInStorage, RenameTripInStorage } from '../lib/storage/trip';
import { MyError } from '../lib/errors';
import { authStore } from '../lib/auth/store';
import { useMember } from './MemberProvider';
import React, {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
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
	settingsOpen: boolean;
	setSettingsOpen: (value: boolean) => void;
	binding: {
		binding: { address: Trip['addresses'][number] | null } | null | undefined;
		loading: boolean;
		error: Error | null;
		refresh: () => Promise<void>;
	};
	synchronize: () => Promise<void>;
	revoke: (error: Error) => void;
	trip: TripState;
}
export const SingleTripContext =
	React.createContext<SingleTripContextType | null>(null);

export function SingleTripProvider({
	tripId,
	children,
}: {
	tripId: string;
	children: React.ReactNode;
}) {
	const { trip: api } = useDomainApis();
	const {
		user: memberUser,
		status: memberStatus,
		mutate: mutateMember,
		rename: renameMember,
		refreshAccount,
	} = useMember();
	const session = useSyncExternalStore(
		authStore.subscribe,
		authStore.getAccessIdentity,
		() => '0:false'
	);
	const previousSession = useRef(session);
	const blocked = useRef(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const latestRefresh = useRef(0);
	const revoke = useCallback(
		(error: Error) => {
			if (!MyError.isAccessError(error)) return;
			blocked.current = true;
			latestRefresh.current++;
			void api.flush(tripId).catch(() => {});
			setStatus({ haveHistory: showHistory, loading: false, error });
		},
		[api, tripId, showHistory]
	);
	const visited = useRef('');
	const touched = useRef('');
	const [touchError, setTouchError] = useState(false);
	const [status, setStatus] = useState<{
		haveHistory: boolean;
		loading: boolean;
		error?: Error;
	}>({ haveHistory: false, loading: true });
	const subscribe = useCallback(
		(listener: () => void) => api.subscribe(tripId, listener),
		[api, tripId]
	);
	const getSnapshot = useCallback(() => {
		if (previousSession.current !== session) return undefined;
		const value = api.getSnapshot(tripId, showHistory);
		// An unavailable mode may fall back to the other cached variant; null is authoritative.
		return value === undefined ? api.getSnapshot(tripId, !showHistory) : value;
	}, [api, tripId, showHistory, session]);
	const trip = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
	const refreshTrip = useCallback(
		(source: 'foreground' | 'background', force = false) => {
			if (source === 'background' && blocked.current) return Promise.resolve();
			const foreground = source === 'foreground';
			const refresh = foreground
				? ++latestRefresh.current
				: latestRefresh.current;
			if (foreground) setStatus({ haveHistory: showHistory, loading: true });
			const request = force
				? api.forceRefresh({ tripId, haveHistory: showHistory })
				: api.refresh({ tripId, haveHistory: showHistory, source });
			return request.then(
				(result) => {
					if (result === 'skipped' || refresh !== latestRefresh.current) return;
					blocked.current = false;
					setStatus((previous) =>
						!foreground && previous.loading
							? previous
							: { haveHistory: showHistory, loading: false }
					);
				},
				(cause) => {
					const error =
						cause instanceof Error ? cause : new Error(String(cause));
					if (refresh === latestRefresh.current) {
						if (MyError.isAccessError(error)) blocked.current = true;
						setStatus((previous) =>
							!foreground && previous.loading
								? previous
								: { haveHistory: showHistory, loading: false, error }
						);
					}
					throw error;
				}
			);
		},
		[api, tripId, showHistory]
	);
	const refetch = useCallback(() => refreshTrip('foreground'), [refreshTrip]);
	useEffect(() => {
		authStore.restore();
		const identity = authStore.getAccessIdentity();
		if (previousSession.current !== identity) {
			previousSession.current = identity;
			void api.flush().catch(() => {});
			blocked.current = false;
		}
		void refetch().catch(() => {});
		const timer = setInterval(() => {
			void refreshTrip('background').catch(() => {});
		}, TRIP_POLL_INTERVAL);
		return () => {
			clearInterval(timer);
			latestRefresh.current += 1;
		};
	}, [refetch, refreshTrip, session, api]);
	const binding = {
		binding:
			memberStatus !== 'ready' || !trip
				? undefined
				: trip.users.some((user) => user.userId === memberUser?.id)
					? {
							address:
								trip.addresses.find(
									(address) => address.bind?.userId === memberUser?.id
								) ?? null,
						}
					: null,
		loading: status.loading,
		error: status.error ?? null,
		refresh: refetch,
	};
	const synchronize = useCallback(async () => {
		const results = await Promise.allSettled([
			refreshTrip('foreground', true),
			...(memberStatus === 'ready' ? [refreshAccount()] : []),
		]);
		const failure = results.find((result) => result.status === 'rejected');
		if (failure?.status === 'rejected') throw failure.reason;
	}, [refreshTrip, memberStatus, refreshAccount]);
	const name = trip?.name;
	useEffect(() => {
		if (!name || status.loading || status.error) return;
		if (visited.current !== tripId) {
			visited.current = tripId;
			SaveTripInStorage({ id: tripId, name });
		} else RenameTripInStorage(tripId, name);
		renameMember(tripId, name);
	}, [name, tripId, status.loading, status.error, renameMember, memberStatus]);
	const touch = () => {
		const session = authStore.getSession();
		return mutateMember('touchSubscribedTrip', tripId)
			.then(() => setTouchError(false))
			.catch((error) => {
				if (session === authStore.getSession()) {
					setTouchError(true);
					if (error instanceof Error) revoke(error);
				}
			});
	};
	useEffect(() => {
		if (memberStatus === 'idle') setTouchError(false);
		const session = authStore.getSession();
		const key = `${session}:${tripId}`;
		if (
			visited.current !== tripId ||
			!name ||
			status.loading ||
			status.error ||
			blocked.current ||
			memberStatus !== 'ready' ||
			touched.current === key
		)
			return;
		touched.current = key;
		if (memberUser?.subscribedTrips.some((item) => item.id === tripId)) {
			void mutateMember('touchSubscribedTrip', tripId).catch((error) => {
				if (session === authStore.getSession()) {
					setTouchError(true);
					if (error instanceof Error) revoke(error);
				}
			});
		} else if (name && !status.loading && !status.error && !blocked.current) {
			void mutateMember('subscribeTrip', tripId, name).catch((error) => {
				if (session === authStore.getSession() && error instanceof Error)
					revoke(error);
			});
		}
	}, [
		tripId,
		memberStatus,
		memberUser,
		name,
		status.loading,
		status.error,
		mutateMember,
		revoke,
	]);
	return (
		<SingleTripContext.Provider
			value={{
				tripId,
				showHistory,
				setShowHistory,
				settingsOpen,
				setSettingsOpen,
				binding,
				synchronize,
				revoke,
				trip: {
					data: trip,
					loading: status.haveHistory !== showHistory || status.loading,
					error: status.haveHistory === showHistory ? status.error : undefined,
					refetch,
				},
			}}
		>
			{touchError && (
				<div role='alert'>
					瀏覽時間同步失敗。
					<button onClick={() => void touch()}>重試同步瀏覽時間</button>
				</div>
			)}
			{children}
		</SingleTripContext.Provider>
	);
}
