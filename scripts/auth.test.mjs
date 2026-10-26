import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import ts from 'typescript';
function loadModules(globals = {}, overrides = {}) {
	const modules = new Map();
	const context = vm.createContext({
		URL, URLSearchParams, TextEncoder, setTimeout, clearTimeout, AbortController, TypeError,
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
				if (Object.hasOwn(overrides, id)) return overrides[id];
				if (!id.startsWith('.')) return require(id);
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
		new MyError('upstream_error', 503),
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
		(await exchangeWithReturnTo('/trip/550e8400-e29b-41d4-a716-446655440000?q=1#tab')).returnTo,
		'/trip/550e8400-e29b-41d4-a716-446655440000?q=1#tab'
	);
});

test('exchange carries its own returnTo through shared completion; refresh needs no returnTo', async () => {
	const expected = '/trip/550e8400-e29b-41d4-a716-446655440000?tab=records#details';
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
		pathname: '/trip/550e8400-e29b-41d4-a716-446655440000',
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
	const { authRestClient } = loadModules({ window })('auth/store');
	authRestClient.loginRedirect('google');
	const loginURL = new URL(destination, location.origin);
	assert.equal(loginURL.pathname, '/backend/auth/google');
	assert.equal(
		loginURL.searchParams.get('returnTo'),
		'/trip/550e8400-e29b-41d4-a716-446655440000?q=a%26b#details'
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
	})('auth/store');
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
	})('auth/store');
	assert.equal((await authRestClient.callRefreshJWT('refresh-1')).idToken, 'id-2');
});

test('REST client rejects malformed exchange bodies before accessing returnTo', async () => {
	for (const body of [null, false, 12, 'invalid', []]) {
		const modules = loadModules({
			fetch: async () => ({ ok: true, json: async () => body }),
		});
		const { authRestClient } = modules('auth/store');
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
	})('auth/store');
	const callback = authRestClient.readLoginOAuthCallback();
	assert.equal(callback.code, 'single-use');
	assert.equal(authRestClient.readLoginOAuthCallback(), callback);
	assert.equal(replacements, 1);
});

test('versioned persistence restores absolute expiry and removes credentials on logout', async () => {
	const values = new Map();
	const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
	const { AuthStore } = loadModules({ window })('auth/store');
	const options = { now: () => 1000, schedule: () => 1, cancel() {}, client: { callExchangeJWT: async () => tokens(), callRefreshJWT: async () => tokens('rotated') } };
	const first = new AuthStore(options);
	await first.getAuthToken('one');
	const persisted = JSON.parse(values.get('dtmf:auth'));
	assert.equal(persisted.version, 1);
	assert.equal(persisted.expiresAt, 181000);
	const restored = new AuthStore(options);
	restored.restore();
	assert.equal(restored.getSnapshot().idToken, 'id-1');
	assert.equal(restored.getSnapshot().expiresAt, 181000);
	await restored.refreshAuthToken();
	assert.equal(JSON.parse(values.get('dtmf:auth')).refreshToken, 'refresh-rotated');
	restored.logout();
	assert.equal(values.has('dtmf:auth'), false);
});

test('broken persistence is anonymous and blocked storage uses memory with notice', async () => {
	for (const raw of ['{', '{}', '{"version":9}', '{"version":1,"idToken":"a","refreshToken":"b","expiresAt":"bad"}']) {
		const { AuthStore } = loadModules({ window: { localStorage: { getItem: () => raw, removeItem() {} } } })('auth/store');
		const store = new AuthStore(); store.restore();
		assert.equal(store.getSnapshot().status, 'anonymous');
	}
	const { AuthStore } = loadModules({ window: { get localStorage() { throw new Error('blocked'); } } })('auth/store');
	const store = new AuthStore({ schedule: () => 1, cancel() {}, client: { callExchangeJWT: async () => tokens(), callRefreshJWT: async () => tokens() } });
	store.restore(); await store.getAuthToken('one');
	assert.equal(store.getSnapshot().status, 'authenticated');
	assert.ok(store.getSnapshot().storageWarning);
});

