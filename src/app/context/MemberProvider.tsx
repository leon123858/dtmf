'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { useApiScope } from './ApiProvider';
import { useAuth } from './AuthProvider';
import { UserApi } from '../lib/userApi/client';
import type { MemberApi } from '../lib/userApi/public';
import type { UpdateProfileInput, Operation, User } from '../lib/userApi/types';

interface MemberState {
	status: 'idle' | 'loading' | 'ready' | 'error';
	pending: number;
	error: string | null;
}
interface MemberContextValue extends MemberState {
	user: User | null;
	retry: () => Promise<void>;
	mutate: (
		operation: Operation,
		tripId: string,
		name?: string
	) => Promise<void>;
	refreshAccount: () => Promise<void>;
	updateProfile: (input: UpdateProfileInput) => Promise<void>;
	bind: (tripId: string, addressId?: string | null) => Promise<void>;
	unbind: (tripId: string) => Promise<void>;
	rename: (tripId: string, name: string) => void;
}
const initial: MemberState = { status: 'idle', pending: 0, error: null };
const MemberContext = createContext<MemberContextValue | null>(null);

export function MemberProvider({ children }: { children: ReactNode }) {
	const { scope } = useApiScope();
	const auth = useAuth();
	const { isCurrent: isAuthCurrent } = auth;
	const apiRef = useRef<MemberApi | null>(null);
	const [api, setApi] = useState<MemberApi | null>(null);
	const subscribe = useCallback(
		(listener: () => void) => api?.subscribe(listener) ?? (() => {}),
		[api]
	);
	const getSnapshot = useCallback(() => api?.getSnapshot() ?? null, [api]);
	const user = useSyncExternalStore(subscribe, getSnapshot, () => null);
	const [state, setState] = useState(initial);
	const stateRef = useRef(state);
	const session = useRef('');
	const active = useRef(false);
	const loading = useRef<Promise<void> | null>(null);
	const set = useCallback((patch: Partial<MemberState>) => {
		stateRef.current = { ...stateRef.current, ...patch };
		setState(stateRef.current);
	}, []);
	const isCurrent = useCallback(
		(generation: string) =>
			active.current &&
			generation === session.current &&
			isAuthCurrent(generation),
		[isAuthCurrent]
	);
	const retry = useCallback((): Promise<void> => {
		if (loading.current) return loading.current;
		const generation = session.current;
		if (!isCurrent(generation) || !apiRef.current) return Promise.resolve();
		set({ status: 'loading', error: null });
		const currentApi = apiRef.current!;
		const request = currentApi
			.initialize()
			.then(() => {
				if (!isCurrent(generation) || apiRef.current !== currentApi) return;
				set({ status: 'ready' });
			})
			.catch(() => {
				if (isCurrent(generation) && apiRef.current === currentApi)
					set({
						status: 'error',
						error: '會員收藏載入失敗，仍可查看本機歷史。',
					});
			})
			.finally(() => {
				if (loading.current === request) loading.current = null;
			});
		loading.current = request;
		return request;
	}, [isCurrent, set]);
	useEffect(() => {
		active.current = true;
		session.current = scope?.identity ?? '';
		loading.current = null;
		set(initial);
		const next =
			scope && auth.status === 'authenticated'
				? new UserApi(
						scope.client,
						() => scope.isCurrent(),
						scope.domain,
						scope.lock
					)
				: null;
		apiRef.current = next;
		setApi(next);
		if (next) void retry();
		return () => {
			active.current = false;
			next?.dispose();
			apiRef.current = null;
		};
	}, [scope, auth.status, retry, set]);
	const mutate = useCallback(
		(operation: Operation, tripId: string, name?: string): Promise<void> => {
			const generation = session.current;
			if (!isCurrent(generation) || stateRef.current.status !== 'ready')
				return Promise.reject(new Error('請先完成會員載入。'));
			const lastViewedAt = String(Date.now());
			const currentApi = apiRef.current!;
			set({ pending: stateRef.current.pending + 1, error: null });
			const request = (async () => {
				if (!isCurrent(generation) || apiRef.current !== currentApi)
					throw new Error('登入已變更。');
				if (operation === 'subscribeTrip')
					await currentApi.subscribeTrip({
						tripId,
						name: name ?? '',
						lastViewedAt,
					});
				else if (operation === 'touchSubscribedTrip')
					await currentApi.touchSubscribedTrip({ tripId, lastViewedAt });
				else await currentApi.unsubscribeTrip(tripId);
			})()
				.catch((error) => {
					if (isCurrent(generation) && apiRef.current === currentApi)
						set({ error: '收藏同步失敗，請重試。' });
					throw error;
				})
				.finally(() => {
					if (isCurrent(generation) && apiRef.current === currentApi)
						set({ pending: Math.max(0, stateRef.current.pending - 1) });
				});
			return request;
		},
		[isCurrent, set]
	);
	const identity = useCallback(
		(operation: (api: MemberApi) => Promise<void>): Promise<void> => {
			const currentApi = apiRef.current;
			const generation = session.current;
			if (
				!currentApi ||
				!isCurrent(generation) ||
				stateRef.current.status !== 'ready'
			)
				return Promise.reject(new Error('請先完成會員載入。'));
			set({ pending: stateRef.current.pending + 1 });
			const request = (() => {
				if (!isCurrent(generation) || apiRef.current !== currentApi)
					throw new Error('登入已變更。');
				return operation(currentApi);
			})().finally(() => {
				if (isCurrent(generation) && apiRef.current === currentApi)
					set({ pending: Math.max(0, stateRef.current.pending - 1) });
			});
			return request;
		},
		[isCurrent, set]
	);
	const refreshAccount = useCallback(
		() => identity((current) => current.initialize()),
		[identity]
	);
	const updateProfile = useCallback(
		(input: UpdateProfileInput) =>
			identity((current) => current.updateProfile(input)),
		[identity]
	);
	const bind = useCallback(
		(tripId: string, addressId?: string | null) =>
			identity((current) => current.bind(tripId, addressId)),
		[identity]
	);
	const unbind = useCallback(
		(tripId: string) => identity((current) => current.unbind(tripId)),
		[identity]
	);
	const rename = useCallback((tripId: string, name: string) => {
		apiRef.current?.renameTrip(tripId, name);
	}, []);
	return (
		<MemberContext.Provider
			value={{
				...state,
				status:
					!scope || auth.status !== 'authenticated'
						? 'idle'
						: state.status === 'ready' && !user
							? 'loading'
							: state.status,
				user:
					scope &&
					scope.identity === session.current &&
					state.status === 'ready' &&
					isCurrent(session.current)
						? user
						: null,
				retry,
				mutate,
				rename,
				refreshAccount,
				updateProfile,
				bind,
				unbind,
			}}
		>
			{children}
		</MemberContext.Provider>
	);
}

export function useMember() {
	const context = useContext(MemberContext);
	if (!context) throw new Error('MemberProvider is required');
	return context;
}
