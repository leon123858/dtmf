import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { ApolloClient, ApolloLink, Observable } = require('@apollo/client');
const modules = new Map();
let now;
class Clock extends Date { static now() { return now ?? Date.now(); } }
function load(name) {
  name = path.posix.normalize(name);
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/app/lib/tripApi/${name}.ts`, import.meta.url), 'utf8');
  const exports = {};
  modules.set(name, exports);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { Date: Clock, Error, exports, require: id => id.startsWith('.') ? load(path.posix.join(path.posix.dirname(name), id)) : require(id) });
  return exports;
}
const { createTripCache } = load('cache');
const { TripApi } = load('client');
const { domainCacheFor, DomainCache } = load('../domainCache');
const { GET_TRIP } = load('query');
const { patchTrip, upsertRecord, addAddress, patchAddress, removeAddress, editTrip } = load('commands');
const { patchProfile, renameFavorite, editUser } = load('../userApi/commands');
function executeTrip(cache, tripId, command) {
  domainCacheFor(cache).exec({ ...command, target: { ...command.target, tripId } });
}
const alice = { __typename: 'Address', bind: null, useNickname: false, id: 'alice', name: 'Alice', statistics: { totalExpense: 50, totalPrepaid: 100, activeRecordCount: 1 } };
const bob = { __typename: 'Address', bind: null, useNickname: false, id: 'bob', name: 'Bob', statistics: { totalExpense: 50, totalPrepaid: 0, activeRecordCount: 1 } };
const record = (id = 'r1', extra = {}) => ({
  __typename: 'Record', id, name: 'Lunch', amount: 100, prePayAddress: alice,
  shouldPayAddress: [alice, bob], extendPayMsg: [50, 50], category: 'NORMAL',
  time: '1789056000000', isValid: true, isDeleted: false, isActive: true, parentRecordId: null, ...extra,
});
const trip = (extra = {}) => ({
  __typename: 'Trip', users: [], private: false, id: 'trip-1', name: 'Trip', records: [record()], addresses: [alice, bob], isValid: true,
  moneyShare: [{ __typename: 'Tx', input: [{ __typename: 'Payment', amount: 50, address: bob }],
    output: { __typename: 'Payment', amount: 50, address: alice } }], ...extra,
});
function write(cache, value = trip(), haveHistory = false) {
  cache.writeQuery({ query: GET_TRIP, variables: { tripId: value.id, haveHistory }, data: { trip: value } });
}
function read(cache, haveHistory = false, tripId = 'trip-1') {
  return cache.readQuery({ query: GET_TRIP, variables: { tripId, haveHistory } })?.trip;
}
function seeded() {
  const cache = createTripCache();
  write(cache);
  write(cache, trip(), true);
  return cache;
}
const json = value => JSON.parse(JSON.stringify(value));

test('trip changes update both cached variants and isolate other trips', () => {
  const cache = seeded();
  write(cache, trip({ id: 'trip-2', records: [], addresses: [], moneyShare: [] }));
  executeTrip(cache, 'trip-1', patchTrip({ value: { id: 'trip-1', name: 'Renamed' } }));
  for (const history of [false, true]) assert.equal(read(cache, history).name, 'Renamed');
  assert.equal(read(cache, false, 'trip-2').name, 'Trip');
});

test('record creation is idempotent and keeps server validity and settlement snapshot', () => {
  const cache = seeded();
  const initial = read(cache);
  const change = upsertRecord({ value: record('r2', { isValid: false }) });
  executeTrip(cache, 'trip-1', change);
  executeTrip(cache, 'trip-1', change);
  for (const history of [false, true]) {
    const value = read(cache, history);
    assert.deepEqual(value.records.map(item => item.id), ['r1', 'r2']);
    assert.equal(value.records[1].isValid, false);
    assert.deepEqual(value.moneyShare, initial.moneyShare);
    assert.equal(value.isValid, initial.isValid);
  }
});

test('version edits replace active parents, preserve history and handle no-op responses', () => {
  const cache = seeded();
  const change = upsertRecord({ value: record('r2', { parentRecordId: 'r1', name: 'Dinner' }) });
  executeTrip(cache, 'trip-1', change);
  executeTrip(cache, 'trip-1', change);
  assert.deepEqual(read(cache).records.map(item => item.id), ['r2']);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive]), [['r1', false], ['r2', true]]);
  executeTrip(cache, 'trip-1', upsertRecord({ value: record('r1') }));
  assert.deepEqual(read(cache).records.map(item => item.id), ['r2']);
  assert.equal(read(cache, true).records[0].isActive, false);
});

test('deletion appends a tombstone in history and removes current record', () => {
  const cache = seeded();
  const deletion = upsertRecord({ value: record('r2', { parentRecordId: 'r1', isDeleted: true }) });
  executeTrip(cache, 'trip-1', deletion);
  executeTrip(cache, 'trip-1', deletion);
  assert.equal(read(cache).records.length, 0);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive, item.isDeleted]),
    [['r1', false, false], ['r2', true, true]]);
});

test('member create, rename and removal update lists and preserve referenced history', () => {
  const cache = seeded();
  const member = { __typename: 'Address', bind: null, useNickname: false, id: 'guest', name: 'Guest' };
  executeTrip(cache, 'trip-1', addAddress({ value: member }));
  executeTrip(cache, 'trip-1', addAddress({ value: member }));
  assert.equal(read(cache).addresses.length, 3);
  executeTrip(cache, 'trip-1', patchAddress({ value: { ...alice, name: 'Alicia' } }));
  executeTrip(cache, 'trip-1', removeAddress({ addressId: alice.id }));
  for (const history of [false, true]) {
    const value = read(cache, history);
    assert.deepEqual(value.addresses.map(item => item.id), ['bob', 'guest']);
    assert.equal(value.records[0].prePayAddress.name, 'Alicia');
    assert.equal(value.records[0].shouldPayAddress[0].name, 'Alicia');
    assert.equal(value.moneyShare[0].output.address.name, 'Alicia');
    assert.equal(value.moneyShare[0].output.amount, 50);
  }
});

test('uncached variants and null trips stay uncached or null after mutations', () => {
  const cache = createTripCache();
  write(cache);
  executeTrip(cache, 'trip-1', upsertRecord({ value: record('r2') }));
  assert.equal(read(cache, true), undefined);
  cache.writeQuery({ query: GET_TRIP, variables: { tripId: 'missing', haveHistory: false }, data: { trip: null } });
  executeTrip(cache, 'missing', addAddress({ value: alice }));
  assert.equal(read(cache, false, 'missing'), null);
  executeTrip(cache, 'uncached', upsertRecord({ value: record() }));
  assert.equal(read(cache, false, 'uncached'), undefined);
});

function network(cache = seeded()) {
  const requests = [];
  const client = new ApolloClient({ cache, link: new ApolloLink(operation => new Observable(observer => {
    requests.push({ operation,
      succeed(value) {
        const field = { GetTrip: 'trip', UpdateTrip: 'updateTrip', UpdateAddress: 'updateAddress', CreateAddress: 'createAddress', DeleteAddress: 'deleteAddress', CreateRecord: 'createRecord', UpdateRecord: 'updateRecord' }[operation.operationName];
        observer.next({ data: { [field]: value } }); observer.complete();
      },
      fail() { observer.error(new Error('Offline')); },
    });
  })) });
  const api = new TripApi(client);
  return { cache, client, requests, api };
}

test('editing a stale version retires it even if the server parent was not cached', () => {
  const cache = seeded();
  executeTrip(cache, 'trip-1', upsertRecord({ editedRecordId: 'r1',
    value: record('r3', { parentRecordId: 'r2', name: 'Merged edit' }) }));
  assert.deepEqual(read(cache).records.map(item => item.id), ['r3']);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive]), [['r1', false], ['r3', true]]);
});

test('a delayed record response does not undo a confirmed member rename', () => {
  const cache = seeded();
  executeTrip(cache, 'trip-1', patchAddress({ value: { ...alice, name: 'Alicia' } }));
  executeTrip(cache, 'trip-1', upsertRecord({ value: record('r2', { parentRecordId: 'r1' }) }));
  for (const history of [false, true]) {
    const value = read(cache, history);
    assert.equal(value.addresses[0].name, 'Alicia');
    assert.equal(value.records.at(-1).prePayAddress.name, 'Alicia');
    assert.equal(value.moneyShare[0].output.address.name, 'Alicia');
  }
});


// This committed contract mirrors the supplied backend schema, without a sibling repo dependency.
test('all GraphQL operations validate against the snapshot/statistics schema', () => {
  const { buildSchema, validate } = require('graphql');
  const schema = buildSchema(readFileSync(new URL('./fixtures/trip-schema.graphql', import.meta.url), 'utf8'));
  for (const module of ['query', 'mutation', 'subscription', '../userApi/query', '../userApi/mutation']) {
    for (const [name, document] of Object.entries(load(module))) {
      if (!document.definitions.some(definition => definition.kind === 'OperationDefinition')) continue;
      assert.deepEqual(validate(schema, document).map(error => error.message), [], name);
    }
  }
});

test('snapshot writes preserve query typenames and server statistics in both modes', () => {
  const cache = seeded();
  const snapshot = { __typename: 'AddressSnapshot', useNickname: false, id: 'alice', name: 'Alicia' };
  executeTrip(cache, 'trip-1', patchAddress({ value: snapshot }));
  executeTrip(cache, 'trip-1', upsertRecord({ value: record('r2', {
    __typename: 'RecordSnapshot', prePayAddress: { ...snapshot, name: 'Stale Alice' },
    shouldPayAddress: [{ __typename: 'AddressSnapshot', useNickname: false, id: 'bob', name: 'Bob' }],
  }) }));
  executeTrip(cache, 'trip-1', addAddress({ value: { __typename: 'AddressSnapshot', useNickname: false, id: 'new', name: 'New' } }));
  for (const history of [false, true]) {
    const value = read(cache, history);
    assert.deepEqual(json(value.addresses[0].statistics), alice.statistics);
    assert.equal(value.addresses[0].__typename, 'Address');
    assert.equal(value.addresses.at(-1).statistics, null);
    assert.equal(value.records.at(-1).__typename, 'Record');
    assert.equal(value.records.at(-1).prePayAddress.__typename, 'Address');
    assert.equal(value.records.at(-1).prePayAddress.name, 'Alicia');
  }
});


test('trip API owns mutation writes and cache-only observations', async () => {
  const { TripApi } = load('client');
  const calls = [];
  const cache = seeded();
  const client = new ApolloClient({ cache, link: new ApolloLink(operation => new Observable(observer => {
    calls.push(operation.operationName);
    observer.next({ data: { updateTrip: { __typename: 'TripSnapshot', id: 'trip-1', name: 'Renamed' } } });
    observer.complete();
  })) });
  const api = new TripApi(client);
  let notifications = 0;
  const stop = api.subscribe('trip-1', () => notifications++);
  const snapshot = api.getSnapshot('trip-1', false);
  assert.equal(snapshot, api.getSnapshot('trip-1', false));
  assert.equal(calls.length, 0);
  await api.updateTrip({ tripId: 'trip-1', input: { name: 'Renamed' } });
  assert.equal(api.getSnapshot('trip-1', false).name, 'Renamed');
  assert.equal(api.getSnapshot('trip-1', true).name, 'Renamed');
  assert.ok(notifications > 0);
  stop();
  const before = notifications;
  await api.updateTrip({ tripId: 'trip-1', input: { name: 'Renamed' } });
  assert.equal(notifications, before);
  assert.deepEqual(calls, ['UpdateTrip', 'UpdateTrip']);
  client.stop();
});

test('trip API rejects incomplete results and converts transport errors without writes', async () => {
  const { TripApi } = load('client');
  for (const response of [{ data: { updateTrip: null } }, { errors: [{ message: 'invalid trip' }] }]) {
    const cache = seeded();
    const client = new ApolloClient({ cache, link: new ApolloLink(() => new Observable(observer => { observer.next(response); observer.complete(); })) });
    const api = new TripApi(client);
    await assert.rejects(api.updateTrip({ tripId: 'trip-1', input: { name: 'Renamed' } }), error => error.name === 'TripApiError' && error.code === 'unavailable');
    assert.equal(api.getSnapshot('trip-1', false).name, 'Trip');
    client.stop();
  }
});

const refresh = (api, haveHistory = false, source = 'foreground', tripId = 'trip-1') => api.refresh({ tripId, haveHistory, source });
const rename = (api, name = 'Renamed') => api.updateTrip({ tripId: 'trip-1', input: { name } });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('a waiting writer prevents refresh merging across API instances', async () => {
  const { api, client, cache, requests } = network();
  const first = refresh(api);
  const writer = rename(api);
  const joined = refresh(new TripApi(client));
  assert.notEqual(joined, first);
  assert.equal(requests.length, 1);
  requests[0].succeed(trip());
  await first;
  assert.equal(requests.length, 2);
  assert.equal(requests[1].operation.operationName, 'UpdateTrip');
  requests[1].succeed({ id: 'trip-1', name: 'Renamed' });
  await writer;
  assert.equal(read(cache).name, 'Renamed');
  assert.equal(read(cache, true).name, 'Renamed');
  requests[2].succeed(trip({ name: 'Renamed' })); await joined;
  client.stop();
});

test('different modes queue; adjacent queued refreshes share promises', async () => {
  const { api, requests, client } = network();
  const first = refresh(api);
  const history = refresh(api, true);
  const secondHistory = refresh(api, true);
  assert.equal(history, secondHistory);
  assert.equal(requests.length, 1);
  requests[0].succeed(trip()); await first;
  assert.equal(requests.length, 2);
  assert.equal(refresh(api, true), history);
  requests[1].succeed(trip()); await history;
  assert.equal(requests.length, 2);
  await secondHistory;
  client.stop();
});

test('writers and later refresh run FIFO through cache commit', async () => {
  const { api, requests, cache, client } = network();
  const first = rename(api, 'First');
  const second = rename(api, 'Second');
  const query = refresh(api);
  assert.equal(requests.length, 1);
  requests[0].succeed({ id: 'trip-1', name: 'First' }); await first;
  assert.equal(read(cache).name, 'First');
  assert.equal(requests.length, 2);
  requests[1].succeed({ id: 'trip-1', name: 'Second' }); await second;
  assert.equal(read(cache).name, 'Second');
  assert.equal(requests.length, 3);
  requests[2].succeed(trip({ name: 'Server after writes' })); await query;
  assert.equal(read(cache).name, 'Server after writes');
  client.stop();
});

test('refresh failure is shared, preserves cache and releases the next writer', async () => {
  const { api, requests, cache, client } = network();
  const before = json(cache.extract());
  const first = refresh(api);
  assert.equal(refresh(api), first);
  const writer = rename(api);
  const failed = assert.rejects(first, /服務暫時無法使用/);
  requests[0].fail(); await failed;
  assert.deepEqual(json(cache.extract()), before);
  assert.equal(requests.length, 2);
  requests[1].succeed({ id: 'trip-1', name: 'Recovered' }); await writer;
  assert.equal(read(cache).name, 'Recovered');
  client.stop();
});

test('mutation errors and incomplete responses release the next operation', async () => {
  for (const fail of [true, false]) {
    const { api, requests, cache, client } = network();
    const writer = rename(api);
    const query = refresh(api);
    const failed = assert.rejects(writer);
    if (fail) requests[0].fail(); else requests[0].succeed(null);
    await failed;
    assert.equal(read(cache).name, 'Trip');
    assert.equal(requests.length, 2);
    requests[1].succeed(trip({ name: 'Recovered' })); await query;
    assert.equal(read(cache).name, 'Recovered');
    client.stop();
  }
});

test('different trip refreshes are exclusive and null is authoritative', async () => {
  const { api, requests, cache, client } = network();
  const one = refresh(api);
  const two = refresh(api, false, 'foreground', 'trip-2');
  assert.equal(requests.length, 1);
  requests[0].succeed(null); await one;
  requests[1].succeed(trip({ id: 'trip-2', records: [], addresses: [], moneyShare: [] })); await two;
  assert.equal(read(cache), null);
  assert.equal(read(cache, false, 'trip-2').id, 'trip-2');
  client.stop();
});

test('polling uses completion time, foreground bypasses cooldown and active polls share', async () => {
  now = 0;
  const { api, requests, client } = network();
  try {
    const first = refresh(api);
    now = 1000;
    requests[0].succeed(trip()); await first;
    now = 20000;
    assert.equal(await refresh(api, false, 'background'), 'skipped');
    assert.equal(requests.length, 1);
    const manual = refresh(api);
    assert.equal(requests.length, 2);
    assert.equal(refresh(api, false, 'background'), manual);
    requests[1].succeed(trip()); await manual;
    now = 39999;
    await refresh(api, false, 'background');
    assert.equal(requests.length, 2);
    now = 40000;
    const poll = refresh(api, false, 'background');
    assert.equal(requests.length, 3);
    requests[2].succeed(trip()); await poll;
  } finally { now = undefined; client.stop(); }
});

test('background polls do not accumulate and recheck cooldown after queueing', async () => {
  now = 0;
  const { api, requests, client } = network();
  try {
    const writer = rename(api);
    const manual = refresh(api);
    const poll = refresh(api, false, 'background');
    now = 60000;
    assert.equal(refresh(api, false, 'background'), poll);
    assert.equal(requests.length, 1);
    requests[0].succeed({ id: 'trip-1', name: 'Renamed' }); await writer;
    requests[1].succeed(trip()); await manual;
    await poll;
    assert.equal(requests.length, 2);
    now = 80000;
    const next = refresh(api, false, 'background');
    assert.equal(requests.length, 3);
    requests[2].succeed(trip()); await next;
  } finally { now = undefined; client.stop(); }
});

test('failed refresh does not start cooldown', async () => {
  now = 0;
  const { api, requests, client } = network();
  try {
    const poll = refresh(api, false, 'background');
    const failed = assert.rejects(poll);
    now = 1000;
    requests[0].fail(); await failed;
    now = 20000;
    const retry = refresh(api, false, 'background');
    assert.equal(requests.length, 2);
    requests[1].succeed(trip()); await retry;
  } finally { now = undefined; client.stop(); }
});

test('synchronous exceptions release the lock and snapshots stay readable while locked', async () => {
  const cache = seeded();
  const adapter = domainCacheFor(cache).trip;
  const lock = new (load('../apiLock').APILock)();
  const failed = lock.update(() => { throw new Error('sync failure'); });
  await assert.rejects(failed, /sync failure/);
  let release;
  const blocked = lock.update(() => new Promise(resolve => { release = resolve; }));
  assert.equal(adapter.read('trip-1', false).name, 'Trip');
  let entered = false;
  const next = lock.update(async () => { entered = true; });
  await flush(); assert.equal(entered, false);
  release(); await blocked; await next;
  assert.equal(entered, true);
});

test('cooldown is per trip and skipped ticks and mutations do not move refreshAt', async () => {
  now = 0;
  const { api, requests, client } = network();
  try {
    const first = refresh(api);
    requests[0].succeed(trip()); await first;
    now = 1000;
    const other = refresh(api, false, 'background', 'trip-2');
    assert.equal(requests.length, 2);
    requests[1].succeed(trip({ id: 'trip-2', records: [], addresses: [], moneyShare: [] })); await other;
    now = 19000;
    assert.equal(await refresh(api, false, 'background'), 'skipped');
    const writer = rename(api);
    requests[2].succeed({ id: 'trip-1', name: 'Renamed' }); await writer;
    now = 20000;
    const poll = refresh(api, false, 'background');
    assert.equal(requests.length, 4);
    requests[3].succeed(trip({ name: 'Renamed' })); await poll;
  } finally { now = undefined; client.stop(); }
});


test('profile, binding and privacy documents validate against the deployed API contract', () => {
 const { buildSchema, validate } = require('graphql');
 const schema = buildSchema(readFileSync(new URL('./fixtures/trip-schema.graphql', import.meta.url), 'utf8'));
 for (const name of ['../userApi/query', '../userApi/mutation']) {
  for (const [operation, document] of Object.entries(load(name)).filter(([, document]) => document.definitions.some(definition => definition.kind === 'OperationDefinition'))) assert.deepEqual(validate(schema, document).map(error => error.message), [], operation);
 }
});

test('confirmed access loss clears both trip variants but retains unrelated trips', async () => {
 const cache = seeded();
 write(cache, trip({ id: 'trip-2' }));
 const client = new ApolloClient({ cache, link: new ApolloLink(() => new Observable(observer => {
  observer.next({ data: null, errors: [{ message: 'FORBIDDEN', extensions: { code: 'FORBIDDEN' } }] }); observer.complete();
 })) });
 const api = new TripApi(client);
 await assert.rejects(api.refresh({ tripId: 'trip-1', haveHistory: false }), error => error.code === 'FORBIDDEN');
 assert.equal(read(cache, false), undefined);
 assert.equal(read(cache, true), undefined);
 assert.equal(read(cache, false, 'trip-2').name, 'Trip');
 client.stop();
});

test('forceRefresh clears inactive history after the preceding in-flight read commits', async () => {
 const { api, requests, client, cache } = network();
 const old = api.refresh({ tripId: 'trip-1', haveHistory: true });
 const fresh = api.forceRefresh({ tripId: 'trip-1', haveHistory: false });
 assert.equal(read(cache, true).name, 'Trip');
 assert.equal(read(cache, false).name, 'Trip');
 requests[0].succeed(trip()); await old;
 await flush();
 assert.equal(read(cache, true), undefined);
 requests[1].succeed(trip({ name: 'Fresh' })); await fresh;
 assert.equal(read(cache).name, 'Fresh');
 client.stop();
});

test('forceRefresh preserves the current snapshot on failure and retry only queries', async () => {
 const { api, requests, client, cache } = network();
 const first = api.forceRefresh({ tripId: 'trip-1', haveHistory: true });
 const rejected = assert.rejects(first, error => error.code === 'network');
 await flush();
 assert.equal(read(cache, true).name, 'Trip');
 assert.equal(read(cache, false), undefined);
 requests[0].fail(); await rejected;
 assert.equal(read(cache, true).name, 'Trip');
 const retry = api.forceRefresh({ tripId: 'trip-1', haveHistory: true });
 await flush();
 requests[1].succeed(trip({ name: 'Fresh' })); await retry;
 assert.deepEqual(requests.map(item => item.operation.operationName), ['GetTrip', 'GetTrip']);
 assert.equal(read(cache, true).name, 'Fresh');
 client.stop();
});

test('session changes prevent old refresh commits and queued writes; new-session refresh does not coalesce', async () => {
 const cache = seeded();
 let session = 1;
 const calls = [];
 const responses = [];
 const client = new ApolloClient({ cache, link: new ApolloLink(operation => new Observable(observer => {
  calls.push(operation.operationName);
  responses.push(() => { observer.next({ data: { trip: trip({ name: `Session ${session}` }) } }); observer.complete(); });
 })) });
 const api = new TripApi(client, () => session);
 const old = api.refresh({ tripId: 'trip-1', haveHistory: false });
 const write = api.updateTrip({ tripId: 'trip-1', input: { private: true } });
 session = 2;
 const cleared = api.flush();
 const next = api.refresh({ tripId: 'trip-1', haveHistory: false });
 assert.notStrictEqual(old, next);
 const oldRejected = assert.rejects(old, error => error.code === 'session-changed');
 const writeRejected = assert.rejects(write, error => error.code === 'session-changed');
 responses[0]();
 await oldRejected;
 await writeRejected;
 await cleared;
 assert.equal(read(cache), undefined);
 assert.deepEqual(calls, ['GetTrip', 'GetTrip']);
 responses[1]();
 await next;
 assert.equal(read(cache).name, 'Session 2');
 client.stop();
});

test('trip snapshot writes preserve query typenames and separate record lists in both history variants', async () => {
 const cache = seeded();
 write(cache, trip({ records: [record(), record('retired', { isActive: false })] }), true);
 const client = new ApolloClient({ cache, link: new ApolloLink(() => new Observable(observer => {
  observer.next({ data: { updateTrip: { __typename: 'TripSnapshot', id: 'trip-1', name: 'Private trip', private: true } } }); observer.complete();
 })) });
 const api = new TripApi(client);
 await api.updateTrip({ tripId: 'trip-1', input: { private: true } });
 for (const history of [false, true]) {
  assert.equal(read(cache, history).__typename, 'Trip');
  assert.equal(read(cache, history).private, true);
 }
 assert.equal(read(cache, false).records.length, 1);
 assert.equal(read(cache, true).records.length, 2);
 client.stop();
});

test('forceRefresh retains the displayed snapshot and queues flush between reads', async () => {
 const cache = seeded();
 const responses = [];
 const client = new ApolloClient({ cache, link: new ApolloLink(() => new Observable(observer => {
  responses.push(() => { observer.next({ data: { trip: trip({ name: 'Fresh' }) } }); observer.complete(); });
 })) });
 const api = new TripApi(client);
 const old = api.refresh({ tripId: 'trip-1', haveHistory: false });
 const fresh = api.forceRefresh({ tripId: 'trip-1', haveHistory: false });
 assert.equal(read(cache).name, 'Trip');
 assert.equal(read(cache, true).name, 'Trip');
 assert.notStrictEqual(old, fresh);
 responses[0]();
 await old;
 await flush();
 assert.equal(read(cache, true), undefined);
 responses[1]();
 await fresh;
 assert.equal(read(cache).name, 'Fresh');
 client.stop();
});


test('different trip mutations wait for the preceding cache commit', async () => {
  const { api, requests, client, cache } = network();
  write(cache, trip({ id: 'trip-2' }));
  const first = rename(api, 'First');
  const second = api.updateTrip({ tripId: 'trip-2', input: { name: 'Second' } });
  assert.equal(requests.length, 1);
  assert.equal(read(cache).name, 'Trip');
  requests[0].succeed({ id: 'trip-1', name: 'First' }); await first;
  assert.equal(read(cache).name, 'First');
  assert.equal(requests.length, 2);
  assert.equal(read(cache, false, 'trip-2').name, 'Trip');
  requests[1].succeed({ id: 'trip-2', name: 'Second' }); await second;
  assert.equal(read(cache, false, 'trip-2').name, 'Second');
  client.stop();
});

test('commands have explicit domain effects and readers preserve stable cache-only snapshots', () => {
  const cache = seeded();
  const domain = domainCacheFor(cache);
  const user = { __typename: 'User', id: 'user', name: 'Original', email: null,
    subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'trip-1', name: 'Favorite', lastViewedAt: '1' }] };
  domain.exec({ type: 'user.replace', value: user });
  const before = domain.trip.read('trip-1', false);
  assert.strictEqual(before, domain.trip.read('trip-1', false));
  assert.equal(domain.trip.execute, undefined);
  assert.equal(domain.user.execute, undefined);
  assert.equal(domain.trip.invalidate, undefined);
  assert.equal(domain.user.replace, undefined);
  let tripNotifications = 0;
  let userNotifications = 0;
  const stopTrip = domain.trip.subscribe('trip-1', () => tripNotifications++);
  const stopUser = domain.user.subscribe(() => userNotifications++);
  domain.exec(patchTrip({ tripId: 'trip-1', value: { id: 'trip-1', name: 'Renamed' } }));
  assert.equal(domain.user.read().subscribedTrips[0].name, 'Favorite');
  assert.ok(tripNotifications > 0);
  domain.exec(patchProfile({ userId: 'user', name: 'Profile' }));
  assert.equal(domain.trip.read('trip-1', false).name, 'Renamed');
  assert.ok(userNotifications > 0);
  domain.exec([
    renameFavorite({ userId: 'user', tripId: 'trip-1', name: 'First' }),
    renameFavorite({ userId: 'user', tripId: 'trip-1', name: 'Last' }),
  ]);
  assert.equal(domain.user.read().subscribedTrips[0].name, 'Last');
  assert.equal(domain.user.read().subscribedTrips[0].lastViewedAt, '1');
  assert.equal(domain.trip.read('trip-1', false).name, 'Renamed');
  const unchanged = domain.trip.read('trip-1', false);
  domain.exec([]);
  assert.strictEqual(domain.trip.read('trip-1', false), unchanged);
  stopTrip(); stopUser();
  const notifications = [tripNotifications, userNotifications];
  domain.exec([
    patchTrip({ tripId: 'trip-1', value: { id: 'trip-1', name: 'Detached' } }),
    { type: 'user.clear' },
  ]);
  assert.deepEqual([tripNotifications, userNotifications], notifications);
});

test('clear commands respect all, trip and variant targets without revisions', () => {
 const cache = seeded();
 const domain = domainCacheFor(cache);
 domain.exec({ type: 'trip.replace', tripId: 'trip-2', haveHistory: false, value: trip({ id: 'trip-2' }) });
 domain.exec({ type: 'trip.clear', target: { scope: 'variant', tripId: 'trip-1', haveHistory: true } });
 assert.equal(domain.trip.read('trip-1', true), undefined);
 assert.equal(domain.trip.read('trip-1', false).name, 'Trip');
 domain.exec({ type: 'trip.clear', target: { scope: 'trip', tripId: 'trip-1' } });
 assert.equal(domain.trip.read('trip-1', false), undefined);
 assert.equal(domain.trip.read('trip-2', false).id, 'trip-2');
 domain.exec({ type: 'trip.replace', tripId: 'missing', haveHistory: false, value: null });
 assert.equal(domain.trip.read('missing', false), null);
 domain.exec({ type: 'trip.clear', target: { scope: 'all' } });
 assert.equal(domain.trip.read('trip-2', false), undefined);
 assert.equal(domain.trip.read('missing', false), undefined);
});

test('patching an absent address does not create a member, and clearing users discards name overlays', () => {
  const cache = seeded();
  const domain = domainCacheFor(cache);
  domain.exec(patchAddress({ tripId: 'trip-1', value: { id: 'missing', name: 'Missing', useNickname: false } }));
  assert.equal(domain.trip.read('trip-1', false).addresses.length, 2);
  domain.exec(renameFavorite({ userId: '', tripId: 'trip-1', name: 'Overlay' }));
  const user = { __typename: 'User', id: 'user', name: null, email: null,
    subscribedTrips: [{ __typename: 'SubscribedTrip', id: 'trip-1', name: 'Server', lastViewedAt: '1' }] };
  domain.exec({ type: 'user.replace', value: user });
  assert.equal(domain.user.read().subscribedTrips[0].name, 'Overlay');
  domain.exec(renameFavorite({ userId: 'other', tripId: 'trip-1', name: 'Wrong user' }));
  assert.equal(domain.user.read().subscribedTrips[0].name, 'Overlay');
  domain.exec([{ type: 'user.clear' }, { type: 'user.replace', value: user }]);
  assert.equal(domain.user.read().subscribedTrips[0].name, 'Server');
});

test('exec stops at a failing command and does not roll back completed commands', () => {
  const calls = [];
  const domain = new DomainCache({ execute(command) { calls.push(command.type); } }, {
    execute() { throw new Error('cache failure'); },
  });
  assert.throws(() => domain.exec([
    { type: 'trip.clear', target: { scope: 'all' } },
    { type: 'user.clear' },
    { type: 'trip.clear', target: { scope: 'all' } },
  ]), /cache failure/);
  assert.deepEqual(calls, ['trip.clear']);
});

test('API implementations only mutate cache through DomainCache.exec', () => {
  for (const file of ['client', '../userApi/client']) {
    const source = readFileSync(new URL(`../src/app/lib/tripApi/${file}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /this\.cache\.(?!read\b|subscribe\b|revision\b)\w+\s*\(/);
    assert.doesNotMatch(source, /this\.client\.(?:cache|writeQuery|writeFragment|resetStore|clearStore)/);
    assert.doesNotMatch(source, /applyTrip|applyUser|applyDomainChange/);
  }
});