test('history merges by id, uses account names and newer times without account limit', () => {
	const { mergeHistory } = load('storage/trip');
	const saved = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `account-${i}`, lastViewedAt: String(i + 10) }));
	const result = mergeHistory([{ id: '0', name: 'local', timestamp: 100 }], saved);
	assert.equal(result.length, 25);
	assert.equal(result[0].id, '0');
	assert.equal(result[0].name, 'account-0');
	assert.equal(result[0].timestamp, 100);
	assert.equal(result[0].local, true);
	assert.equal(result[0].saved, true);
	assert.equal(result[1].id, '24');
});

test('HTTP concurrent 401 responses share refresh and retry once with rotated token', async () => {
	let refreshes = 0, requests = 0;
	const modules = loadModules({ window: { localStorage: { removeItem() {}, setItem() {}, getItem() { return null; } } }, Headers,
		fetch: async (_url, init) => {
			requests++;
			return { status: init.headers.get('Authorization') === 'Bearer id-1' ? 401 : 200 };
		} });
	const { authStore } = modules('auth/store');
	await authStore.loginWith(async () => tokens());
	const { authRestClient } = modules('auth/store');
	authRestClient.callRefreshJWT = async () => { refreshes++; await Promise.resolve(); return tokens('2'); };
	const { authenticatedFetch } = modules('auth/fetch');
	const results = await Promise.all([authenticatedFetch('/query'), authenticatedFetch('/query')]);
	assert.equal(refreshes, 1);
	assert.equal(requests, 4);
	assert.ok(results.every(response => response.status === 200));
	authStore.logout();
});

test('user API owns id-only cache updates and exposes domain snapshots', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { CURRENT_USER } = modules('userApi/query');
 const { clearCurrentUser, userTypePolicies } = modules('userApi/cache');
 const calls = [];
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }),
  link: new ApolloLink(operation => new Observable(observer => {
   calls.push(operation.operationName);
   if (operation.operationName !== 'CurrentUser') {
    const selection = operation.query.definitions.find(def => def.kind === 'OperationDefinition').selectionSet.selections[0].selectionSet.selections;
    assert.deepEqual(selection.map(field => field.name.value).filter(name => name !== '__typename'), ['id']);
   }
   const field = operation.operationName === 'CurrentUser' ? 'me' : operation.operationName[0].toLowerCase() + operation.operationName.slice(1);
   observer.next({ data: { [field]: { __typename: 'User', id: 'user', ...(operation.operationName === 'CurrentUser' ? { subscribedTrips: [{ __typename: 'SubscribedTrip', id: operation.variables.tripId || 'initial', name: 'trip', lastViewedAt: '1' }] } : {}) } } });
   observer.complete();
  })) });
 const api = new UserApi(client, () => true);
 await api.initialize();
 assert.equal(client.readQuery({ query: CURRENT_USER }).me.subscribedTrips.length, 1);
 await api.subscribeTrip({ tripId: 'next', name: 'new trip', lastViewedAt: '2' });
 assert.equal(api.getSnapshot().subscribedTrips[0].id, 'initial');
 assert.equal(client.readQuery({ query: CURRENT_USER }).me.subscribedTrips[1].id, 'next');
 await api.unsubscribeTrip('next');
 assert.equal(client.readQuery({ query: CURRENT_USER }).me.subscribedTrips.length, 1);
 await api.touchSubscribedTrip({ tripId: 'next', lastViewedAt: '3' });
 assert.deepEqual(calls, ['CurrentUser', 'SubscribeTrip', 'UnsubscribeTrip', 'TouchSubscribedTrip']);
 clearCurrentUser(client.cache);
 assert.equal(client.readQuery({ query: CURRENT_USER }), null);
 client.stop();
});

