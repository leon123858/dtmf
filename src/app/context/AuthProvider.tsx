'use client';

import {
	createContext,
	useContext,
	useEffect,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { AuthState, AuthStore, authStore } from '../lib/auth/store';
import { authRestClient } from '../lib/auth/authRestClient';

const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
	const state = useSyncExternalStore(
		authStore.subscribe,
		authStore.getSnapshot,
		() => AuthStore.getInitState()
	);
	useEffect(() => {
		const check = () => {
			if (document.visibilityState === 'visible')
				void authStore.checkRefresh();
		};
		window.addEventListener('focus', check);
		document.addEventListener('visibilitychange', check);
		return () => {
			window.removeEventListener('focus', check);
			document.removeEventListener('visibilitychange', check);
		};
	}, []);
	return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export function useAuth() {
	const state = useContext(AuthContext);
	if (!state) throw new Error('AuthProvider is required');
	return {
		...state,
		login: authRestClient.loginRedirect,
		logout: authStore.logout,
		refresh: authStore.refreshAuthToken,
		getValidIdToken: authStore.getValidIdToken,
	};
}
