import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBrowser, isHeaded } from './check-e2e-browser.mjs';

test('probe launches with a timeout and closes the browser in both modes', async () => {
  for (const headed of [false, true]) {
    let closed = false;
    await checkBrowser({ headed, loadPlaywright: async () => ({ chromium: {
      launch: async options => {
        assert.deepEqual(options, { headless: !headed, timeout: 30_000 });
        return { close: async () => { closed = true; } };
      },
    } }) });
    assert.equal(closed, true);
  }
});

for (const [message, hint] of [
  ["Executable doesn't exist at /missing/chromium", 'yarn playwright install chromium'],
  ['Host system is missing dependencies to run browsers.', '--with-deps chromium'],
  ['error while loading shared libraries: libfoo.so', '--with-deps chromium'],
  ['Missing X server or $DISPLAY', 'No display is available'],
  ['Unexpected browser crash', 'Inspect the original browser error'],
]) {
  test(`diagnoses ${message} and retains the cause`, async () => {
    const cause = new Error(message);
    await assert.rejects(checkBrowser({ loadPlaywright: async () => ({ chromium: {
      launch: async () => { throw cause; },
    } }) }), error => error.message.includes(hint) && error.cause === cause);
  });
}

test('dependency import and cleanup errors remain failures', async () => {
  const cause = new Error('test error');
  await assert.rejects(checkBrowser({ loadPlaywright: async () => { throw cause; } }),
    error => error.message.includes('yarn install') && error.cause === cause);
  await assert.rejects(checkBrowser({ loadPlaywright: async () => ({ chromium: {
    launch: async () => ({ close: async () => { throw cause; } }),
  } }) }), error => error.message.includes('cleanup failed') && error.cause === cause);
});

test('headed detection honors Inspector but not CLI debugging', () => {
  for (const args of [['--headed'], ['--debug'], ['--debug=inspector'], ['--debug', 'inspector']]) {
    assert.equal(isHeaded(args, {}), true);
  }
  for (const args of [[], ['--debug=cli'], ['--debug', 'cli']]) {
    assert.equal(isHeaded(args, {}), false);
  }
  assert.equal(isHeaded([], { PWDEBUG: '1' }), true);
  assert.equal(isHeaded([], { PWDEBUG: '0' }), false);
});
