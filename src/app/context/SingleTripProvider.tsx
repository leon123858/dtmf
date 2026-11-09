'use client';

import { SaveTripInStorage, RenameTripInStorage } from '../lib/storage/trip';
import { MyError } from '../lib/errors';
import { useAuth } from './AuthProvider';
import { useMember } from './MemberProvider';
import React, {
	useCallback,
	useMemo,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react';
import { useTripApi } from './TripProvider';
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

const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;

export function SingleTripProvider({
	tripId,
	children,
}: {
	tripId: string;
	children: React.ReactNode;
}) {
	// APIs and shared context.
	const {
		createTrip,
		ready,
		error: scopeError,
		retry: retryScope,
	} = useTripApi();
	const { identity: session, isCurrent } = useAuth();
	const {
		user: memberUser,
		status: memberStatus,
		mutate: mutateMember,
		rename: renameMember,
		refreshAccount,
	} = useMember();

	const [touchError, setTouchError] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const [status, setStatus] = useState<{
		haveHistory: boolean;
		loading: boolean;
		error?: Error;
	}>({ haveHistory: false, loading: true });

	const api = useMemo(() => {
		return ready ? createTrip(tripId, { haveHistory: showHistory }) : null;
	}, [createTrip, ready, tripId, showHistory]);
	const trip = useSyncExternalStore(
		api?.subscribe ?? emptySubscribe,
		api?.getSnapshot ?? emptySnapshot,
		() => undefined
	);

	// Session, refresh, and visit lifecycle guards.
	const previousSession = useRef(session);
	const blocked = useRef(false);
	const latestRefresh = useRef(0);
	const visited = useRef('');
	const touched = useRef('');

	// Refresh and access-control operations.
	const revoke = useCallback(
		(error: Error) => {
			if (!MyError.isAccessError(error)) return;
			blocked.current = true;
			latestRefresh.current++;
			void api?.flush().catch(() => {});
			setStatus({ haveHistory: showHistory, loading: false, error });
		},
		[api, showHistory]
	);
	const refreshTrip = useCallback(
		(source: 'foreground' | 'background', force = false) => {
			if (!api || (source === 'background' && blocked.current))
				return Promise.resolve();
			const foreground = source === 'foreground';
			const refresh = foreground
				? ++latestRefresh.current
				: latestRefresh.current;
			if (foreground) setStatus({ haveHistory: showHistory, loading: true });
			const request = force ? api.forceRefresh() : api.refresh({ source });
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
		[api, showHistory]
	);
	const refetch = useCallback(
		() => (ready ? refreshTrip('foreground') : retryScope()),
		[ready, refreshTrip, retryScope]
	);
	const synchronize = useCallback(async () => {
		const results = await Promise.allSettled([
			refreshTrip('foreground', true),
			...(memberStatus === 'ready' ? [refreshAccount()] : []),
		]);
		const failure = results.find((result) => result.status === 'rejected');
		if (failure?.status === 'rejected') throw failure.reason;
	}, [refreshTrip, memberStatus, refreshAccount]);

	// Event handler.
	const touch = () => {
		const identity = session;
		return mutateMember('touchSubscribedTrip', tripId)
			.then(() => setTouchError(false))
			.catch((error) => {
				if (isCurrent(identity)) {
					setTouchError(true);
					if (error instanceof Error) revoke(error);
				}
			});
	};

	// Values derived from the trip and member snapshots.
	const name = trip?.name;
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
		loading: !scopeError && (!ready || status.loading),
		error: scopeError ?? (ready ? (status.error ?? null) : null),
		refresh: refetch,
	};

	// Effects run in lifecycle, local-history, then account-visit order.
	useEffect(() => {
		if (!api) return;
		const identity = session;
		if (previousSession.current !== identity) {
			previousSession.current = identity;
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
	useEffect(() => {
		if (!name || status.loading || status.error) return;
		if (visited.current !== tripId) {
			visited.current = tripId;
			SaveTripInStorage({ id: tripId, name });
		} else RenameTripInStorage(tripId, name);
		renameMember(tripId, name);
	}, [name, tripId, status.loading, status.error, renameMember, memberStatus]);
	useEffect(() => {
		if (memberStatus === 'idle') setTouchError(false);
		const identity = session;
		const key = `${identity}:${tripId}`;
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
				if (isCurrent(identity)) {
					setTouchError(true);
					if (error instanceof Error) revoke(error);
				}
			});
		} else if (name && !status.loading && !status.error && !blocked.current) {
			void mutateMember('subscribeTrip', tripId, name).catch((error) => {
				if (isCurrent(identity) && error instanceof Error) revoke(error);
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
		session,
		isCurrent,
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
					loading:
						!scopeError &&
						(!ready || status.haveHistory !== showHistory || status.loading),
					error:
						scopeError ??
						(ready && status.haveHistory === showHistory
							? status.error
							: undefined),
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