test('user API rejects GraphQL failures and missing users without changing cache', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { CURRENT_USER } = modules('userApi/query');
 for (const payload of [{ errors: [{ message: 'denied' }] }, { data: { me: null, subscribeTrip: null } }, { data: { me: null, subscribeTrip: {} } }]) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new ApolloLink(() => new Observable(observer => {
   observer.next(payload); observer.complete();
  })) });
  const api = new UserApi(client, () => true);
  await assert.rejects(api.initialize());
  await assert.rejects(api.subscribeTrip({ tripId: 'trip', name: 'Trip', lastViewedAt: '1' }));
  assert.equal(client.readQuery({ query: CURRENT_USER }), null);
  client.stop();
 }
});

test('test-login build flag defaults off and accepts only exact true', () => {
	const source = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
	const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
	for (const value of [undefined, '', 'false', '1', 'TRUE', 'true']) {
		const exports = {};
		vm.runInNewContext(code, { exports, process: { env: { E2E_FRONTEND_ENABLE: value } } });
		assert.equal(exports.default.env.E2E_FRONTEND_ENABLE, value === 'true' ? 'true' : 'false');
		assert.equal(exports.default.distDir, '.next');
	}
});


test('user changes preserve unrelated fields and require initialized matching users', () => {
 const { InMemoryCache } = require('@apollo/client');
 const modules = loadModules();
 const { applyUserChange, updateUserCache, writeCurrentUser } = modules('userApi/cache');
 const { CURRENT_USER } = modules('userApi/query');
 const original = { __typename: 'User', id: 'user', subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'a', name: 'old', lastViewedAt: '1' }] };
 const change = { userId: 'user', tripId: 'b', type: 'subscribe', name: 'new', lastViewedAt: '2' };
 const added = applyUserChange(original, change);
 assert.deepEqual(original.subscribedTrips[0], added.subscribedTrips[0]);
 assert.equal(added.subscribedTrips[1].__typename, 'SubscribedTrip');
 const resubscribed = applyUserChange(added, { ...change, name: 'latest', lastViewedAt: '3' });
 assert.equal(resubscribed.subscribedTrips.length, 2);
 assert.equal(resubscribed.subscribedTrips[1].name, 'latest');
 assert.equal(resubscribed.subscribedTrips[1].lastViewedAt, '3');
 assert.equal(applyUserChange(original, { ...change, type: 'touch' }).subscribedTrips.length, 1);
 assert.equal(JSON.stringify(applyUserChange(original, { ...change, type: 'unsubscribe' })), JSON.stringify(original));
 const renamed = applyUserChange(original, { ...change, type: 'rename', tripId: 'a' });
 assert.equal(renamed.subscribedTrips[0].name, 'new');
 assert.equal(renamed.subscribedTrips[0].lastViewedAt, '1');
 const touched = applyUserChange(original, { ...change, type: 'touch', tripId: 'a' });
 assert.equal(touched.subscribedTrips[0].name, 'old');
 assert.equal(touched.subscribedTrips[0].lastViewedAt, '2');
 assert.equal(applyUserChange(added, { ...change, type: 'unsubscribe' }).subscribedTrips.length, 1);
 assert.strictEqual(applyUserChange(original, { ...change, userId: 'other' }), original);
 const cache = new InMemoryCache();
 updateUserCache(cache, change);
 assert.equal(cache.readQuery({ query: CURRENT_USER }), null);
 writeCurrentUser(cache, original);
 updateUserCache(cache, { ...change, userId: 'other' });
 assert.equal(cache.readQuery({ query: CURRENT_USER }).me.subscribedTrips.length, 1);
});


test('user API observations are cache-only, stable, and detachable', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { userTypePolicies } = modules('userApi/cache');
 let queries = 0;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(operation => new Observable(observer => {
  queries++;
  observer.next({ data: { me: { __typename: 'User', id: 'user', subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'trip', name: 'old', lastViewedAt: '1' }] } } });
  observer.complete();
 })) });
 const api = new UserApi(client, () => true);
 let notifications = 0;
 const stop = api.subscribe(() => notifications++);
 assert.equal(queries, 0);
 api.renameTrip('trip', 'latest');
 await api.initialize();
 assert.equal(api.getSnapshot().subscribedTrips[0].name, 'latest');
 assert.equal(api.getSnapshot(), api.getSnapshot());
 assert.ok(notifications > 0);
 stop();
 const before = notifications;
 api.renameTrip('trip', 'newer');
 assert.equal(notifications, before);
 assert.equal(queries, 1);
 assert.equal(api.getSnapshot().subscribedTrips[0].lastViewedAt, '1');
 client.stop();
});

