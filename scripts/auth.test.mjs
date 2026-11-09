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
		URL, URLSearchParams, TextEncoder, setTimeout, clearTimeout, AbortController, Error, TypeError,
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
const { MyError, errorMessage } = load('errors');
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
			error.message
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
		assert.equal(store.getSnapshot().error, errorMessage(error instanceof Error ? error.message : String(error)));
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
		const { MyError } = modules('errors');
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

test('user API extracts local changes from full mutation responses and exposes domain snapshots', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { CURRENT_USER } = modules('userApi/query');
 const { userTypePolicies } = modules('userApi/cache');
 const calls = [];
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }),
  link: new ApolloLink(operation => new Observable(observer => {
   calls.push(operation.operationName);

   const field = operation.operationName === 'CurrentUser' ? 'me' : operation.operationName[0].toLowerCase() + operation.operationName.slice(1);
   observer.next({ data: { [field]: { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: [{ __typename: 'SubscribedTrip', id: operation.variables.tripId || 'initial', name: 'trip', lastViewedAt: '1' }] } } });
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
 modules('domainCache').domainCacheFor(client.cache).exec({ type: 'user.clear' });
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
 const { upsertFavorite, touchFavorite, removeFavorite, renameFavorite } = modules('userApi/commands');
 const original = { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'a', name: 'old', lastViewedAt: '1' }] };
 const cache = new InMemoryCache();
 const domain = modules('domainCache').domainCacheFor(cache);
 const input = { userId: 'user', tripId: 'b', name: 'new', lastViewedAt: '2' };
 const apply = (value, command) => {
  domain.exec([{ type: 'user.clear' }, { type: 'user.replace', value }, command]);
  return domain.user.read();
 };
 const added = apply(original, upsertFavorite(input));
 assert.deepEqual(original.subscribedTrips[0], added.subscribedTrips[0]);
 assert.equal(added.subscribedTrips[1].__typename, 'SubscribedTrip');
 const resubscribed = apply(added, upsertFavorite({ ...input, name: 'latest', lastViewedAt: '3' }));
 assert.equal(resubscribed.subscribedTrips.length, 2);
 assert.equal(resubscribed.subscribedTrips[1].name, 'latest');
 assert.equal(resubscribed.subscribedTrips[1].lastViewedAt, '3');
 assert.equal(apply(original, touchFavorite(input)).subscribedTrips.length, 1);
 assert.deepEqual(apply(original, removeFavorite(input)), original);
 const renamed = apply(original, renameFavorite({ ...input, tripId: 'a' }));
 assert.equal(renamed.subscribedTrips[0].name, 'new');
 assert.equal(renamed.subscribedTrips[0].lastViewedAt, '1');
 const touched = apply(original, touchFavorite({ ...input, tripId: 'a' }));
 assert.equal(touched.subscribedTrips[0].name, 'old');
 assert.equal(touched.subscribedTrips[0].lastViewedAt, '2');
 assert.equal(apply(added, removeFavorite(input)).subscribedTrips.length, 1);
 domain.exec({ type: 'user.replace', value: original });
 const before = domain.user.read();
 domain.exec(upsertFavorite({ ...input, userId: 'other' }));
 assert.strictEqual(domain.user.read(), before);
 domain.exec({ type: 'user.clear' });
 domain.exec(upsertFavorite(input));
 assert.equal(domain.user.read(), null);
 domain.exec([{ type: 'user.replace', value: original }, upsertFavorite({ ...input, userId: 'other' })]);
 assert.equal(domain.user.read().subscribedTrips.length, 1);
});


