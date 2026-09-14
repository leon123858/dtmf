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

## E2E testing

Install dependencies with `yarn install` and Chromium with `yarn playwright install chromium`. The backend checkout must be available at `../dtm`, or a healthy backend must already be running on port 8080. Port 3100 must be free.

```sh
yarn test:e2e:check           # browser, frontend startup, backend health; no specs
yarn test:e2e                # all specs, headless
yarn test:e2e:headed         # all specs, visible browser with a 200ms delay between browser operations
yarn test:e2e:check --headed # also check that a graphical display is available
yarn test:node               # runner and browser preflight unit tests
```

The single runner executes `e2e/fixtures/**/*.spec.ts` first and `e2e/integration/**/*.spec.ts` second. Add new specs to the appropriate directory; no package.json changes are needed. Each suite runs once with one worker and no retries. Headed mode does not open Inspector or pause execution; use an explicit `--debug` when debugging interactively.

Preflight failures stop before services start. Backend startup failures and test failures return nonzero; fixture failures still allow integration tests to run. The runner shuts down its own services on completion or Ctrl+C and leaves a reused backend running. Environment checks start and clean up services but never create test trips.

Reports: `playwright-report/fixtures/` and `playwright-report/integration/`. Screenshots, traces, and JSON layout measurements: `test-results/<suite>/`. For example, use `yarn playwright show-report playwright-report/fixtures` to inspect fixture results.
