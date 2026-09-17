import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { ApolloError } = require('@apollo/client');
const source = readFileSync(new URL('../src/app/lib/staticActions/tripActions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadAction(createTripHttp) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => name === '../tripApi/http' ? { createTripHttp } : require(name),
    console: { error() {} },
  });
  return async name => {
    const data = new FormData();
    if (name !== undefined) data.set('tripName', name);
    return exports.createTripAction(data);
  };
}

test('creation rejects missing or whitespace names without calling backend', async () => {
  const action = loadAction(() => assert.fail('unexpected backend call'));
  for (const name of [undefined, '', '   ']) {
    assert.equal((await action(name)).error, '旅程名稱不能為空。');
  }
});

test('creation trims name and returns trip ID', async () => {
  const action = loadAction(async input => {
    assert.equal(input.name, 'Trip');
    return { createTrip: { id: 'trip-1' } };
  });
  assert.equal((await action(' Trip ')).tripId, 'trip-1');
});

test('creation returns GraphQL rejection reason', async () => {
  const action = loadAction(async () => {
    throw new ApolloError({ graphQLErrors: [{ message: 'Trip name rejected' }] });
  });
  assert.equal((await action('Trip')).error, 'Trip name rejected');
});

test('creation returns fallback for network errors, unexpected errors and missing IDs', async () => {
  const fallback = '創建新旅程失敗，請稍後再試。';
  for (const error of [new ApolloError({ networkError: new Error('connection refused') }), new Error('internal detail'), null]) {
    const action = loadAction(async () => { throw error; });
    assert.equal((await action('Trip')).error, fallback);
  }
  for (const result of [undefined, {}, { createTrip: {} }, { createTrip: { id: '' } }]) {
    const action = loadAction(async () => result);
    assert.equal((await action('Trip')).error, fallback);
  }
});