test('user API ignores disposed initialization and rejects mismatched mutation identities', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { writeCurrentUser, userTypePolicies } = modules('userApi/cache');
 let respond;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(operation => new Observable(observer => {
  respond = () => {
   const field = operation.operationName === 'CurrentUser' ? 'me' : 'subscribeTrip';
   observer.next({ data: { [field]: { __typename: 'User', id: 'other', subscribedTrips: [] } } });
   observer.complete();
  };
 })) });
 const api = new UserApi(client, () => true);
 const initialization = api.initialize();
 api.dispose();
 respond();
 await assert.rejects(initialization, error => error.code === 'session-changed');
 assert.equal(api.getSnapshot(), null);
 const next = new UserApi(client, () => true);
 writeCurrentUser(client.cache, { __typename: 'User', id: 'current', subscribedTrips: [] });
 const pending = next.subscribeTrip({ tripId: 'trip', name: 'trip', lastViewedAt: '1' });
 respond();
 await assert.rejects(pending, error => error.code === 'user-mismatch');
 assert.equal(next.getSnapshot().subscribedTrips.length, 0);
 client.stop();
});

test('user API preserves newer names and ignores a mutation completed after disposal', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { writeCurrentUser, userTypePolicies } = modules('userApi/cache');
 let respond;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(() => new Observable(observer => {
  respond = () => { observer.next({ data: { subscribeTrip: { __typename: 'User', id: 'user' } } }); observer.complete(); };
 })) });
 writeCurrentUser(client.cache, { __typename: 'User', id: 'user', subscribedTrips: [] });
 const api = new UserApi(client, () => true);
 const first = api.subscribeTrip({ tripId: 'trip', name: 'old', lastViewedAt: '1' });
 api.renameTrip('trip', 'latest');
 respond();
 await first;
 assert.equal(api.getSnapshot().subscribedTrips[0].name, 'latest');
 const second = api.subscribeTrip({ tripId: 'late', name: 'late', lastViewedAt: '2' });
 api.dispose();
 respond();
 await assert.rejects(second, error => error.code === 'session-changed');
 assert.equal(api.getSnapshot().subscribedTrips.length, 1);
 client.stop();
});


test('server trip APIs isolate caller tokens, stop request clients, and translate 401', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const calls = [];
 let stopped = 0;
 const modules = loadModules({}, {
  '../graphClient/http': { createHttpClient: token => {
   const client = new ApolloClient({ cache: new InMemoryCache(), link: new ApolloLink(operation => new Observable(observer => {
    calls.push({ token, name: operation.variables.input.name });
    if (token === 'expired') observer.error(Object.assign(new Error('unauthorized'), { statusCode: 401 }));
    else { observer.next({ data: { createTrip: { id: token ?? 'anonymous' } } }); observer.complete(); }
   })) });
   const stop = client.stop.bind(client);
   client.stop = () => { stopped++; stop(); };
   return client;
  } },
 });
 const { createServerTripApi } = modules('tripApi/http');
 const results = await Promise.all([
  createServerTripApi('first').createTrip({ name: 'one' }),
  createServerTripApi('second').createTrip({ name: 'two' }),
  createServerTripApi().createTrip({ name: 'anon' }),
 ]);
 assert.equal(JSON.stringify(results), JSON.stringify([{ id: 'first' }, { id: 'second' }, { id: 'anonymous' }]));
 await assert.rejects(createServerTripApi('expired').createTrip({ name: 'expired' }), error => error.name === 'TripApiError' && error.code === 'unauthenticated');
 assert.deepEqual(calls, [{ token: 'first', name: 'one' }, { token: 'second', name: 'two' }, { token: undefined, name: 'anon' }, { token: 'expired', name: 'expired' }]);
 assert.equal(stopped, 4);
});
