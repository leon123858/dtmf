import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
for (const [script, scriptArgs] of [
	['./check-e2e-browser.mjs', args],
	['../node_modules/@playwright/test/cli.js', ['test', '--config', 'playwright.records.config.ts', ...args]],
]) {
	const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...scriptArgs], { stdio: 'inherit' });
	if (result.error) console.error(result.error);
	if (result.status !== 0) process.exit(result.status ?? 1);
}