test('generic edits read current snapshots at execution and can target one variant', () => {
 const domain = domainCacheFor(seeded());
 const append = editTrip({ scope: 'variant', tripId: 'trip-1', haveHistory: true }, draft => { draft.name += '!'; });
 const original = domain.trip.read('trip-1', false);
 domain.exec(patchTrip({ tripId: 'trip-1', value: { id: 'trip-1', name: 'Latest', private: false } }));
 domain.exec([append, append]);
 assert.equal(domain.trip.read('trip-1', false).name, 'Latest');
 assert.equal(domain.trip.read('trip-1', true).name, 'Latest!!');
 assert.equal(original.name, 'Trip');
 const stable = domain.trip.read('trip-1', false);
 domain.exec(editTrip({ scope: 'trip', tripId: 'trip-1' }, () => {}));
 assert.strictEqual(domain.trip.read('trip-1', false), stable);
 domain.exec({ type: 'trip.replace', tripId: 'empty', haveHistory: false, value: null });
 let calls = 0;
 for (const tripId of ['empty', 'missing']) domain.exec(editTrip({ scope: 'trip', tripId }, () => { calls++; }));
 assert.equal(calls, 0);
});

test('a throwing edit leaves its snapshot intact and stops the command list', () => {
 const domain = domainCacheFor(seeded());
 const original = domain.trip.read('trip-1', false);
 assert.throws(() => domain.exec([
  editTrip({ scope: 'trip', tripId: 'trip-1' }, draft => { draft.name = 'Uncommitted'; throw new Error('edit failed'); }),
  { type: 'trip.clear', target: { scope: 'all' } },
 ]), /edit failed/);
 assert.strictEqual(domain.trip.read('trip-1', false), original);
});

