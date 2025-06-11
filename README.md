# Division Trip Money Frontend (DTMF)

This repo is the frontend of https://github.com/leon123858/dtm

## Feature

version 0.0.1

- query and mutation in backend
- do not release subscription now

## quick start

- database: run `docker run -d --name dtm-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres`
- backend: run `go run dtm.go serve --dev=false --mq=gochan`
- frontend: run `yarn dev`
