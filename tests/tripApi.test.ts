import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildSchema, validate } from 'graphql';
import { ApolloClient, ApolloLink, Observable } from '@apollo/client';
import { createTripCache } from '../src/app/lib/tripApi/cache';
import { refreshTrip, tripSyncFailures } from '../src/app/lib/tripApi/sync';
import { normalizeRecord, recordToInput } from '../src/app/lib/tripApi/recordInput';
import { GET_TRIP } from '../src/app/lib/tripApi/query';
import * as mutations from '../src/app/lib/tripApi/mutation';
import * as subscriptions from '../src/app/lib/tripApi/subscription';
import { RecordCategory } from '../src/app/lib/tripApi/types';

const record = {
	__typename: 'Record', id: 'root', name: 'meal', amount: 12.34567,
	time: '1720000000123', category: RecordCategory.PART,
	prePayAddress: { __typename: 'Address', id: 'a', name: 'Alice' },
	shouldPayAddress: [{ __typename: 'Address', id: 'b', name: 'Bob' }],
	extendPayMsg: [1.234567], parentRecordId: null,
	isActive: true, isDeleted: false, isValid: true,
};
const trip = (records: object[]) => ({ __typename: 'Trip', id: 'trip', name: 'Trip', records, addresses: [record.prePayAddress], moneyShare: [], isValid: true });
const variables = (haveHistory = false) => ({ tripId: 'trip', haveHistory });

test('history and active lists stay isolated in either write order', () => {
	for (const order of [[false, true], [true, false]]) {
		const cache = createTripCache();
		for (const history of order) cache.writeQuery({ query: GET_TRIP, variables: variables(history), data: { trip: trip(history ? [record, { ...record, id: 'old', isActive: false }] : [record]) } });
		assert.equal(cache.readQuery<{ trip: { records: object[] } }>({ query: GET_TRIP, variables: variables() })?.trip.records.length, 1);
		assert.equal(cache.readQuery<{ trip: { records: object[] } }>({ query: GET_TRIP, variables: variables(true) })?.trip.records.length, 2);
	}
});

test('original input keeps precision, order, deletion flag and detached arrays', () => {
	const input = recordToInput(record);
	assert.equal(input.amount, 12.34567);
	assert.deepEqual(input.extendPayMsg, [1.234567]);
	assert.equal(input.time, '1720000000123');
	assert.equal(input.isDeleted, false);
	input.extendPayMsg![0] = 9;
	input.shouldPayAddressIds.push('c');
	assert.deepEqual(record.extendPayMsg, [1.234567]);
	assert.equal(record.shouldPayAddress.length, 1);
	assert.equal('parentRecordId' in input, false);
});

test('nullable record fields can be displayed without crashing', () => {
	const normalized = normalizeRecord({ ...record, name: null, amount: null, prePayAddress: null, shouldPayAddress: null, extendPayMsg: null });
	assert.equal(normalized.name, '');
	assert.deepEqual(normalized.shouldPayAddress, []);
	assert.equal(normalized.prePayAddress.id, '');
});

test('refresh follows appended versions, updates settlement, invalidates inactive history, and contains refresh failures', async () => {
	let current = [record];
	let fail = false;
	const client = new ApolloClient({ cache: createTripCache(), link: new ApolloLink(operation => new Observable(observer => {
		if (fail) { observer.error(new Error('offline')); return; }
		observer.next({ data: { trip: trip(operation.variables.haveHistory ? current : current.filter(r => r.isActive && !r.isDeleted)) } });
		observer.complete();
	})) });
	const query = client.watchQuery({ query: GET_TRIP, variables: variables() });
	const subscriber = query.subscribe({ next() {}, error() {} });
	await query.result();
	client.cache.writeQuery({ query: GET_TRIP, variables: variables(true), data: { trip: trip(current) } });
	current = [{ ...record, isActive: false }, { ...record, id: 'new', parentRecordId: 'root' } as typeof record];
	assert.equal(await refreshTrip(client, 'trip'), true);
	assert.deepEqual(query.getCurrentResult().data.trip.records.map((r: { id: string }) => r.id), ['new']);
	assert.equal(client.cache.readQuery({ query: GET_TRIP, variables: variables(true) }), null);
	const history = client.watchQuery({ query: GET_TRIP, variables: variables(true) });
	const historySubscriber = history.subscribe({ next() {}, error() {} });
	await history.result();
	current = [...current.map(r => ({ ...r, isActive: false })), { ...record, id: 'deleted', isDeleted: true, parentRecordId: 'new' } as typeof record];
	assert.equal(await refreshTrip(client, 'trip'), true);
	assert.equal(query.getCurrentResult().data.trip.records.length, 0);
	assert.equal(history.getCurrentResult().data.trip.records.length, 3);
	fail = true;
	assert.equal(await refreshTrip(client, 'trip'), false);
	assert.deepEqual(tripSyncFailures(), ['trip']);
	fail = false;
	assert.equal(await refreshTrip(client, 'trip'), true);
	assert.deepEqual(tripSyncFailures(), []);
	subscriber.unsubscribe(); historySubscriber.unsubscribe(); client.stop();
});

const schemaPath = process.env.DTM_SCHEMA_PATH ?? '../dtm/graph/schema.graphqls';
test('all operations validate against the local backend schema', { skip: !existsSync(schemaPath) && 'Set DTM_SCHEMA_PATH to the backend schema' }, () => {
	const schema = buildSchema(readFileSync(schemaPath, 'utf8'));
	for (const document of [GET_TRIP, ...Object.values(mutations), ...Object.values(subscriptions)]) {
		assert.deepEqual(validate(schema, document).map(error => error.message), []);
	}
});