test('force refresh flush ordering is shared by API instances and isolates clients', async () => {
 const first = network();
 const second = network();
 const old = refresh(first.api);
 const unrelated = refresh(second.api);
 const fresh = new TripApi(first.client).forceRefresh({ tripId: 'trip-1', haveHistory: false });
 first.requests[0].succeed(trip({ name: 'Old' }));
 await old;
 await flush();
 assert.equal(read(first.cache).name, 'Old');
 second.requests[0].succeed(trip({ name: 'Other client' }));
 await unrelated;
 assert.equal(read(second.cache).name, 'Other client');
 first.requests[1].succeed(trip({ name: 'Fresh' }));
 await fresh;
 assert.equal(read(first.cache).name, 'Fresh');
 first.client.stop(); second.client.stop();
});

test('force refresh preserves queued reads before its flush barrier', async () => {
 const { api, requests, client, cache } = network();
 const writer = rename(api);
 const queued = refresh(api);
 const fresh = new TripApi(client).forceRefresh({ tripId: 'trip-1', haveHistory: false });
 assert.equal(requests.length, 1);
 requests[0].succeed({ id: 'trip-1', name: 'Renamed', private: false });
 await writer;
 assert.equal(requests.length, 2);
 requests[1].succeed(trip({ name: 'Queued' }));
 await queued;
 await flush();
 assert.equal(requests.length, 3);
 requests[2].succeed(trip({ name: 'Fresh' }));
 await fresh;
 assert.equal(read(cache).name, 'Fresh');
 client.stop();
});