test('user API observations are cache-only, stable, and detachable', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { userTypePolicies } = modules('userApi/cache');
 let queries = 0;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(operation => new Observable(observer => {
  queries++;
  observer.next({ data: { me: { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'trip', name: 'old', lastViewedAt: '1' }] } } });
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
 const { userTypePolicies } = modules('userApi/cache');
 let respond;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(operation => new Observable(observer => {
  respond = () => {
   const field = operation.operationName === 'CurrentUser' ? 'me' : 'subscribeTrip';
   observer.next({ data: { [field]: { __typename: 'User', name: null, email: null, id: 'other', subscribedTrips: [] } } });
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
 modules('domainCache').domainCacheFor(client.cache).exec({ type: 'user.replace', value: { __typename: 'User', name: null, email: null, id: 'current', subscribedTrips: [] } });
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
 const { userTypePolicies } = modules('userApi/cache');
 let respond;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(() => new Observable(observer => {
  respond = () => { observer.next({ data: { subscribeTrip: { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'trip', name: 'old', lastViewedAt: '1' }] } } }); observer.complete(); };
 })) });
 modules('domainCache').domainCacheFor(client.cache).exec({ type: 'user.replace', value: { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: [] } });
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

test('auth errors retain known codes, unknown details and HTTP status', async () => {
 assert.equal(errorMessage('invalid_provider_credential'), '第三方登入驗證失敗，請重新登入。 (invalid_provider_credential)');
 const detail = 'unknown failure ' + 'detail'.repeat(200);
 assert.equal(errorMessage(detail), `登入服務發生錯誤，請重新登入或稍後再試。 (${detail})`);
 const { store } = setup(async () => { throw new MyError(detail, 502); });
 await store.getAuthToken('failed');
 assert.equal(store.getSnapshot().error, new MyError(detail, 502).message);
 await store.loginWith(async () => { throw new MyError('invalid_provider_credential', 401); });
 assert.equal(store.getSnapshot().error, '401: 第三方登入驗證失敗，請重新登入。 (invalid_provider_credential)');
 await store.loginWith(async () => { throw detail; });
 assert.equal(store.getSnapshot().error, errorMessage(detail));
});


test('profile writes retain favorites and omit mail preferences', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { userTypePolicies } = modules('userApi/cache');
 const calls = [];
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(operation => new Observable(observer => {
  calls.push({ operation: operation.operationName, variables: operation.variables });
  const me = { __typename: 'User', id: 'user', name: 'Before', email: null, subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'saved', name: 'Trip', lastViewedAt: '1' }] };
  observer.next({ data: operation.operationName === 'CurrentUser' ? { me } : { updateMe: { __typename: 'User', id: 'user', name: operation.variables.input.name, email: null } } });
  observer.complete();
 })) });
 const api = new UserApi(client, () => true);
 await api.initialize();
 await api.updateProfile({ name: '  🐰  ' });
 assert.equal(api.getSnapshot().name, '  🐰  ');
 assert.equal(api.getSnapshot().subscribedTrips[0].lastViewedAt, '1');
 assert.equal(JSON.stringify(calls[1].variables), JSON.stringify({ input: { name: '  🐰  ' } }));
 client.stop();
});

test('profile and binding business errors retain codes, while old-session failures cannot revoke the new session', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { userTypePolicies } = modules('userApi/cache');
 let respond;
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: userTypePolicies }), link: new ApolloLink(() => new Observable(observer => {
  respond = code => { observer.next({ data: null, errors: [{ message: code, extensions: { code } }] }); observer.complete(); };
 })) });
 modules('domainCache').domainCacheFor(client.cache).exec({ type: 'user.replace', value: { __typename: 'User', id: 'user', name: null, email: null, subscribedTrips: [] } });
 const api = new UserApi(client, () => true);
 const conflict = api.bind('trip', 'address');
 respond('CONFLICT');
 await assert.rejects(conflict, error => error.code === 'CONFLICT');
 const invalid = api.updateProfile({ name: '' });
 respond('BAD_USER_INPUT');
 await assert.rejects(invalid, error => error.code === 'BAD_USER_INPUT');
 const old = api.bind('trip');
 api.dispose();
 respond('FORBIDDEN');
 await assert.rejects(old, error => error.code === 'session-changed');
 client.stop();
});

test('profile names count Unicode code points and reject controls without trimming valid text', () => {
 const { validateName } = loadModules()('utils');
 assert.equal(validateName('🐰'.repeat(100)), null);
 assert.ok(validateName('🐰'.repeat(101)));
 for (const name of ['', '  ', '\u0000', 'name\u007f', 'name\n', 'name\u2028', 'name\u2029']) assert.ok(validateName(name));
 assert.equal(validateName('  小明 🐰  '), null);
});

test('binding writes use the shared client lock and commit only after an active trip refresh', async () => {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { UserApi } = modules('userApi/client');
 const { userTypePolicies } = modules('userApi/cache');
 const { TripClient: TripApi } = modules('tripApi/client');
 const { tripTypePolicies } = modules('tripApi/cache');
 const calls = [];
 const responses = [];
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: { ...tripTypePolicies, ...userTypePolicies } }), link: new ApolloLink(operation => new Observable(observer => {
  calls.push(operation.operationName);
  responses.push(data => { observer.next({ data }); observer.complete(); });
 })) });
 modules('domainCache').domainCacheFor(client.cache).exec({ type: 'user.replace', value: { __typename: 'User', id: 'user', name: null, email: null, subscribedTrips: [] } });
 const tripApi = new TripApi(client);
 const userApi = new UserApi(client, () => true);
 const refresh = tripApi.refresh({ tripId: 'trip', haveHistory: false });
 const binding = userApi.bind('trip');
 assert.deepEqual(calls, ['GetTrip']);
 responses[0]({ trip: { __typename: 'Trip', users: [], id: 'trip', name: 'Trip', private: false, records: [], addresses: [], moneyShare: [], isValid: true } });
 await refresh;
 assert.deepEqual(calls, ['GetTrip', 'BindTrip']);
 responses[1]({ bind: { __typename: 'User', id: 'user' } });
 await binding;
 assert.equal(tripApi.getSnapshot('trip', false).name, 'Trip');
 client.stop();
});

