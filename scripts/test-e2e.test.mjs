import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { optionsFor, runWorkflow, createRuntime } from './test-e2e.mjs';

function runtime({ fail, codes = {} } = {}) {
  const calls = [];
  const action = name => async (...args) => {
    calls.push([name, ...args]);
    if (fail === name) throw new Error(`${name} unavailable`);
    return codes[args[0]] ?? 0;
  };
  return { calls, probe: action('probe'), frontend: action('frontend'), backend: action('backend'),
    test: action('test'), cleanup: action('cleanup'), log() {} };
}

test('runs each suite once, in order, and propagates headed/filter arguments', async () => {
  const r = runtime();
  assert.equal(await runWorkflow(optionsFor(['--headed', '--grep', 'layout'], {}), r), 0);
  assert.deepEqual(r.calls, [
    ['probe', true], ['frontend'], ['test', 'fixtures', ['--headed', '--grep', 'layout']],
    ['backend'], ['test', 'integration', ['--headed', '--grep', 'layout']], ['cleanup'],
  ]);
});

test('fixture failure still runs integration and fails the whole run', async () => {
  const r = runtime({ codes: { fixtures: 1 } });
  assert.equal(await runWorkflow(optionsFor([], {}), r), 1);
  assert.deepEqual(r.calls.filter(([name]) => name === 'test').map(([, suite]) => suite), ['fixtures', 'integration']);
  assert.deepEqual(r.calls.at(-1), ['cleanup']);
});

test('backend failure occurs after fixtures, never reports a successful skip', async () => {
  const r = runtime({ fail: 'backend' });
  assert.equal(await runWorkflow(optionsFor([], {}), r), 1);
  assert.deepEqual(r.calls.map(([name]) => name), ['probe', 'frontend', 'test', 'backend', 'cleanup']);
});

for (const headed of [false, true]) {
  test(`full environment check runs no specs (headed=${headed})`, async () => {
    const r = runtime();
    assert.equal(await runWorkflow(optionsFor(['--check', ...(headed ? ['--headed'] : [])], {}), r), 0);
    assert.deepEqual(r.calls, [['probe', headed], ['frontend'], ['backend'], ['cleanup']]);
  });
}

for (const fail of ['probe', 'frontend', 'backend', 'test']) {
  test(`${fail} error fails and always cleans up`, async () => {
    const r = runtime({ fail });
    assert.equal(await runWorkflow(optionsFor([], {}), r), 1);
    assert.deepEqual(r.calls.at(-1), ['cleanup']);
    if (fail === 'probe') assert.deepEqual(r.calls.map(([name]) => name), ['probe', 'cleanup']);
  });
}

test('check also fails on an unavailable backend', async () => {
  assert.equal(await runWorkflow(optionsFor(['--check'], {}), runtime({ fail: 'backend' })), 1);
});

test('normal headed mode does not enable Inspector; explicit debug remains supported', () => {
  assert.deepEqual(optionsFor(['--headed'], {}), { check: false, headed: true, playwrightArgs: ['--headed'] });
  assert.equal(optionsFor([], {}).headed, false);
  assert.deepEqual(optionsFor(['--debug'], {}).playwrightArgs, ['--debug', '--headed']);
  assert.deepEqual(optionsFor(['--debug=cli'], {}).playwrightArgs, ['--debug=cli']);
  assert.equal(optionsFor([], { PWDEBUG: '1' }).headed, true);
});

test('a suite spawn error does not prevent the next suite from running', async () => {
  const r = runtime({ fail: 'test' });
  assert.equal(await runWorkflow(optionsFor([], {}), r), 1);
  assert.deepEqual(r.calls.filter(([name]) => name === 'test').map(([, suite]) => suite), ['fixtures', 'integration']);
});

test('cleanup terminates an owned backend process group but never a reused backend', { skip: process.platform === 'win32' }, async () => {
  for (const reuse of [false, true]) {
    const signals = [];
    let requests = 0;
    let starts = 0;
    const r = createRuntime({
      spawnProcess() { starts++; return Object.assign(new EventEmitter(), { pid: 12345 }); },
      killProcess: (...args) => signals.push(args),
      request: async () => ({ ok: reuse || requests++ > 0, json: async () => ({ status: 'ok' }) }),
    });
    try { await r.backend(); } finally { await r.cleanup(); }
    assert.equal(starts, reuse ? 0 : 1);
    assert.deepEqual(signals, reuse ? [] : [[-12345, 'SIGTERM'], [-12345, 'SIGKILL']]);
  }
});

test('interrupt releases a stuck child and cleanup escalates to SIGKILL', { skip: process.platform === 'win32' }, async () => {
  const signals = [];
  const before = process.listenerCount('SIGINT');
  const r = createRuntime({
    spawnProcess: () => Object.assign(new EventEmitter(), { pid: 12345 }),
    killProcess: (...args) => signals.push(args),
  });
  try {
    const completion = r.test('fixtures', []);
    process.emit('SIGINT');
    await assert.rejects(completion, /Interrupted/);
    assert.equal(r.interrupted, 130);
  } finally { await r.cleanup(); }
  assert.deepEqual(signals.at(-1), [-12345, 'SIGKILL']);
  assert.equal(process.listenerCount('SIGINT'), before);
});

test('cleanup retains exited process groups in case browser descendants survived', { skip: process.platform === 'win32' }, async () => {
  const signals = [];
  const r = createRuntime({
    spawnProcess() {
      const child = Object.assign(new EventEmitter(), { pid: 12345 });
      queueMicrotask(() => child.emit('exit', 1));
      return child;
    },
    killProcess: (...args) => signals.push(args),
  });
  try { assert.equal(await r.test('fixtures', []), 1); } finally { await r.cleanup(); }
  assert.deepEqual(signals, [[-12345, 'SIGTERM'], [-12345, 'SIGKILL']]);
});
