import { spawn, execSync } from 'node:child_process';
const isWin = process.platform === 'win32';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendDirectory = fileURLToPath(new URL('../../dtm/', import.meta.url));
const children = [];
let interrupted = false;
let forceStopTimer;

function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', detached: !isWin, shell: isWin && command !== process.execPath });
  const state = { child, done: false, error: null, completion: null };
  state.completion = new Promise(resolve => {
    child.once('error', error => { state.error = error; state.done = true; resolve(1); });
    child.once('exit', code => { state.done = true; resolve(code ?? 1); });
  });
  children.push(state);
  return state;
}

function signalChildren(signal) {
  for (const { child } of children) {
    if (!child.pid) continue;
    try {
      if (isWin) {
        execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, signal);
      }
    } catch (error) {
      if (!isWin && error.code !== 'ESRCH') {
        console.error(`[E2E] Cleanup failed (${signal}, pid ${child.pid}):`, error);
        if (!process.exitCode) process.exitCode = 1;
      }
    }
  }
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => {
    interrupted = true;
    process.exitCode = code;
    signalChildren('SIGTERM');
    forceStopTimer ??= setTimeout(() => signalChildren('SIGKILL'), 5000);
  });
}

async function healthy() {
  try {
    const response = await fetch('http://127.0.0.1:8080/health', {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok && (await response.json()).status === 'ok';
  } catch { return false; }
}

async function main() {
  console.log('[E2E] Checking Chromium before starting services.');
  const probe = start(process.execPath, [
    fileURLToPath(new URL('./check-e2e-browser.mjs', import.meta.url)),
    ...process.argv.slice(2),
  ], root);
  const probeCode = await probe.completion;
  if (interrupted) return;
  if (probeCode !== 0) {
    console.error('[E2E] Browser preflight failed; services and tests were not started.', probe.error ?? '');
    process.exitCode = probeCode;
    return;
  }
  if (!(await healthy())) {
    console.log('[E2E] Starting backend: cd ../dtm && make serve');
    const backend = start('make', ['serve'], backendDirectory);
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (!interrupted && !backend.done && Date.now() < deadline) {
      if (await healthy()) { ready = true; break; }
      await delay(500);
    }
    if (interrupted) return;
    if (!ready || backend.done) {
      console.log(`[E2E] SKIPPED: backend unavailable (${backend.error?.message ?? (backend.done ? 'make serve exited' : 'startup timed out after 120 seconds')}).`);
      return;
    }
  } else {
    console.log('[E2E] Reusing healthy backend on port 8080.');
  }
  if (interrupted) return;
  const runner = start(process.execPath, [
    fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
    'test', ...process.argv.slice(2),
  ], root);
  const code = await runner.completion;
  if (!interrupted) {
    if (runner.error) console.error('[E2E] Could not start Playwright:', runner.error);
    else if (code !== 0) console.error(`[E2E] Playwright exited with code ${code}. Check the Next.js/Playwright output above for startup or test errors.`);
    process.exitCode = code || process.exitCode;
  }
}

try { await main(); }
catch (error) {
  console.error('[E2E] Runner failed:', error);
  if (!interrupted) process.exitCode = 1;
}
finally {
  if (process.exitCode !== 0 && !interrupted) {
    console.error('\n[E2E] Tip: If tests failed due to environment or browser issues, run `yarn test:e2e:check` to diagnose.');
  }
  clearTimeout(forceStopTimer);
  signalChildren('SIGTERM');
  if (children.length) {
    await delay(1000);
    signalChildren('SIGKILL');
  }
}
