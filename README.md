# Division Trip Money Frontend (DTMF)

This repo is the frontend of https://github.com/leon123858/dtm

demo: https://powerbunny.page/

## Feature

version 0.0.1

- query and mutation in backend
- do not release subscription now

## quick start

- database: run `docker run -d --name dtm-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres`
- backend: run `go run dtm.go serve --dev=false --mq=gochan`
- frontend: run `yarn dev`

## Browser E2E tests

```sh
yarn install
yarn playwright install chromium
yarn test:e2e
# Optional: watch the browser
yarn test:e2e --headed
```

The Chromium smoke test covers trip creation, member creation/rename/removal,
expense creation/editing, equal splitting, repayment/deletion, record history,
sharing and reopening a trip from browsing history.

Before starting services, the runner launches and closes Chromium with a
30-second launch timeout. Missing Playwright, Chromium, system libraries, or a
display for headed mode produce an error with the original cause and repair
guidance, and exit nonzero. Nothing is installed automatically. The probe honors
`--headed`, Inspector `--debug`, and `PWDEBUG=1`; CI defaults to headless mode.
This checks browser availability, not whether Next.js itself can start.

The runner then checks `http://127.0.0.1:8080/health`, reuses a healthy backend,
or starts it with `make serve` in `../dtm`. If backend startup fails (including
a missing directory) or takes longer than 120 seconds, it prints `SKIPPED`
with the reason and exits with code 0. This means the browser test did not run.
Frontend startup, missing browser dependencies and test failures still exit
nonzero; backend failures after testing begins are not skipped.

Playwright starts a dedicated frontend on port 3100 with local HTTP/WebSocket
API URLs and an empty `ADMIN_KEY`. Keep port 3100 free. Run this separately from
other Next.js builds/dev servers because they share `.next`. The runner targets
Linux/macOS and requires Node.js 20+, Yarn, Make and the backend's Go dependencies.
On Linux, install browser system dependencies if needed with
`yarn playwright install --with-deps chromium`.

Only processes started by the test are stopped on completion or interruption.
Each run creates a uniquely named trip in an isolated browser context. Existing
backend data is never cleared; when reusing a backend, test trips remain because
there is no trip deletion API. The default `make serve` uses an in-memory backend.

Failures retain screenshots and traces in `test-results/`; open the HTML report
with `yarn playwright show-report`. These artifacts are ignored by Git.
Preflight failures happen before tests and do not create these artifacts.
Next.js/Playwright startup and test errors retain their original terminal output.

Run browser preflight unit checks with `yarn test:e2e:preflight`.
