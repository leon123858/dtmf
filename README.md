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
```
