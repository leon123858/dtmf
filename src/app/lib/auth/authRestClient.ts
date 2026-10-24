import { httpCall } from '../utils';
import { MyError } from '../error';

export const AuthBaseURL = '/backend/auth';
export type loginProvider = 'google';

export type ExchangeResponse = {
	idToken: string;
	refreshToken: string;
	expiresIn: number;
	returnTo: string;
};
export type RefreshResponse = Omit<ExchangeResponse, 'returnTo'>;
export type AuthApiErrResponse = { error: string };

class AuthRestClient {
	static callback: { code: string | null; error: string | null } | undefined;

	callExchangeJWT = async (exchangeCode: string) => {
		const ret = await httpCall(`${AuthBaseURL}/exchange`, {
			code: exchangeCode,
		});
		if (!ret || typeof ret !== 'object' || Array.isArray(ret))
			throw new MyError('internal_error');

		ret.returnTo = safeReturnPath(ret.returnTo, window.location.origin);
		return ret;
	};

	callRefreshJWT = async (refreshToken: string) => {
		const ret = (await httpCall(`${AuthBaseURL}/refresh`, {
			refreshToken,
		})) as RefreshResponse;

		return ret;
	};

	loginRedirect(provider: loginProvider) {
		const returnTo = safeReturnPath(
			window.location.pathname + window.location.search + window.location.hash,
			window.location.origin
		);
		const query = new URLSearchParams({ returnTo });
		window.location.assign(`${AuthBaseURL}/${provider}?${query.toString()}`);
	}

	readLoginOAuthCallback() {
		if (!AuthRestClient.callback) {
			// 每次登入的 redirect 確保 callback 會被初始化，所以這是避免二次更新的方案
			const params = new URLSearchParams(window.location.search);
			AuthRestClient.callback = {
				code: params.get('code'),
				error: params.has('error')
					? params.get('error') || 'internal_error'
					: null,
			};
			window.history.replaceState(
				window.history.state,
				'',
				window.location.pathname
			);
		}
		return AuthRestClient.callback;
	}
}

function safeReturnPath(value: unknown, origin: string): string {
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		/[\\\u0000-\u001f\u007f]/.test(value)
	)
		return '/';
	try {
		const url = new URL(value, origin);
		const allowedPage =
			url.pathname === '/' ||
			url.pathname === '/history' ||
			/^\/trip\/[A-Za-z0-9_-]+$/.test(url.pathname);
		// Only return to application pages, never auth/API routes or normalized traversal paths.
		return url.origin === origin &&
			allowedPage &&
			value.split(/[?#]/, 1)[0] === url.pathname
			? url.pathname + url.search + url.hash
			: '/';
	} catch {
		return '/';
	}
}

export const authRestClient = new AuthRestClient();
