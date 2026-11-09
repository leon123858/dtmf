import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

function load(path, declaration) {
 const exports = {};
 let source = readFileSync(new URL(path, import.meta.url), 'utf8');
 if (declaration) {
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = parsed.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === declaration);
  assert.ok(node, `Missing class ${declaration}`);
  source = node.getText(parsed) + `\nexports.${declaration} = ${declaration};`;
 }
 const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 vm.runInNewContext('(function(exports) {' + code + '\n})', {})(exports);
 return exports;
}
const { ScopeBarrier } = load('../src/app/context/ApiProvider.tsx', 'ScopeBarrier');
const { APILock } = load('../src/app/lib/apiLock.ts');
function deferred() {
 let resolve;
 const promise = new Promise(done => { resolve = done; });
 return { promise, resolve };
}

test('scope waits for previous work and clears both domains before new operations', async () => {
 const lock = new APILock();
 const pending = deferred();
 const events = [];
 const previous = lock.update(async () => { events.push('old'); await pending.promise; events.push('old done'); });
 const barrier = new ScopeBarrier(lock, { exec: commands => events.push(...commands.map(command => command.type)) });
 const ready = barrier.enter(() => true).then(ready => {
  assert.equal(ready, true);
  return lock.update(async () => { events.push('new'); });
 });
 assert.deepEqual(events, ['old']);
 pending.resolve();
 await Promise.all([previous, ready]);
 assert.deepEqual(events, ['old', 'old done', 'trip.clear', 'user.clear', 'new']);
});

test('rapid identity changes and cancellation never publish an obsolete scope', async () => {
 const lock = new APILock();
 const pending = deferred();
 const old = lock.update(() => pending.promise);
 const barrier = new ScopeBarrier(lock, { exec() {} });
 let identity = 'first';
 const first = barrier.enter(() => identity === 'first');
 identity = 'second';
 const second = barrier.enter(() => identity === 'second');
 pending.resolve();
 await old;
 assert.equal(await first, false);
 assert.equal(await second, true);
 const cancelled = barrier.enter(() => true);
 barrier.cancel();
 assert.equal(await cancelled, false);
});

test('failed barrier remains unavailable and can be retried with the same lock', async () => {
 const lock = new APILock();
 let fail = true;
 const barrier = new ScopeBarrier(lock, { exec() { if (fail) throw new Error('clear failed'); } });
 await assert.rejects(barrier.enter(() => true), /clear failed/);
 fail = false;
 assert.equal(await barrier.enter(() => true), true);
});

test('retry invalidates existing scope leases immediately and suppresses obsolete failures', async () => {
 const lock = new APILock();
 const barrier = new ScopeBarrier(lock, { exec() {} });
 assert.equal(await barrier.enter(() => true), true);
 const lease = barrier.generation;
 const next = barrier.enter(() => true);
 assert.notEqual(barrier.generation, lease);
 await next;
 const pending = deferred();
 const held = lock.update(() => pending.promise);
 const failures = new ScopeBarrier(lock, { exec() { throw new Error('stale failure'); } });
 const obsolete = failures.enter(() => true);
 failures.cancel();
 pending.resolve();
 await held;
 assert.equal(await obsolete, false);
});

test('SSR keeps children mounted with no scope, no protected snapshots and a rejecting trip factory', async () => {
 const React = await import('react');
 const { renderToString } = await import('react-dom/server');
 const { createRequire } = await import('node:module');
 const require = createRequire(import.meta.url);
 const modules = new Map();
 const never = () => assert.fail('SSR must not initialize domains or clear caches');
 const client = { cache: {} };
 const store = {
  subscribe: () => () => {},
  getSnapshot: () => ({ status: 'authenticated', idToken: 'previous-session' }),
  getAccessIdentity: () => 'previous-session',
  restore: never,
 };
 const overrides = {
  '@apollo/client': { useApolloClient: () => client },
  '../lib/domainCache': { domainCacheFor: () => ({ exec: never }) },
  '../lib/apiLock': { apiLockFor: () => ({ flush: never }) },
  '../components/LoginDialog': { LoginDialog: () => null },
  '../lib/auth/store': { authStore: store, authRestClient: {}, AuthStore: { getInitState: () => ({ status: 'anonymous' }) } },
  '../lib/userApi/client': { UserApi: class { constructor() { never(); } } },
  '../lib/tripApi/client': { TripClient: class { constructor() { never(); } } },
 };
 function loadContext(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const code = ts.transpileModule(readFileSync(new URL('../src/app/context/' + name, import.meta.url), 'utf8'), {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext('(function(exports, require) {' + code + '\n})', {})(exports, id => {
   if (overrides[id]) return overrides[id];
   if (id.startsWith('./')) return loadContext(id.slice(2) + '.tsx');
   if (id === '../lib/tripApi/public') return { TripApiError: class extends Error { constructor(code, message) { super(message); this.code = code; } } };
   if (id === '../lib/tripApi/store') return { createTripStore: never };
   return require(id);
  });
  return exports;
 }
 const { AuthProvider, useAuth } = loadContext('AuthProvider.tsx');
 const { ApiProvider } = loadContext('ApiProvider.tsx');
 const { MemberProvider, useMember } = loadContext('MemberProvider.tsx');
 const { TripProvider, useTripApi } = loadContext('TripProvider.tsx');
 function Child() {
  const auth = useAuth();
  const member = useMember();
  const trip = useTripApi();
  assert.equal(auth.restored, false);
  assert.equal(auth.status, 'anonymous');
  assert.equal(member.user, null);
  assert.equal(trip.ready, false);
  assert.throws(() => trip.createTrip('trip', { haveHistory: false }), error => error.code === 'api-not-ready');
  return React.createElement('div', null, 'page still mounted');
 }
 const html = renderToString(React.createElement(AuthProvider, null,
  React.createElement(ApiProvider, null, React.createElement(MemberProvider, null,
   React.createElement(TripProvider, null, React.createElement(Child))))));
 assert.match(html, /page still mounted/);
 assert.doesNotMatch(html, /previous-session/);
});