test('service flush waits for a mutation commit, clears only its target and never queries', async () => {
 const { api, requests, client, cache } = network();
 const mutation = rename(api, 'Committed');
 const cleared = api.flush('trip-1', true);
 assert.equal(read(cache, true).name, 'Trip');
 assert.equal(requests.length, 1);
 requests[0].succeed({ id: 'trip-1', name: 'Committed', private: false });
 await mutation;
 await cleared;
 assert.equal(read(cache, true), undefined);
 assert.equal(read(cache, false).name, 'Committed');
 assert.deepEqual(requests.map(item => item.operation.operationName), ['UpdateTrip']);
 client.stop();
});

test('display names follow bound profiles across trip snapshots without changing source names', () => {
  const { normalizeTrip } = load('recordInput');
  for (const [useNickname, userName, expected] of [[false, 'Profile', 'Profile'], [true, 'Profile', 'Alice'], [false, null, 'Alice'], [false, '', 'Alice'], [false, '  ', 'Alice']]) {
    const address = { ...alice, useNickname, bind: { userId: 'u', userName } };
    const source = { addresses: [address], records: [record()], moneyShare: [{ input: [{ amount: 1, address: alice }], output: { amount: 1, address: bob } }] };
    const value = normalizeTrip(source);
    assert.equal(value.addresses[0].name, expected);
    assert.equal(value.records[0].prePayAddress.name, expected);
    assert.equal(value.records[0].shouldPayAddress[0].name, expected);
    assert.equal(value.moneyShare[0].input[0].address.name, expected);
    assert.equal(value.moneyShare[0].output.address.name, 'Bob');
    assert.equal(source.addresses[0].name, 'Alice');
  }
});

test('unbound member display keeps each original address name', () => {
 const value = load('recordInput').normalizeTrip({ addresses: [{ ...alice, name: 'List name' }], records: [record()], moneyShare: [] });
 assert.equal(value.addresses[0].name, 'List name');
 assert.equal(value.records[0].prePayAddress.name, 'Alice');
});
