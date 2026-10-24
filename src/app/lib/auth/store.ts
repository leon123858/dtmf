import { authRestClient, type RefreshResponse } from './authRestClient';
import { errorMessage, MyError } from '../error';

export interface Tokens {
	idToken: string;
	refreshToken: string;
	expiresIn: number;
}
export interface ExchangeResponse extends Tokens {
	returnTo: string;
}
export interface LoginResult {
	returnTo: string | null;
}
export interface AuthState {
	idToken: string | null;
	refreshToken: string | null;
	expiresAt: number;
	status: 'anonymous' | 'exchanging' | 'authenticated';
	refreshing: boolean;
	error: string | null;
}

export interface AuthStoreOptions {
	client?: {
		callExchangeJWT: (code: string) => Promise<unknown>;
		callRefreshJWT: (refreshToken: string) => Promise<unknown>;
	};
	now?: () => number;
	schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
	cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

export class AuthStore {
	static initState: AuthState = {
		idToken: null,
		refreshToken: null,
		expiresAt: 0,
		status: 'anonymous',
		refreshing: false,
		error: null,
	};
	private listeners = new Set<() => void>();

	// state
	private timer: ReturnType<typeof setTimeout> | null = null; // 登出時清理
	private state: AuthState;
	private refreshAt: number; // 下次自動更新的時間
	private generation: number; // 跟隨物件生命週期, 每次登出加一
	private refreshReqLock?: Promise<boolean>; // 登出時清理, 避免錯誤
	private getTokenReqLock?: Promise<LoginResult | null>; // 文件生命週期內保留，避免重送一次性 code

	// object
	constructor(private readonly options: AuthStoreOptions = {}) {
		this.timer = null;
		this.state = {
			...AuthStore.initState,
		};
		this.refreshAt = 0;
		this.generation = 0;
		this.refreshReqLock = undefined;
		this.getTokenReqLock = undefined;
	}

	// private
	private getNowDate() {
		return (this.options.now ?? Date.now)();
	}
	private setTimer(callback: () => void, delay: number) {
		this.timer = (this.options.schedule ?? setTimeout)(callback, delay);
	}
	private clearTimer() {
		if (this.timer == null) {
			// 基於保護，可能會強制清 timer 不管是否存在
			return;
		}
		(this.options.cancel ?? clearTimeout)(this.timer);
		this.timer = null;
	}
	private acceptTokens(tokens: unknown): asserts tokens is RefreshResponse {
		if (
			!tokens ||
			typeof tokens !== 'object' ||
			!('idToken' in tokens) ||
			!('refreshToken' in tokens) ||
			!('expiresIn' in tokens) ||
			typeof tokens.idToken !== 'string' ||
			!tokens.idToken ||
			typeof tokens.refreshToken !== 'string' ||
			!tokens.refreshToken ||
			typeof tokens.expiresIn !== 'number' ||
			!Number.isFinite(tokens.expiresIn) ||
			tokens.expiresIn <= 0 ||
			!Number.isFinite(this.getNowDate() + tokens.expiresIn * 1000)
		)
			throw new MyError('internal_error');
		this.clearTimer();
		const duration = tokens.expiresIn * 1000;
		this.refreshAt =
			this.getNowDate() + duration - Math.min(60000, duration / 2);
		this.broadcast({
			idToken: tokens.idToken,
			refreshToken: tokens.refreshToken,
			expiresAt: this.getNowDate() + duration,
			status: 'authenticated',
			refreshing: false,
			error: null,
		});
		this.setTimer(
			() => {
				void this.refreshAuthToken();
			},
			Math.min(2147483647, Math.max(1, this.refreshAt - this.getNowDate()))
		);
	}
	private broadcast = (state: Partial<AuthState>) => {
		this.state = { ...this.state, ...state };
		this.listeners.forEach((fn) => fn());
	};

	// static
	static getInitState() {
		return AuthStore.initState;
	}

	// public
	subscribe = (fn: () => void) => {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	};

	logout = () => {
		this.generation++;
		this.refreshReqLock = undefined;

		this.clearTimer();
		this.broadcast(AuthStore.initState);
	};
	refreshAuthToken = (): Promise<boolean> => {
		if (this.refreshReqLock) return this.refreshReqLock;
		if (!this.state.refreshToken) return Promise.resolve(false);
		const current = this.generation;
		const curRefreshToken = this.state.refreshToken;
		this.clearTimer();
		this.broadcast({ refreshing: true, error: null });

		this.refreshReqLock = Promise.resolve()
			.then(() =>
				(this.options.client ?? authRestClient).callRefreshJWT(curRefreshToken)
			)
			.then((tokens) => {
				if (this.generation !== current) return false;
				this.acceptTokens(tokens);
				return true;
			})
			.catch((error: unknown) => {
				if (this.generation !== current) return false;
				if (
					error instanceof MyError &&
					(error.status === 401 || error.code === 'invalid_refresh_token')
				) {
					this.logout();
					this.broadcast({ error: errorMessage('invalid_refresh_token') });
				} else {
					this.broadcast({
						refreshing: false,
						error:
							error instanceof MyError
								? error.message
								: errorMessage('unexpected_front_err'),
					});
				}
				return false;
			})
			.finally(() => {
				if (this.generation === current) this.refreshReqLock = undefined;
			});
		return this.refreshReqLock;
	};
	getAuthToken = (code: string): Promise<LoginResult | null> => {
		if (this.getTokenReqLock) return this.getTokenReqLock;
		this.logout();
		const current = this.generation;
		this.broadcast({ status: 'exchanging' });
		this.getTokenReqLock = Promise.resolve()
			.then(() => (this.options.client ?? authRestClient).callExchangeJWT(code))
			.then((tokens) => {
				if (this.generation !== current) return null;
				this.acceptTokens(tokens);
				return {
					returnTo:
						'returnTo' in tokens && typeof tokens.returnTo === 'string'
							? tokens.returnTo
							: null,
				};
			})
			.catch((error: unknown) => {
				if (this.generation !== current) {
					return null;
				}
				this.broadcast({
					...AuthStore.getInitState(),
					error:
						error instanceof MyError
							? error.message
							: errorMessage('unexpected_front_err'),
				});
				return null;
			});
		// 不清理 getTokenReqLock 的原因是避免重複取用一次性 token，
		// 反正 OAuth 每次獲取一次性 token 都會透過 redirect，所以前端多次調用都可以給同一個
		return this.getTokenReqLock;
	};
	getSnapshot = () => {
		return this.state;
	};
	checkRefresh = () => {
		if (
			this.state.refreshToken &&
			!this.state.error &&
			this.getNowDate() >= this.refreshAt
		)
			return this.refreshAuthToken();
		return Promise.resolve(null);
	};
	getValidIdToken = async () => {
		if (
			this.state.refreshToken &&
			!this.state.error &&
			this.getNowDate() >= this.refreshAt
		)
			await this.refreshAuthToken();
		return this.state.expiresAt > this.getNowDate() ? this.state.idToken : null;
	};
}

export const authStore = new AuthStore();
