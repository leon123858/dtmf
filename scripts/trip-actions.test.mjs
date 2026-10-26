import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const domain = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/lib/tripApi/public.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: domain });
const { TripApiError } = domain;
const source = readFileSync(new URL('../src/app/lib/staticActions/tripActions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadAction(createTripHttp) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => name === '../tripApi/http' ? { createServerTripApi: token => ({ createTrip: input => createTripHttp(input, token) }) } : name === '../tripApi/public' ? domain : require(name),
    console: { error() {} },
  });
  return async (name, token) => {
    const data = new FormData();
    if (name !== undefined) data.set('tripName', name);
    return exports.createTripAction(data, token);
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
    return { id: 'trip-1' };
  });
  assert.equal((await action(' Trip ')).tripId, 'trip-1');
});

test('creation returns GraphQL rejection reason', async () => {
  const action = loadAction(async () => {
    throw new TripApiError('unavailable', 'Trip name rejected');
  });
  assert.equal((await action('Trip')).error, 'Trip name rejected');
});

test('creation returns fallback for network errors, unexpected errors and missing IDs', async () => {
  const fallback = '創建新旅程失敗，請稍後再試。';
  for (const error of [new TripApiError('network', '行程服務暫時無法使用，請重試。'), new Error('connection refused'), new Error('internal detail'), null]) {
    const action = loadAction(async () => { throw error; });
    assert.equal((await action('Trip')).error, fallback);
  }
  for (const result of [undefined, {}, { createTrip: {} }, { createTrip: { id: '' } }]) {
    const action = loadAction(async () => result);
    assert.equal((await action('Trip')).error, fallback);
  }
});

test('creation identifies authentication failures for browser-owned refresh', async () => {
  const action = loadAction(async () => {
    throw new TripApiError('unauthenticated', '登入已失效，請重新登入。');
  });
  assert.equal((await action('Trip')).unauthenticated, true);
});


test('creation passes each caller token independently and anonymous calls omit it', async () => {
  const tokens = [];
  const action = loadAction(async (_input, token) => {
    tokens.push(token);
    return { id: 'created' };
  });
  await Promise.all([action('one', 'first-user'), action('two', 'second-user'), action('anonymous')]);
  assert.deepEqual(tokens, ['first-user', 'second-user', undefined]);
});
