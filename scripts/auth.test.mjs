import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
function loadModules(globals = {}) {
	const modules = new Map();
	const context = vm.createContext({
		URL, URLSearchParams, setTimeout, clearTimeout, AbortController, TypeError,
		fetch: () => assert.fail('unexpected network request'), ...globals,
	});
	function load(url) {
		if (modules.has(url.href)) return modules.get(url.href);
		const exports = {};
		modules.set(url.href, exports);
		const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		}).outputText;
		vm.runInContext('(function(exports, require) {' + compiled + '\n})', context)(
			exports, id => {
				assert.ok(id.startsWith('.'), 'only local dependencies expected');
				return load(new URL(id + '.ts', url));
			}
		);
		return exports;
	}
	return name => load(new URL('../src/app/lib/' + name + '.ts', import.meta.url));
}
const load = loadModules();
const { AuthStore } = load('auth/store');
const { MyError, errorMessage } = load('error');
const tokens = (suffix = '1', expiresIn = 180) => ({
	idToken: `id-${suffix}`,
	refreshToken: `refresh-${suffix}`,
	expiresIn,
});
function setup(request) {
	let time = 1000,
		scheduled;
	const store = new AuthStore({
		client: {
			callExchangeJWT: code => request('exchange', { code }),
			callRefreshJWT: refreshToken => request('refresh', { refreshToken }),
		},
		now: () => time,
		schedule: (fn, delay) => {
			scheduled = { fn, delay };
			return 1;
		},
		cancel: () => {
			scheduled = undefined;
		},
	});
	return {
		store,
		advance: (ms) => {
			time += ms;
		},
		scheduled: () => scheduled,
	};
}
function deferred() {
	let resolve;
	const promise = new Promise((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

test('exchange is single use across simultaneous calls, completion and logout', async () => {
	let calls = 0;
	const { store, scheduled } = setup(async () => {
		calls++;
		return tokens();
	});
	const first = store.getAuthToken('mock-code');
	assert.equal(store.getAuthToken('mock-code'), first);
	assert.equal((await first).returnTo, null);
	assert.equal(store.getSnapshot().expiresAt, 181000);
	assert.equal(scheduled().delay, 120000);
	await store.getAuthToken('mock-code');
	store.logout();
	await store.getAuthToken('mock-code');
	assert.equal(calls, 1);
	assert.equal(store.getSnapshot().idToken, null);
	assert.equal(scheduled(), undefined);
});
test('short token uses half lifetime and scheduled refresh rotates both tokens', async () => {
	let calls = 0;
	const { store, scheduled } = setup(async () => tokens(String(++calls), 20));
	await store.getAuthToken('mock');
	assert.equal(scheduled().delay, 10000);
	scheduled().fn();
	await store.refreshAuthToken();
	assert.equal(store.getSnapshot().idToken, 'id-2');
	assert.equal(store.getSnapshot().refreshToken, 'refresh-2');
});
test('concurrent refresh/check/token access share one request using latest refresh token', async () => {
	const pending = deferred(),
		bodies = [];
	const { store, advance } = setup(async (path, body) => {
		bodies.push({ path, body });
		return path === 'exchange' ? tokens() : pending.promise;
	});
	await store.getAuthToken('mock');
	advance(120000);
	const first = store.refreshAuthToken();
	assert.equal(store.refreshAuthToken(), first);
	const checked = store.checkRefresh(),
		token = store.getValidIdToken();
	pending.resolve(tokens('2'));
	await Promise.all([first, checked]);
	assert.equal(await token, 'id-2');
	assert.equal(bodies.length, 2);
	assert.equal(bodies[1].body.refreshToken, 'refresh-1');
	await store.refreshAuthToken();
	assert.equal(bodies[2].body.refreshToken, 'refresh-2');
});
test('logout discards delayed refresh and exchange responses', async () => {
	for (const phase of ['exchange', 'refresh']) {
		const pending = deferred();
		const { store, scheduled } = setup(async (path) =>
			path === phase ? pending.promise : tokens()
		);
		let work = store.getAuthToken('mock');
		if (phase === 'refresh') {
			await work;
			work = store.refreshAuthToken();
		}
		store.logout();
		pending.resolve(tokens('late'));
		assert.equal(await work, phase === 'exchange' ? null : false);
		assert.equal(store.getSnapshot().status, 'anonymous');
		assert.equal(store.getSnapshot().refreshToken, null);
		assert.equal(scheduled(), undefined);
	}
});
test('401 or invalid refresh token clears credentials', async () => {
	for (const error of [
		new MyError('internal_error', 401),
		new MyError('invalid_refresh_token', 400),
	]) {
		const { store } = setup(async (path) => {
			if (path === 'refresh') throw error;
			return tokens();
		});
		await store.getAuthToken('mock');
		await store.refreshAuthToken();
		assert.equal(store.getSnapshot().idToken, null);
		assert.equal(
			store.getSnapshot().error,
			errorMessage('invalid_refresh_token')
		);
	}
});
test('temporary failures suspend automatic refresh, preserve refresh token and allow manual recovery', async () => {
	for (const error of [
		new Error('private upstream details'),
		new MyError('upstream_error', 502),
		new MyError('upstream_timeout', 504),
	]) {
		let fail = true,
			calls = 0;
		const { store, advance, scheduled } = setup(async (path) => {
			calls++;
			if (path === 'refresh' && fail) throw error;
			return tokens('new');
		});
		await store.getAuthToken('mock');
		await store.refreshAuthToken();
		advance(200000);
		await store.checkRefresh();
		assert.equal(await store.getValidIdToken(), null);
		assert.equal(calls, 2);
		assert.equal(scheduled(), undefined);
		assert.equal(store.getSnapshot().refreshToken, 'refresh-new');
		assert.equal(store.getSnapshot().refreshing, false);
		fail = false;
		assert.equal(await store.refreshAuthToken(), true);
		assert.equal(store.getSnapshot().error, null);
	}
});
test('exchange failure never retries and invalid payloads are rejected', async () => {
	for (const value of [
		null,
		{},
		tokens('bad', -1),
		tokens('bad', Infinity),
		{ ...tokens(), idToken: '' },
	]) {
		let calls = 0;
		const { store } = setup(async () => {
			calls++;
			return value;
		});
		assert.equal(await store.getAuthToken('mock'), null);
		await store.getAuthToken('mock');
		await store.checkRefresh();
		assert.equal(calls, 1);
		assert.equal(store.getSnapshot().idToken, null);
	}
	for (const code of [
		'invalid_login_code',
		'access_denied',
		'invalid_state',
		'invalid_provider_credential',
	]) {
		const { store } = setup(async () => {
			throw new MyError(code, 400);
		});
		await store.getAuthToken('mock');
		assert.equal(store.getSnapshot().error, new MyError(code, 400).message);
	}
});
test('return path rejects external, ambiguous and callback URLs', async () => {
	for (const path of [
		null,
		undefined,
		123,
		{},
		[],
		'https://evil.example',
		'//evil.example',
		'/\\evil.example',
		'/auth/complete?code=mock',
		'/backend/auth/google',
		'/query',
		'/unknown',
		'/trip/../history',
		'/trip/%2e%2e/history',
		'/trip/%2Fexternal',
		'/%2f%2fevil.example',
		'/%5cevil.example',
		'/\n/evil.example',
	])
		assert.equal((await exchangeWithReturnTo(path)).returnTo, '/');
	assert.equal(
		(await exchangeWithReturnTo('/trip/demo?q=1#tab')).returnTo,
		'/trip/demo?q=1#tab'
	);
});

test('exchange carries its own returnTo through shared completion; refresh needs no returnTo', async () => {
	const expected = '/trip/demo?tab=records#details';
	const { store } = setup(async (path) =>
		path === 'exchange'
			? { ...tokens(), returnTo: expected }
			: tokens('rotated')
	);
	const first = store.getAuthToken('mock');
	assert.equal(first, store.getAuthToken('mock'));
	assert.equal((await first).returnTo, expected);
	await store.refreshAuthToken();
	assert.equal(store.getSnapshot().idToken, 'id-rotated');
	assert.equal((await store.getAuthToken('mock')).returnTo, expected);
});

test('missing or malformed returnTo does not prevent login and falls back safely', async () => {
	for (const returnTo of [
		undefined,
		null,
		42,
		{},
		[],
		'https://evil.example',
	]) {
		const { store } = setup(async () => exchangeWithReturnTo(returnTo));
		const result = await store.getAuthToken('mock');
		assert.ok(result);
		assert.equal(store.getSnapshot().status, 'authenticated');
		assert.equal(result.returnTo, '/');
	}
});

test('login encodes pathname, query and hash in returnTo without browser storage', () => {
	let destination;
	const location = {
		pathname: '/trip/demo',
		search: '?q=a%26b',
		hash: '#details',
		origin: 'http://localhost:3000',
		assign: (url) => {
			destination = url;
		},
	};
	const window = {
		location,
		get sessionStorage() {
			assert.fail('auth must not use sessionStorage');
		},
	};
	const { authRestClient } = loadModules({ window })('auth/authRestClient');
	authRestClient.loginRedirect('google');
	const loginURL = new URL(destination, location.origin);
	assert.equal(loginURL.pathname, '/backend/auth/google');
	assert.equal(
		loginURL.searchParams.get('returnTo'),
		'/trip/demo?q=a%26b#details'
	);
	location.pathname = '/auth/complete';
	location.search = '?code=must-not-forward';
	location.hash = '';
	authRestClient.loginRedirect('google');
	assert.equal(
		new URL(destination, location.origin).searchParams.get('returnTo'),
		'/'
	);
	assert.equal(destination.includes('must-not-forward'), false);
});

async function exchangeWithReturnTo(returnTo) {
	const { authRestClient } = loadModules({
		window: { location: { origin: 'http://localhost:3000' } },
		fetch: async () => ({ ok: true, json: async () => ({ ...tokens(), returnTo }) }),
	})('auth/authRestClient');
	return authRestClient.callExchangeJWT('mock');
}

test('snapshots stay stable until state changes and subscriptions are isolated', async () => {
	const { store } = setup(async () => tokens());
	const other = setup(async () => tokens()).store;
	assert.equal(store.getSnapshot(), store.getSnapshot());
	assert.equal(AuthStore.getInitState(), AuthStore.getInitState());
	const before = store.getSnapshot();
	let notifications = 0;
	const unsubscribe = store.subscribe(() => notifications++);
	await other.getAuthToken('other');
	assert.equal(notifications, 0);
	await store.getAuthToken('mock');
	assert.notEqual(store.getSnapshot(), before);
	assert.equal(store.getSnapshot(), store.getSnapshot());
	assert.equal(notifications, 3);
	unsubscribe();
	store.logout();
	assert.equal(notifications, 3);
});

test('checkRefresh waits until due and suspends retries after failure', async () => {
	let calls = 0;
	const { store, advance } = setup(async () => {
		if (++calls > 1) throw new MyError('upstream_error');
		return tokens();
	});
	await store.getAuthToken('mock');
	await store.checkRefresh();
	assert.equal(calls, 1);
	advance(120000);
	await store.checkRefresh();
	assert.equal(calls, 2);
	await store.checkRefresh();
	assert.equal(calls, 2);
	assert.equal(store.getSnapshot().refreshing, false);
});

test('unknown exchange failures reset loading and do not retry the code', async () => {
	for (const error of [new Error('unexpected'), new TypeError('network'), null]) {
		let calls = 0;
		const { store } = setup(async () => { calls++; throw error; });
		assert.equal(await store.getAuthToken('mock'), null);
		assert.equal(store.getSnapshot().status, 'anonymous');
		assert.equal(store.getSnapshot().error, errorMessage('unexpected_front_err'));
		store.logout();
		await store.getAuthToken('mock');
		assert.equal(calls, 1);
	}
});

test('late failures after logout do not overwrite anonymous state', async () => {
	for (const phase of ['exchange', 'refresh']) {
		const pending = deferred();
		const { store } = setup(async path => {
			if (path === phase) { await pending.promise; throw new Error('late'); }
			return tokens();
		});
		let work = store.getAuthToken('mock');
		if (phase === 'refresh') { await work; work = store.refreshAuthToken(); }
		store.logout();
		pending.resolve();
		await work;
		assert.equal(store.getSnapshot().error, null);
		assert.equal(store.getSnapshot().status, 'anonymous');
	}
});

test('REST client uses refresh endpoint and preserves request options', async () => {
	const { authRestClient } = loadModules({
		fetch: async (url, options) => {
			assert.equal(url, '/backend/auth/refresh');
			assert.equal(options.method, 'POST');
			assert.equal(options.credentials, 'omit');
			assert.equal(options.cache, 'no-store');
			assert.equal(options.referrerPolicy, 'no-referrer');
			assert.deepEqual(JSON.parse(options.body), { refreshToken: 'refresh-1' });
			return { ok: true, json: async () => tokens('2') };
		},
	})('auth/authRestClient');
	assert.equal((await authRestClient.callRefreshJWT('refresh-1')).idToken, 'id-2');
});

test('REST client rejects malformed exchange bodies before accessing returnTo', async () => {
	for (const body of [null, false, 12, 'invalid', []]) {
		const modules = loadModules({
			fetch: async () => ({ ok: true, json: async () => body }),
		});
		const { authRestClient } = modules('auth/authRestClient');
		const { MyError } = modules('error');
		await assert.rejects(authRestClient.callExchangeJWT('mock'), error =>
			error instanceof MyError && error.code === 'internal_error');
	}
});

test('HTTP failures distinguish network, timeout and server errors and cancel timers', async () => {
	for (const kind of ['network', 'timeout', 'server', 'unknown']) {
		let callback, cancelled = false;
		const unexpected = new Error('unexpected');
		const modules = loadModules({
			setTimeout: fn => { callback = fn; return 1; },
			clearTimeout: id => { assert.equal(id, 1); cancelled = true; },
			fetch: async () => {
				if (kind === 'timeout') { callback(); throw new Error('aborted'); }
				if (kind === 'network') throw new TypeError('failed to fetch');
				if (kind === 'unknown') throw unexpected;
				return { ok: false, status: 401, json: async () => ({ error: 'invalid_refresh_token' }) };
			},
		});
		const { httpCall } = modules('utils');
		await assert.rejects(httpCall('/test', {}), error => {
			if (kind === 'unknown') return error === unexpected;
			return error.code === ({ network: 'upstream_error', timeout: 'upstream_timeout', server: 'invalid_refresh_token' })[kind];
		});
		assert.equal(cancelled, true);
	}
});

test('OAuth callback is captured once and removed from browser history', () => {
	let replacements = 0;
	const location = { search: '?code=single-use', pathname: '/auth/complete' };
	const { authRestClient } = loadModules({
		window: {
			location,
			history: { state: { test: true }, replaceState: (state, title, url) => {
				replacements++;
				assert.equal(state.test, true);
				assert.equal(url, '/auth/complete');
				location.search = '';
			} },
		},
	})('auth/authRestClient');
	const callback = authRestClient.readLoginOAuthCallback();
	assert.equal(callback.code, 'single-use');
	assert.equal(authRestClient.readLoginOAuthCallback(), callback);
	assert.equal(replacements, 1);
});