test('trip access identity changes on login completion but stays stable on token refresh', async () => {
 const { store } = setup(async () => tokens());
 const anonymous = store.getAccessIdentity();
 await store.loginWith(async () => tokens());
 const authenticated = store.getAccessIdentity();
 assert.notEqual(authenticated, anonymous);
 assert.equal(store.getAccessIdentity(), authenticated);
 store.logout();
 assert.notEqual(store.getAccessIdentity(), anonymous);
 assert.notEqual(store.getAccessIdentity(), authenticated);
});


function domainNetwork() {
 const { ApolloClient, ApolloLink, InMemoryCache, Observable } = require('@apollo/client');
 const modules = loadModules();
 const { TripClient: TripApi } = modules('tripApi/client');
 const { UserApi } = modules('userApi/client');
 const { domainCacheFor } = modules('domainCache');
 const { tripTypePolicies } = modules('tripApi/cache');
 const { userTypePolicies } = modules('userApi/cache');
 const pending = [];
 const client = new ApolloClient({ cache: new InMemoryCache({ typePolicies: { ...tripTypePolicies, ...userTypePolicies } }), link: new ApolloLink(operation => new Observable(observer => {
  pending.push({ name: operation.operationName, succeed: data => { observer.next({ data }); observer.complete(); }, fail: code => { observer.next({ data: null, errors: [{ message: code, extensions: { code } }] }); observer.complete(); } });
 })) });
 const domain = domainCacheFor(client.cache);
 const user = { __typename: 'User', id: 'user', name: 'Current name', email: 'current@example.test', subscribedTrips: [
  { __typename: 'SubscribedTrip', id: 'trip', name: 'Before', lastViewedAt: '1' },
  { __typename: 'SubscribedTrip', id: 'unrelated', name: 'Keep', lastViewedAt: '2' },
 ] };
 const trip = { __typename: 'Trip', id: 'trip', name: 'Before', private: false, users: [{ __typename: 'BoundUser', userId: 'user', userName: 'Current name' }], addresses: [{ __typename: 'Address', id: 'a', name: 'Current name', useNickname: false, bind: { __typename: 'BoundUser', userId: 'user', userName: 'Current name' }, statistics: null }], records: [], moneyShare: [], isValid: true };
 domain.exec({ type: 'user.replace', value: user });
 domain.exec({ type: 'trip.replace', tripId: 'trip', haveHistory: false, value: trip });
 domain.exec({ type: 'trip.replace', tripId: 'trip', haveHistory: true, value: trip });
 return { client, domain, user, trip, pending, tripApi: new TripApi(client), userApi: new UserApi(client, () => true) };
}

test('API explicitly updates both domains and favorite replies preserve unrelated fields', async () => {
 const { client, domain, user, pending, tripApi, userApi } = domainNetwork();
 const observed = [];
 const stop = domain.trip.subscribe('trip', () => observed.push([domain.trip.read('trip', false)?.name, domain.user.read()?.subscribedTrips[0].name]));
 const rename = tripApi.updateTrip({ tripId: 'trip', input: { name: 'New' } });
 const subscribe = userApi.subscribeTrip({ tripId: 'trip', name: 'Before', lastViewedAt: '5' });
 assert.equal(pending.length, 1); // Both write the same user's favorites.
 pending[0].succeed({ updateTrip: { __typename: 'TripSnapshot', id: 'trip', name: 'New', private: false } });
 await rename;
 assert.ok(observed.length > 0);
 assert.equal(domain.trip.read('trip', false).name, 'New');
 assert.equal(domain.user.read().subscribedTrips[0].name, 'New');
 pending[1].succeed({ subscribeTrip: { ...user, name: 'Stale', email: 'stale@example.test', subscribedTrips: [{ ...user.subscribedTrips[0], lastViewedAt: '99' }] } });
 await subscribe;
 assert.equal(domain.user.read().name, 'Current name');
 assert.equal(domain.user.read().email, 'current@example.test');
 assert.equal(domain.user.read().subscribedTrips[0].name, 'New');
 assert.equal(domain.user.read().subscribedTrips[0].lastViewedAt, '99');
 assert.equal(domain.user.read().subscribedTrips[1].name, 'Keep');
 assert.equal(domain.trip.read('trip', true).name, 'New');
 stop(); client.stop();
});

