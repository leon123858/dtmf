import { pathToFileURL } from 'node:url';

export function isHeaded(args, env) {
  const debugIndex = args.indexOf('--debug');
  return args.includes('--headed') || (debugIndex !== -1 && args[debugIndex + 1] !== 'cli') ||
    args.includes('--debug=inspector') || env.PWDEBUG === '1';
}

export async function checkBrowser({ headed = false, loadPlaywright = () => import('@playwright/test') } = {}) {
  let playwright;
  try {
    playwright = await loadPlaywright();
  } catch (error) {
    throw new Error('[E2E] Browser preflight: cannot load Playwright. Run: yarn install', { cause: error });
  }

  let browser;
  let failure;
  try {
    browser = await playwright.chromium.launch({ headless: !headed, timeout: 30_000 });
  } catch (error) {
    const message = String(error?.message ?? error);
    let hint = 'Inspect the original browser error below.';
    if (/Executable doesn't exist/i.test(message)) {
      hint = 'Chromium is not installed for this Playwright version/user. Run: yarn playwright install chromium';
    } else if (/missing dependencies|error while loading shared libraries|cannot open shared object file/i.test(message)) {
      hint = 'Browser system dependencies are missing. On Linux, run: yarn playwright install --with-deps chromium';
    } else if (/missing X server|\$DISPLAY|cannot open display|failed to open.*display/i.test(message)) {
      hint = 'No display is available. Run without --headed/--debug and unset PWDEBUG, or configure a display server.';
    }
    failure = new Error(`[E2E] Browser preflight failed. ${hint}`, { cause: error });
  } finally {
    if (browser) {
      try { await browser.close(); }
      catch (error) {
        failure ??= new Error('[E2E] Browser preflight cleanup failed.', { cause: error });
      }
    }
  }
  if (failure) throw failure;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const headed = isHeaded(process.argv.slice(2), process.env);
  // Inspector mode disables Playwright timeouts. Only the probe ignores it.
  delete process.env.PWDEBUG;
  try {
    await checkBrowser({ headed });
    console.log('[E2E] Browser preflight passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
