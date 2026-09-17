import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { ApolloClient, ApolloLink, Observable } = require('@apollo/client');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = readFileSync(new URL(`../src/app/lib/tripApi/${name}.ts`, import.meta.url), 'utf8');
  const exports = {};
  modules.set(name, exports);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: id => id.startsWith('./') ? load(id.slice(2)) : require(id) });
  return exports;
}
const { createTripCache, updateTripCache } = load('cache');
const { createTripSynchronizer } = load('sync');
const { GET_TRIP } = load('query');
const alice = { __typename: 'Address', id: 'alice', name: 'Alice' };
const bob = { __typename: 'Address', id: 'bob', name: 'Bob' };
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
      succeed(value) { observer.next({ data: { trip: value } }); observer.complete(); },
      fail() { observer.error(new Error('Offline')); },
    });
  })) });
  return { cache, client, requests, synchronize: createTripSynchronizer(client, 'trip-1') };
}

test('slow queries replay successful mutations before writing cache, with no extra query', async () => {
  const { cache, requests, synchronize } = network();
  const snapshot = trip();
  const pending = synchronize(false);
  const change = { kind: 'record', value: record('r2', { parentRecordId: 'r1', amount: 200 }) };
  updateTripCache(cache, 'trip-1', change);
  assert.equal(read(cache).records[0].amount, 200);
  requests[0].succeed(snapshot);
  await pending;
  assert.deepEqual(read(cache).records.map(item => item.id), ['r2']);
  assert.equal(read(cache).records[0].amount, 200);
  assert.equal(read(cache, true).records[0].isActive, false);
  assert.equal(requests.length, 1);
  const next = synchronize(false);
  requests[1].succeed(trip({ records: [change.value], moneyShare: [] }));
  await next;
  assert.deepEqual(read(cache).moneyShare, []);
});

test('in-flight reads coalesce, failures preserve cache, and later reads retry', async () => {
  const { cache, requests, synchronize } = network();
  const before = json(cache.extract());
  const pending = synchronize(false);
  assert.equal(synchronize(false), pending);
  assert.equal(requests.length, 1);
  requests[0].fail();
  await assert.rejects(pending, /Offline/);
  assert.deepEqual(json(cache.extract()), before);
  const retry = synchronize(false);
  requests[1].succeed(trip({ name: 'Recovered' }));
  await retry;
  assert.equal(read(cache).name, 'Recovered');
});

test('late previous-mode response cannot overwrite newer normalized records', async () => {
  const { cache, requests, synchronize } = network();
  const old = synchronize(false);
  const current = synchronize(true);
  requests[1].succeed(trip({ records: [record('r1', { name: 'Latest' })] }));
  await current;
  requests[0].succeed(trip());
  await old;
  assert.equal(read(cache, true).records[0].name, 'Latest');
});

test('an initially uncached history query also receives mutations made while loading', async () => {
  const { cache, requests, synchronize } = network(createTripCache());
  write(cache);
  const pending = synchronize(true);
  updateTripCache(cache, 'trip-1', { kind: 'record', value: record('r2', { parentRecordId: 'r1', isDeleted: true }) });
  requests[0].succeed(trip());
  await pending;
  assert.equal(read(cache).records.length, 0);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive]), [['r1', false], ['r2', true]]);
});

test('editing a stale version retires it even if the server parent was not cached', () => {
  const cache = seeded();
  updateTripCache(cache, 'trip-1', { kind: 'record', editedRecordId: 'r1',
    value: record('r3', { parentRecordId: 'r2', name: 'Merged edit' }) });
  assert.deepEqual(read(cache).records.map(item => item.id), ['r3']);
  assert.deepEqual(read(cache, true).records.map(item => [item.id, item.isActive]), [['r1', false], ['r3', true]]);
});

test('query reconciliation also preserves trip and member writes', async () => {
  const { cache, requests, synchronize } = network();
  const pending = synchronize(false);
  updateTripCache(cache, 'trip-1', { kind: 'trip', value: { id: 'trip-1', name: 'New trip name' } });
  updateTripCache(cache, 'trip-1', { kind: 'createAddress', value: { __typename: 'Address', id: 'guest', name: 'Guest' } });
  updateTripCache(cache, 'trip-1', { kind: 'updateAddress', value: { ...alice, name: 'Alicia' } });
  updateTripCache(cache, 'trip-1', { kind: 'deleteAddress', value: bob });
  requests[0].succeed(trip());
  await pending;
  const value = read(cache);
  assert.equal(value.name, 'New trip name');
  assert.deepEqual(value.addresses.map(item => [item.id, item.name]), [['alice', 'Alicia'], ['guest', 'Guest']]);
  assert.equal(value.records[0].prePayAddress.name, 'Alicia');
  assert.equal(value.records[0].shouldPayAddress[1].name, 'Bob');
});

test('remounting a trip shares its in-flight query and mutation journal', async () => {
  const { cache, client, requests, synchronize } = network();
  const pending = synchronize(false);
  updateTripCache(cache, 'trip-1', { kind: 'trip', value: { id: 'trip-1', name: 'Renamed' } });
  const remounted = createTripSynchronizer(client, 'trip-1');
  assert.equal(remounted(false), pending);
  requests[0].succeed(trip());
  await pending;
  assert.equal(requests.length, 1);
  assert.equal(read(cache).name, 'Renamed');
});

test('a successful older query is cached if the newer mode query failed', async () => {
  const { cache, requests, synchronize } = network();
  const current = synchronize(false);
  const history = synchronize(true);
  requests[1].fail();
  await assert.rejects(history, /Offline/);
  requests[0].succeed(trip({ name: 'Fresh current data' }));
  await current;
  assert.equal(read(cache).name, 'Fresh current data');
});

test('returning to a mode starts a fresh query instead of reusing its superseded request', async () => {
  const { cache, requests, synchronize } = network();
  const oldCurrent = synchronize(false);
  const history = synchronize(true);
  const newCurrent = synchronize(false);
  assert.equal(requests.length, 3);
  assert.notEqual(newCurrent, oldCurrent);
  requests[2].succeed(trip({ name: 'Latest current', records: [record('r1', { name: 'Latest record' })] }));
  await newCurrent;
  requests[1].succeed(trip());
  await history;
  requests[0].succeed(trip());
  await oldCurrent;
  assert.equal(read(cache).name, 'Latest current');
  assert.equal(read(cache).records[0].name, 'Latest record');
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

test('finishing an obsolete request does not remove the newer pending request', async () => {
  const { requests, synchronize } = network();
  const old = synchronize(false);
  const history = synchronize(true);
  const latest = synchronize(false);
  requests[0].succeed(trip());
  await old;
  assert.equal(synchronize(false), latest);
  assert.equal(requests.length, 3);
  requests[2].succeed(trip());
  await latest;
  requests[1].succeed(trip());
  await history;
});
