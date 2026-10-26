'use client';

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { AuthState, AuthStore, authStore, authRestClient } from '../lib/auth/store';

import { LoginDialog } from '../components/LoginDialog';
const LoginContext = createContext<() => void>(() => {});
export const useLoginDialog = () => useContext(LoginContext);

const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
	const [loginOpen, setLoginOpen] = useState(false);
	const state = useSyncExternalStore(
		authStore.subscribe,
		authStore.getSnapshot,
		() => AuthStore.getInitState()
	);
	useEffect(() => {
		authStore.restore();
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
	return <AuthContext.Provider value={state}><LoginContext.Provider value={() => setLoginOpen(true)}>{children}<LoginDialog open={loginOpen} close={() => setLoginOpen(false)} /></LoginContext.Provider></AuthContext.Provider>;
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
