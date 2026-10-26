# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 15 TypeScript frontend for Division Trip Money. App code lives in `src/app`.

- `src/app/page.tsx`, `layout.tsx`, and route folders define App Router pages.
- `src/app/components/` contains reusable React UI components.
- `src/app/context/` contains shared React providers.
- `src/app/lib/` contains domain types, utilities, storage helpers, static actions, and GraphQL API clients under `tripApi/` and `userApi/`, with shared transport under `graphClient/`.
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

Follow ESLint (`next/core-web-vitals` and `next/typescript`) and keep TypeScript strict-safe. Use clear domain names for trip, record, address, and money-sharing logic. Keep domain API types in `src/app/lib/tripApi/types.ts` or `src/app/lib/userApi/types.ts`, and general shared types in `src/app/lib/types.ts`.

## Testing Guidelines

Run `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test:node`, and `yarn test:e2e` before submitting changes. Install Chromium once with `yarn playwright install chromium`.

- `yarn test:e2e`: run all E2E specs once, headlessly, with one worker and no retries.
- `yarn test:e2e:headed`: run the same specs in a visible browser with a 200ms delay between browser operations, without Inspector. `yarn test:e2e --headed` also works.
- `yarn test:e2e:check`: verify Playwright/Chromium, frontend startup, and backend health without running specs. Add `--headed` to verify the display too.
- `yarn test:node`: run browser preflight, runner orchestration, trip action, authentication store, and Apollo cache/synchronization tests with Node's built-in test runner.

`scripts/test-e2e.mjs` owns preflight, service startup, sequential suite execution, result aggregation, and cleanup. Add intercepted GraphQL specs under `e2e/fixtures/` and real-backend specs under `e2e/integration/`; Playwright discovers them automatically without package.json edits. Fixtures run first, then integration. A failed suite does not prevent the other runnable suite from executing. Reports are stored in `playwright-report/<suite>/`; screenshots, traces, and attached JSON measurements in `test-results/<suite>/`.

Browser preflight launches and closes Chromium with a 30-second timeout before starting services. Failures preserve the original error and repair guidance, return nonzero, and never install dependencies automatically. Headed/Inspector mode is respected; only preflight disables Inspector's unlimited timeout.

The runner starts its own frontend on port 3100 and rejects an already-running frontend. It reuses a healthy backend on port 8080 or runs `make serve` in `../dtm`, with a 120-second readiness timeout. Backend failure returns nonzero, even when fixture tests pass. Tests create unique trips and do not clear existing backend data. Exit and interruption clean up only services started by the runner; a reused backend remains running.

When adding a test framework, add the command to `package.json` and update this guide with the exact invocation.

## Trip Query and Cache Rules

`SingleTripProvider` owns trip loading and the single 20-second polling timer. Components read domain snapshots through the shared provider. `TripApi` encapsulates GraphQL requests and `TripCache`; React hooks expose domain inputs and operation state, never Apollo options/results. Only page entry, polling, explicit refresh/retry, and history-mode changes may query a trip; ordinary tab changes and mutations must not.

Successful mutations update both existing cache variants using the returned data. Record edits/deletions create versions: retire the edited/parent record and upsert the returned version, retaining history. Settlement amounts, member statistics, and trip validity remain server snapshots until the next query. Snapshot mutation payloads must be converted to query typenames before entering the trip cache; member renames preserve statistics and new members use null statistics until queried. The settlement/statistics view switch is local UI state and must not query a trip. TripCache owns a shared per-Apollo-cache, per-trip FIFO operation lock covering each network request through its cache commit. Mutations always queue. Only an active refresh with matching tripId/haveHistory shares its Promise, even when a writer is waiting; queued refreshes do not coalesce. Background polling retains setInterval, skips until at least 20 seconds after the last refresh completion (success or failure), and never accumulates queued background work. Foreground refresh/retry and history changes bypass the time gate. Keep request-count and race-condition coverage in `e2e/fixtures/trip-cache.spec.ts` and `scripts/trip-cache.test.mjs`.

## Commit & Pull Request Guidelines

Recent commits use short, imperative or descriptive lowercase messages, for example `set google sheet link` and `support full payback function`. Keep each commit focused.

