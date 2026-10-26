import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { ApolloClient, ApolloLink, Observable } = require('@apollo/client');
const modules = new Map();
let now;
class Clock extends Date { static now() { return now ?? Date.now(); } }
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/app/lib/tripApi/${name}.ts`, import.meta.url), 'utf8');
  const exports = {};
  modules.set(name, exports);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { Date: Clock, exports, require: id => id.startsWith('./') ? load(id.slice(2)) : require(id) });
  return exports;
}
const { createTripCache, updateTripCache } = load('cache');
const { TripApi } = load('client');
const { TripCache } = load('cache');
const { GET_TRIP } = load('query');
const alice = { __typename: 'Address', id: 'alice', name: 'Alice', statistics: { totalExpense: 50, totalPrepaid: 100, activeRecordCount: 1 } };
const bob = { __typename: 'Address', id: 'bob', name: 'Bob', statistics: { totalExpense: 50, totalPrepaid: 0, activeRecordCount: 1 } };
const record = (id = 'r1', extra = {}) => ({
  __typename: 'Record', id, name: 'Lunch', amount: 100, prePayAddress: alice,
  shouldPayAddress: [alice, bob], extendPayMsg: [50, 50], category: 'NORMAL',
  time: '1789056000000', isValid: true, isDeleted: false, isActive: true, parentRecordId: null, ...extra,
});
const trip = (extra = {}) => ({
  __typename: 'Trip', id: 'trip-1', name: 'Trip', records: [record()], addresses: [alice, bob], isValid: true,
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
  updateTripCache(cache, 'trip-1', { kind: 'trip', value: { id: 'trip-1', name: 'Renamed' } });
  for (const history of [false, true]) assert.equal(read(cache, history).name, 'Renamed');
  assert.equal(read(cache, false, 'trip-2').name, 'Trip');
});

test('record creation is idempotent and keeps server validity and settlement snapshot', () => {
  const cache = seeded();
  const initial = read(cache);
  const change = { kind: 'record', value: record('r2', { isValid: false }) };
  updateTripCache(cache, 'trip-1', change);
  updateTripCache(cache, 'trip-1', change);
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
  const change = { kind: 'record', value: record('r2', { parentRecordId: 'r1', name: 'Dinner' }) };
  updateTripCache(cache, 'trip-1', change);
  updateTripCache(cache, 'trip-1', change);
  assert.deepEqual(read(cache).records.map(item => item.id), ['r2']);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive]), [['r1', false], ['r2', true]]);
  updateTripCache(cache, 'trip-1', { kind: 'record', value: record('r1') });
  assert.deepEqual(read(cache).records.map(item => item.id), ['r2']);
  assert.equal(read(cache, true).records[0].isActive, false);
});

test('deletion appends a tombstone in history and removes current record', () => {
  const cache = seeded();
  const deletion = { kind: 'record', value: record('r2', { parentRecordId: 'r1', isDeleted: true }) };
  updateTripCache(cache, 'trip-1', deletion);
  updateTripCache(cache, 'trip-1', deletion);
  assert.equal(read(cache).records.length, 0);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive, item.isDeleted]),
    [['r1', false, false], ['r2', true, true]]);
});

test('member create, rename and removal update lists and preserve referenced history', () => {
  const cache = seeded();
  const member = { __typename: 'Address', id: 'guest', name: 'Guest' };
  updateTripCache(cache, 'trip-1', { kind: 'createAddress', value: member });
  updateTripCache(cache, 'trip-1', { kind: 'createAddress', value: member });
  assert.equal(read(cache).addresses.length, 3);
  updateTripCache(cache, 'trip-1', { kind: 'updateAddress', value: { ...alice, name: 'Alicia' } });
  updateTripCache(cache, 'trip-1', { kind: 'deleteAddress', value: alice });
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
  updateTripCache(cache, 'trip-1', { kind: 'record', value: record('r2') });
  assert.equal(read(cache, true), undefined);
  cache.writeQuery({ query: GET_TRIP, variables: { tripId: 'missing', haveHistory: false }, data: { trip: null } });
  updateTripCache(cache, 'missing', { kind: 'createAddress', value: alice });
  assert.equal(read(cache, false, 'missing'), null);
  updateTripCache(cache, 'uncached', { kind: 'record', value: record() });
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
  updateTripCache(cache, 'trip-1', { kind: 'record', editedRecordId: 'r1',
    value: record('r3', { parentRecordId: 'r2', name: 'Merged edit' }) });
  assert.deepEqual(read(cache).records.map(item => item.id), ['r3']);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive]), [['r1', false], ['r3', true]]);
});

test('a delayed record response does not undo a confirmed member rename', () => {
  const cache = seeded();
  updateTripCache(cache, 'trip-1', { kind: 'updateAddress', value: { ...alice, name: 'Alicia' } });
  updateTripCache(cache, 'trip-1', { kind: 'record', value: record('r2', { parentRecordId: 'r1' }) });
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
  for (const module of ['query', 'mutation', 'subscription']) {
    for (const [name, document] of Object.entries(load(module))) {
      assert.deepEqual(validate(schema, document).map(error => error.message), [], name);
    }
  }
});

test('snapshot writes preserve query typenames and server statistics in both modes', () => {
  const cache = seeded();
  const snapshot = { __typename: 'AddressSnapshot', id: 'alice', name: 'Alicia' };
  updateTripCache(cache, 'trip-1', { kind: 'updateAddress', value: snapshot });
  updateTripCache(cache, 'trip-1', { kind: 'record', value: record('r2', {
    __typename: 'RecordSnapshot', prePayAddress: { ...snapshot, name: 'Stale Alice' },
    shouldPayAddress: [{ __typename: 'AddressSnapshot', id: 'bob', name: 'Bob' }],
  }) });
  updateTripCache(cache, 'trip-1', { kind: 'createAddress', value: { __typename: 'AddressSnapshot', id: 'new', name: 'New' } });
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

test('active refresh is shared across API instances even with a waiting writer', async () => {
  const { api, client, cache, requests } = network();
  const first = refresh(api);
  const writer = rename(api);
  const joined = refresh(new TripApi(client));
  assert.equal(joined, first);
  assert.equal(requests.length, 1);
  requests[0].succeed(trip());
  await first;
  assert.equal(requests.length, 2);
  assert.equal(requests[1].operation.operationName, 'UpdateTrip');
  requests[1].succeed({ id: 'trip-1', name: 'Renamed' });
  await writer;
  assert.equal(read(cache).name, 'Renamed');
  assert.equal(read(cache, true).name, 'Renamed');
  client.stop();
});

test('different modes queue; queued refreshes do not share promises', async () => {
  const { api, requests, client } = network();
  const first = refresh(api);
  const history = refresh(api, true);
  const secondHistory = refresh(api, true);
  assert.notEqual(history, secondHistory);
  assert.equal(requests.length, 1);
  requests[0].succeed(trip()); await first;
  assert.equal(requests.length, 2);
  assert.equal(refresh(api, true), history);
  requests[1].succeed(trip()); await history;
  assert.equal(requests.length, 3);
  requests[2].succeed(trip()); await secondHistory;
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

test('different trips can refresh concurrently and null is authoritative', async () => {
  const { api, requests, cache, client } = network();
  const one = refresh(api);
  const two = refresh(api, false, 'foreground', 'trip-2');
  assert.equal(requests.length, 2);
  requests[1].succeed(trip({ id: 'trip-2', records: [], addresses: [], moneyShare: [] })); await two;
  requests[0].succeed(null); await one;
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
    const manual = refresh(api, true);
    const poll = refresh(api, false, 'background');
    now = 60000;
    assert.equal(await refresh(api, false, 'background'), 'skipped');
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

test('failed refresh updates cooldown but manual retry remains immediate', async () => {
  now = 0;
  const { api, requests, client } = network();
  try {
    const poll = refresh(api, false, 'background');
    const failed = assert.rejects(poll);
    now = 1000;
    requests[0].fail(); await failed;
    now = 20000;
    assert.equal(await refresh(api, false, 'background'), 'skipped');
    assert.equal(requests.length, 1);
    const retry = refresh(api);
    requests[1].succeed(trip()); await retry;
  } finally { now = undefined; client.stop(); }
});

test('synchronous exceptions release the lock and snapshots stay readable while locked', async () => {
  const cache = seeded();
  const adapter = new TripCache(cache);
  const failed = adapter.runMutation('trip-1', () => { throw new Error('sync failure'); });
  await assert.rejects(failed, /sync failure/);
  let release;
  const blocked = adapter.runMutation('trip-1', () => new Promise(resolve => { release = resolve; }));
  assert.equal(adapter.read('trip-1', false).name, 'Trip');
  let entered = false;
  const next = new TripCache(cache).runMutation('trip-1', async () => { entered = true; });
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
