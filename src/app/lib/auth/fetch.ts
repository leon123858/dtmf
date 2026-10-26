import { authStore } from './store';

// Server calls carry explicit request-local headers and never read browser identity.
export const authenticatedFetch: typeof fetch = async (input, init) => {
	if (typeof window === 'undefined') return fetch(input, init);
	authStore.restore();
	const session = authStore.getSession();
	const token = await authStore.getValidIdToken();
	if (session !== authStore.getSession())
		throw new Error('登入已變更，請重試。');
	if (authStore.getSnapshot().status === 'authenticated' && !token)
		throw new Error('登入暫時無法更新，請重試。');
	const send = (value: string | null) => {
		const headers = new Headers(init?.headers);
		if (value) headers.set('Authorization', `Bearer ${value}`);
		else headers.delete('Authorization');
		return fetch(input, { ...init, headers });
	};
	const response = await send(token);
	if (response.status !== 401 || !token || session !== authStore.getSession()) {
		// general error (not from auth, response directly)
		return response;
	}
	if (
		authStore.getSnapshot().idToken === token &&
		!(await authStore.refreshAuthToken())
	) {
		// Another request may already have rotated the rejected token.
		return response;
	}
	if (session !== authStore.getSession()) {
		// current login have be logout
		return response;
	}

	const retryToken = await authStore.getValidIdToken();
	if (!retryToken || session !== authStore.getSession()) return response;
	return send(retryToken);
};
