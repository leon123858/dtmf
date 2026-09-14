import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isHeaded } from './check-e2e-browser.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendDirectory = fileURLToPath(new URL('../../dtm/', import.meta.url));
const local = path => fileURLToPath(new URL(path, import.meta.url));

export function optionsFor(args, env = process.env) {
  const check = args.includes('--check');
  const playwrightArgs = args.filter(arg => arg !== '--check');
  const headed = isHeaded(playwrightArgs, env);
  if (headed && !playwrightArgs.includes('--headed')) playwrightArgs.push('--headed');
  return { check, headed, playwrightArgs };
}

// Keep suite ordering and failure aggregation independent of process management.
export async function runWorkflow(options, runtime) {
  const results = [];
  async function runSuite(name) {
    try { results.push([name, await runtime.test(name, options.playwrightArgs)]); }
    catch (error) { runtime.log(error); results.push([name, 1]); }
  }
  try {
    await runtime.probe(options.headed);
    await runtime.frontend();
    if (!options.check) await runSuite('fixtures');
    try {
      await runtime.backend();
      if (!options.check) await runSuite('integration');
    } catch (error) {
      runtime.log(error);
      results.push(['backend', 1]);
    }
    runtime.log(options.check && !results.length ? '[E2E] Environment check passed.' :
      `[E2E] Results: ${results.map(([name, code]) => `${name}: ${code === 0 ? 'PASSED' : 'FAILED'}`).join(', ')}`);
    return results.some(([, code]) => code !== 0) ? 1 : 0;
  } catch (error) {
    runtime.log(error);
    return 1;
  } finally {
    await runtime.cleanup();
  }
}

export function createRuntime({ spawnProcess = spawn, killProcess = process.kill, request = fetch,
  env = process.env, now = Date.now, sleep = delay } = {}) {
  const backendTimeout = Number(env.E2E_BACKEND_TIMEOUT_MS ?? 120_000);
  if (!Number.isSafeInteger(backendTimeout) || backendTimeout <= 0) {
    throw new Error('[E2E] E2E_BACKEND_TIMEOUT_MS must be a positive integer.');
  }
  const isWin = process.platform === 'win32';
  const children = new Set();
  let interrupted = 0;
  const controller = new AbortController();
  const signalChildren = signal => {
    for (const state of children) {
      if (!state.child.pid) continue;
      try {
        if (isWin) execFileSync('taskkill', ['/pid', String(state.child.pid), '/t', '/f'], { stdio: 'ignore' });
        else killProcess(-state.child.pid, signal);
      } catch (error) {
        if (!isWin && error.code !== 'ESRCH') console.error('[E2E] Cleanup failed:', error);
      }
    }
  };
  const handlers = [['SIGINT', 130], ['SIGTERM', 143]].map(([signal, code]) => {
    const handler = () => {
      interrupted = code;
      controller.abort();
      signalChildren('SIGTERM');
    };
    process.on(signal, handler);
    return [signal, handler];
  });
  function assertRunning() {
    if (interrupted) throw new Error('[E2E] Interrupted.');
  }
  function start(command, args, cwd = root, env = process.env) {
    assertRunning();
    const child = spawnProcess(command, args, { cwd, env, stdio: 'inherit', detached: !isWin, shell: isWin && command !== process.execPath });
    const state = { child, done: false, error: null };
    state.completion = new Promise(resolve => {
      child.once('error', error => { state.error = error; state.done = true; resolve(1); });
      child.once('exit', code => { state.done = true; resolve(code ?? 1); });
    });
    children.add(state);
    return state;
  }
  async function execute(command, args, env) {
    const state = start(command, args, root, env);
    // Abort lets finally clean up even if a child ignores SIGTERM.
    const onAbort = new Promise(resolve => {
      if (controller.signal.aborted) resolve(1);
      else controller.signal.addEventListener('abort', () => resolve(1), { once: true });
    });
    const code = await Promise.race([state.completion, onAbort]);
    // Retain the process group for cleanup even if its leader exited unexpectedly.
    assertRunning();
    if (state.error) throw state.error;
    return code;
  }
  async function healthy(url, backend = false) {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(1000) });
      return response.ok && (!backend || (await response.json()).status === 'ok');
    } catch { return false; }
  }
  async function waitReady(state, url, backend = false) {
    const timeout = backend ? backendTimeout : 120_000;
    const deadline = now() + timeout;
    while (now() < deadline) {
      assertRunning();
      if (state?.done) throw new Error(`[E2E] Service exited before ready: ${state.error?.message ?? url}`);
      if (await healthy(url, backend)) return;
      await sleep(500);
    }
    throw new Error(`[E2E] Service startup timed out after ${timeout / 1000} seconds: ${url}`);
  }
  return {
    get interrupted() { return interrupted; },
    log: message => console.log(message),
    async probe(headed) {
      console.log(`[E2E] Checking Chromium (${headed ? 'headed' : 'headless'}).`);
      const code = await execute(process.execPath, [local('./check-e2e-browser.mjs'), ...(headed ? ['--headed'] : [])]);
      if (code !== 0) throw new Error('[E2E] Browser preflight failed; services and tests were not started.');
    },
    async frontend() {
      // Never silently test against a frontend with unknown API configuration.
      if (await healthy('http://127.0.0.1:3100')) throw new Error('[E2E] Port 3100 is already serving HTTP. Stop that frontend before running E2E.');
      console.log('[E2E] Starting frontend on port 3100.');
      const state = start(process.execPath, [local('../node_modules/next/dist/bin/next'), 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', '3100'], root, {
        ...process.env, NEXT_PUBLIC_API_HTTP_URL: 'http://127.0.0.1:8080', NEXT_PUBLIC_API_WS_URL: 'ws://127.0.0.1:8080', ADMIN_KEY: '',
      });
      await waitReady(state, 'http://127.0.0.1:3100');
    },
    async backend() {
      assertRunning();
      if (env.E2E_EXTERNAL_BACKEND === '1') {
        console.log('[E2E] Waiting for external backend on port 8080.');
        await waitReady(null, 'http://127.0.0.1:8080/health', true);
        return;
      }
      if (await healthy('http://127.0.0.1:8080/health', true)) {
        console.log('[E2E] Reusing healthy backend on port 8080.');
        return;
      }
      console.log('[E2E] Starting backend: cd ../dtm && make serve');
      await waitReady(start('make', ['serve'], backendDirectory), 'http://127.0.0.1:8080/health', true);
    },
    async test(suite, args) {
      console.log(`[E2E] Running ${suite}.`);
      return execute(process.execPath, [local('../node_modules/@playwright/test/cli.js'), 'test', ...args, `--project=${suite}`], {
        ...process.env, E2E_HEADED: isHeaded(args, process.env) ? '1' : '0', PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${suite}`,
      });
    },
    async cleanup() {
      signalChildren('SIGTERM');
      if (children.size) { await delay(1000); signalChildren('SIGKILL'); }
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = createRuntime();
  const code = await runWorkflow(optionsFor(process.argv.slice(2)), runtime);
  process.exitCode = runtime.interrupted || code;
  if (code && !runtime.interrupted) console.error('[E2E] Diagnose environment problems with yarn test:e2e:check.');
}
