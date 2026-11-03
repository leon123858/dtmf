import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/lib/apiLock.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { APILock } = exports;
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('all writes run FIFO and wait for the preceding cache commit', async () => {
  const lock = new APILock();
  const a = gate(), b = gate();
  const events = [];
  const one = lock.update(async () => { events.push('a'); await a.promise; events.push('a commit'); });
  const two = lock.update(async () => { events.push('b'); await b.promise; events.push('b commit'); });
  const both = lock.update(async () => { events.push('both'); });
  const later = lock.update(async () => { events.push('later'); });
  const other = lock.update(async () => { events.push('c'); });
  assert.deepEqual(events, ['a']);
  a.resolve(); await one;
  assert.deepEqual(events, ['a', 'a commit', 'b']);
  b.resolve(); await Promise.all([two, both, later, other]);
  assert.deepEqual(events, ['a', 'a commit', 'b', 'b commit', 'both', 'later', 'c']);
});

test('read barrier waits for every write and commit despite failures and synchronous throws', async () => {
  const lock = new APILock();
  const slow = gate(); const events = [];
  const one = lock.update(async () => { await slow.promise; events.push('commit'); });
  const failed = lock.update(() => { throw new Error('sync failure'); });
  const rejection = assert.rejects(failed, /sync failure/);
  const read = lock.refresh('read', 'foreground_refresh', 20, async () => { events.push('read'); });
  const next = lock.update(async () => { events.push('next'); });
  await tick(); assert.deepEqual(events, []);
  slow.resolve(); await Promise.all([one, rejection, read, next]);
  assert.deepEqual(events, ['commit', 'read', 'next']);
});

test('adjacent reads merge, queued background upgrades, and writes close merge boundaries', async () => {
  let now = 0; const lock = new APILock(() => now); let count = 0;
  const read = () => { count++; return Promise.resolve(); };
  await lock.refresh('same', 'foreground_refresh', 20000, read);
  const hold = gate();
  const write = lock.update(() => hold.promise);
  const bg = lock.refresh('same', 'background_refresh', 20000, read);
  assert.strictEqual(lock.refresh('same', 'foreground_refresh', 20000, read), bg);
  const laterWrite = lock.update(async () => {});
  const laterRead = lock.refresh('same', 'foreground_refresh', 20000, read);
  assert.notStrictEqual(bg, laterRead);
  hold.resolve(); await Promise.all([write, bg, laterWrite, laterRead]);
  assert.equal(count, 3);
  now = 19999;
  assert.equal(await lock.refresh('same', 'background_refresh', 20000, read), 'skipped');
  now = 20000;
  assert.equal(await lock.refresh('same', 'background_refresh', 20000, read), 'refreshed');
});

test('background checks cooldown on dequeue; separated polling does not accumulate; failures do not reset success time', async () => {
  let now = 0; const lock = new APILock(() => now); const hold = gate(); let count = 0;
  const first = lock.refresh('key', 'foreground_refresh', 20000, async () => { await hold.promise; count++; });
  const writer = lock.update(async () => {});
  const bg = lock.refresh('key', 'background_refresh', 20000, async () => { count++; });
  const other = lock.update(async () => {});
  assert.equal(await lock.refresh('key', 'background_refresh', 20000, async () => assert.fail()), 'skipped');
  now = 30000; hold.resolve(); await first;
  assert.equal(await bg, 'skipped'); await Promise.all([writer, other]); assert.equal(count, 1);
  now = 50000;
  await assert.rejects(lock.refresh('key', 'background_refresh', 20000, async () => { throw Error('failed'); }));
  assert.equal(await lock.refresh('key', 'background_refresh', 20000, async () => { count++; }), 'refreshed');
  assert.equal(count, 2);
});

test('asynchronous request failure rejects once and allows the next item to commit', async () => {
  const lock = new APILock();
  const hold = gate(); const events = [];
  const failed = lock.update(async () => { events.push('request'); await hold.promise; throw Error('network'); });
  const rejection = assert.rejects(failed, /network/);
  const next = lock.update(async () => { events.push('next commit'); });
  assert.deepEqual(events, ['request']);
  hold.resolve(); await Promise.all([rejection, next]);
  assert.deepEqual(events, ['request', 'next commit']);
});

test('flush waits for commits, separates adjacent refreshes and resets polling cooldown', async () => {
  const lock = new APILock(() => 100);
  const hold = gate();
  const events = [];
  const first = lock.refresh('trip', 'foreground_refresh', 20000, async () => {
    await hold.promise;
    events.push('first commit');
  });
  const cleared = lock.flush(() => { events.push('clear'); });
  const next = lock.refresh('trip', 'background_refresh', 20000, async () => {
    events.push('next commit');
  });
  assert.notStrictEqual(first, next);
  assert.deepEqual(events, []);
  hold.resolve();
  await cleared;
  assert.equal(await first, 'refreshed');
  assert.equal(await next, 'refreshed');
  assert.deepEqual(events, ['first commit', 'clear', 'next commit']);
});