test('both APIs serialize unrelated mutations and reads through cache commit', async () => {
 const { client, user, trip, pending, tripApi, userApi } = domainNetwork();
 const record = tripApi.createAddress({ tripId: 'trip', input: { name: 'Guest' } });
 const favorite = userApi.unsubscribeTrip('unrelated');
 assert.deepEqual(pending.map(item => item.name), ['CreateAddress']);
 const accountRead = userApi.initialize();
 assert.strictEqual(userApi.initialize(), accountRead);
 const tripRead = tripApi.refresh({ tripId: 'trip', haveHistory: false });
 pending[0].succeed({ createAddress: { __typename: 'AddressSnapshot', id: 'guest', name: 'Guest', useNickname: false } }); await record;
 assert.equal(tripApi.getSnapshot('trip', false).addresses.some(address => address.id === 'guest'), true);
 assert.equal(pending[1].name, 'UnsubscribeTrip');
 assert.equal(pending.length, 2);
 pending[1].succeed({ unsubscribeTrip: user }); await favorite;
 assert.equal(pending[2].name, 'CurrentUser');
 pending[2].succeed({ me: user }); await accountRead;
 assert.equal(pending[3].name, 'GetTrip');
 pending[3].succeed({ trip }); await tripRead;
 client.stop();
});

test('binding keeps snapshots for follow-up refresh; profile invalidation clears derived names', async () => {
 const { client, domain, pending, tripApi, userApi } = domainNetwork();
 const snapshot = tripApi.getSnapshot('trip', false);
 assert.equal(tripApi.getSnapshot('trip', false).addresses[0].bind.userId, 'user');
 assert.equal(tripApi.getSnapshot('trip', false).users[0].userName, 'Current name');
 const binding = userApi.bind('trip');
 pending[0].succeed({ bind: { id: 'user' } }); await binding;
 assert.strictEqual(tripApi.getSnapshot('trip', false), snapshot);
 assert.equal(tripApi.getSnapshot('trip', false).addresses[0].name, 'Current name');
 const profile = userApi.updateProfile({ name: 'Updated' });
 pending[1].succeed({ updateMe: { id: 'user', name: 'Updated', email: null, subscribedTrips: [] } }); await profile;
 assert.equal(domain.user.read().name, 'Updated');
 assert.equal(domain.user.read().email, 'current@example.test');
 assert.equal(domain.user.read().subscribedTrips.length, 2);
 assert.equal(tripApi.getSnapshot('trip', false), undefined);
 assert.equal(tripApi.getSnapshot('trip', true), undefined);
 client.stop();
});

test('clearing protected data queues behind old reads and rejects old reads and queued writes before another request', async () => {
 const { client, domain, user, pending, userApi } = domainNetwork();
 const old = userApi.initialize();
 const queued = userApi.unsubscribeTrip('trip');
 const beforeClear = domain.user.read();
 userApi.clear();
 assert.strictEqual(domain.user.read(), beforeClear);
 const oldRejected = assert.rejects(old, error => error.code === 'session-changed');
 const queuedRejected = assert.rejects(queued, error => error.code === 'session-changed');
 pending[0].succeed({ me: user });
 await Promise.all([oldRejected, queuedRejected]);
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(pending.length, 1);
 assert.equal(domain.user.read(), null);
 client.stop();
});

test('private departure clears both variants immediately; public departure retains snapshots', async () => {
 for (const privateTrip of [false, true]) {
  const { client, domain, pending, trip, userApi } = domainNetwork();
  // The private variant can be inactive and still requires immediate clearing.
  domain.exec({ type: 'trip.replace', tripId: 'trip', haveHistory: true, value: { ...trip, private: privateTrip } });
  const leaving = userApi.unbind('trip');
  assert.ok(domain.trip.read('trip', false));
  pending[0].succeed({ unbind: { id: 'user' } });
  await leaving;
  for (const history of [false, true]) assert.equal(Boolean(domain.trip.read('trip', history)), !privateTrip);
  assert.equal(domain.user.read().subscribedTrips.length, 2);
  assert.equal(pending.length, 1);
  client.stop();
 }
});

test('failed private departure and a response from an old session cannot clear trip snapshots', async () => {
 const { client, domain, trip, pending, userApi } = domainNetwork();
 for (const haveHistory of [false, true]) domain.exec({ type: 'trip.replace', tripId: 'trip', haveHistory, value: { ...trip, private: true } });
 const conflict = userApi.unbind('trip');
 pending[0].fail('CONFLICT');
 await assert.rejects(conflict, error => error.code === 'CONFLICT');
 assert.ok(domain.trip.read('trip', false));
 assert.ok(domain.trip.read('trip', true));
 const leaving = userApi.unbind('trip');
 userApi.dispose();
 pending[1].succeed({ unbind: { id: 'user' } });
 await assert.rejects(leaving, error => error.code === 'session-changed');
 assert.ok(domain.trip.read('trip', false));
 assert.ok(domain.trip.read('trip', true));
 client.stop();
});
