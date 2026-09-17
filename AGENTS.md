# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 15 TypeScript frontend for Division Trip Money. App code lives in `src/app`.

- `src/app/page.tsx`, `layout.tsx`, and route folders define App Router pages.
- `src/app/components/` contains reusable React UI components.
- `src/app/context/` contains shared React providers.
- `src/app/lib/` contains domain types, utilities, storage helpers, static actions, and GraphQL API clients under `tripApi/`.
- `public/` stores favicon and PWA icon assets.
- Root config lives in `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, and `dockerfile`.

Browser end-to-end tests live in `e2e/`, with Playwright configuration in `playwright.config.ts` and backend orchestration in `scripts/test-e2e.mjs`.

## Build, Test, and Development Commands

Use Yarn, as the repository includes `yarn.lock`.

- `yarn dev`: start the local Next.js dev server with Turbopack.
- `yarn build`: create a production Next.js build.
- `yarn start`: run the production server after building.
- `yarn lint`: run Next.js ESLint checks.
- `yarn docker`: build the Docker image tagged `dtmf`.

Local development also requires the backend from `github.com/leon123858/dtm`; see `README.md` for Postgres and backend commands.

## Coding Style & Naming Conventions

Write TypeScript and React function components. Keep component filenames in PascalCase, such as `MoneyShare.tsx`, and route folders in lowercase or Next.js dynamic segment syntax, such as `trip/[tripId]/page.tsx`. Prefer the `@/*` source import alias.

Follow ESLint (`next/core-web-vitals` and `next/typescript`) and keep TypeScript strict-safe. Use clear domain names for trip, record, address, and money-sharing logic. Keep shared API types in `src/app/lib/tripApi/types.ts` or `src/app/lib/types.ts`.

## Testing Guidelines

Run `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test:node`, and `yarn test:e2e` before submitting changes. Install Chromium once with `yarn playwright install chromium`.

- `yarn test:e2e`: run all E2E specs once, headlessly, with one worker and no retries.
- `yarn test:e2e:headed`: run the same specs in a visible browser with a 200ms delay between browser operations, without Inspector. `yarn test:e2e --headed` also works.
- `yarn test:e2e:check`: verify Playwright/Chromium, frontend startup, and backend health without running specs. Add `--headed` to verify the display too.
- `yarn test:node`: run browser preflight, runner orchestration, trip action, and Apollo cache/synchronization tests with Node's built-in test runner.

`scripts/test-e2e.mjs` owns preflight, service startup, sequential suite execution, result aggregation, and cleanup. Add intercepted GraphQL specs under `e2e/fixtures/` and real-backend specs under `e2e/integration/`; Playwright discovers them automatically without package.json edits. Fixtures run first, then integration. A failed suite does not prevent the other runnable suite from executing. Reports are stored in `playwright-report/<suite>/`; screenshots, traces, and attached JSON measurements in `test-results/<suite>/`.

Browser preflight launches and closes Chromium with a 30-second timeout before starting services. Failures preserve the original error and repair guidance, return nonzero, and never install dependencies automatically. Headed/Inspector mode is respected; only preflight disables Inspector's unlimited timeout.

The runner starts its own frontend on port 3100 and rejects an already-running frontend. It reuses a healthy backend on port 8080 or runs `make serve` in `../dtm`, with a 120-second readiness timeout. Backend failure returns nonzero, even when fixture tests pass. Tests create unique trips and do not clear existing backend data. Exit and interruption clean up only services started by the runner; a reused backend remains running.

When adding a test framework, add the command to `package.json` and update this guide with the exact invocation.

## Trip Query and Cache Rules

`SingleTripProvider` owns trip loading and the single 20-second polling timer. Components read Apollo cache through the shared provider. Only page entry, polling, explicit refresh/retry, and history-mode changes may query a trip; ordinary tab changes and mutations must not.

Successful mutations update both existing cache variants using the returned data. Record edits/deletions create versions: retire the edited/parent record and upsert the returned version, retaining history. Settlement amounts and trip validity remain server snapshots until the next query. Slow query results must replay mutations completed during the request before entering cache. Keep request-count and race-condition coverage in `e2e/fixtures/trip-cache.spec.ts` and `scripts/trip-cache.test.mjs`.

## Commit & Pull Request Guidelines

Recent commits use short, imperative or descriptive lowercase messages, for example `set google sheet link` and `support full payback function`. Keep each commit focused.

Pull requests should include a summary, reason for change, screenshots or screen recordings for UI updates, and verification steps such as `yarn lint` and `yarn build`. Link related issues when available and call out backend or environment assumptions.

## Security & Configuration Tips

Do not commit credentials, secret backend URLs, or local database state. Keep `.next/` and `node_modules/` out of commits. When touching GraphQL client code, verify query, mutation, and subscription behavior against the expected backend version.

## E2E CI

`.github/workflows/e2e.yml` runs on PRs and manual dispatch and is reusable through `workflow_call`. The image publication workflow calls it before `build-and-push`, including main pushes and manual releases. Preserve this dependency so failed tests block GHCR and GCP publication.

CI runs `make serve` from a fresh backend default-branch clone inside `golang:1.25-bookworm` (memory database / Go channel), publishing port 8080 to runner loopback. A Playwright container uses host networking and runs `yarn test:node` and `yarn test:e2e`. Keep its `PLAYWRIGHT_VERSION` synchronized with the installed lockfile version; no browser installation is needed in CI.

`E2E_EXTERNAL_BACKEND=1` makes the runner wait for the external backend without local fallback or ownership. `E2E_BACKEND_TIMEOUT_MS` is a positive integer, defaults to 120000, and is 300000 in CI. Local defaults remain unchanged. Always retain diagnostics and clean up workflow-owned containers. Artifacts include backend commit SHA, container logs, and existing E2E outputs, retained for 14 days; job timeout is 20 minutes.