Pull requests should include a summary, reason for change, screenshots or screen recordings for UI updates, and verification steps such as `yarn lint` and `yarn build`. Link related issues when available and call out backend or environment assumptions.

## Security & Configuration Tips

Do not commit credentials, secret backend URLs, or local database state. Keep `.next/` and `node_modules/` out of commits. When touching GraphQL client code, verify query, mutation, and subscription behavior against the expected backend version.

## E2E CI

`.github/workflows/e2e.yml` runs on PRs and manual dispatch and is reusable through `workflow_call`. The image publication workflow calls it before `build-and-push`, including main pushes and manual releases. Preserve this dependency so failed tests block GHCR and GCP publication.

CI runs `make serve` from a fresh backend default-branch clone inside `golang:1.25-bookworm` (memory database / Go channel), publishing port 8080 to runner loopback. A Playwright container uses host networking and runs `yarn test:node` and `yarn test:e2e`. Keep its `PLAYWRIGHT_VERSION` synchronized with the installed lockfile version; no browser installation is needed in CI.

`E2E_EXTERNAL_BACKEND=1` makes the runner wait for the external backend without local fallback or ownership. `E2E_BACKEND_TIMEOUT_MS` is a positive integer, defaults to 120000, and is 300000 in CI. Local defaults remain unchanged. Always retain diagnostics and clean up workflow-owned containers. Artifacts include backend commit SHA, container logs, and existing E2E outputs, retained for 14 days; job timeout is 20 minutes.

## Authentication and Favorites

`AuthProvider` restores the versioned `dtmf:auth` localStorage session before browser HTTP requests. `authStore` owns token expiry, shared refresh and session generation; never store browser identity in a server singleton. Server creation receives an optional request-local token and reports 401 for browser-coordinated retry. HTTP retries at most once; WebSocket authentication is unchanged.

`MemberProvider` owns member lifecycle and operation state through React context. It loads `CurrentUser` once per restored/new login, serializes favorite mutations, delegates id-only mutations and cache writes to a session-scoped `UserApi`, and disposes the old API on session changes. `UserApi` checks session validity and member ID before writes, retains current trip-name overlays, and applies operation metadata through private `UserCache`/`UserChange` rules. Member data lives only in the shared Apollo cache; there is no separate singleton store. `ApolloWrapper` composes trip/user cache policies and the domain `ApiProvider` above `MemberProvider`. Domain API composition is in `src/app/lib/ApiProvider.tsx`; shared GraphQL transport must not import domain modules. Providers observe cache-only domain subscriptions with `useSyncExternalStore`; subscribing or reading a snapshot must not query. Server actions use a request-local domain API and domain errors. See `docs/api-architecture.md` for ownership and interfaces. `auth/store.ts` contains the REST authorization core and session store; `auth/fetch.ts` adds Bearer authentication and coordinates HTTP retry. No member polling or query on token refresh/client-side navigation. Trip creation relies on backend automatic subscription and performs a full navigation to the new trip, so normal member initialization restores the updated favorites; do not issue an extra subscribe mutation or add a separate creation sync/retry flow. Favorite controls require successful initialization. Only the trip drawer checkbox changes favorites; history is read-only with all/local/favorites filters. Entry writes one local timestamp and touches an existing favorite once, including delayed member initialization; polling, tab switches and mutations must not change timestamps. Query/rename updates names without touching timestamps. Local history retains 20 entries; account favorites have no frontend cap.

E2E builds an isolated `.next-e2e` production frontend with compile-time `E2E_FRONTEND_ENABLE=true`, then starts it on 3100. Any other flag value disables the test login UI. `E2E_MEMBER_ENABLED=1 yarn test:e2e` enables real member coverage against a backend configured with `E2E_AUTH_ENABLED=true`, `GCIP_PROJECT_ID`, `GCIP_API_KEY`, `E2E_AUTH_EMAIL`, and `E2E_AUTH_PASSWORD`. CI uses four matching Secrets only in the backend container; missing Secrets explicitly skip real member tests, never fixtures or anonymous tests. Enabled login failures fail the suite. Keep image publication dependent on E2E and pass only the four named auth Secrets to the reusable workflow. Scope auth Secrets to the backend startup step; derive E2E_AUTH_ENABLED there and pass the non-secret member_enabled output to the test step.
