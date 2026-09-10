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

Run `yarn lint`, `yarn typecheck`, `yarn build`, and `yarn test:e2e` before submitting changes. Install Chromium once with `yarn playwright install chromium`. Use `yarn test:e2e --headed` to watch the browser.

The E2E runner reuses a healthy backend on port 8080 or runs `make serve` in `../dtm`. Backend startup failure or a 120-second startup timeout prints SKIPPED and exits successfully; frontend/browser/assertion failures remain failures. Tests create unique trips and do not clear existing backend data.

When adding a test framework, add the command to `package.json` and update this guide with the exact invocation.

## Commit & Pull Request Guidelines

Recent commits use short, imperative or descriptive lowercase messages, for example `set google sheet link` and `support full payback function`. Keep each commit focused.

Pull requests should include a summary, reason for change, screenshots or screen recordings for UI updates, and verification steps such as `yarn lint` and `yarn build`. Link related issues when available and call out backend or environment assumptions.

## Security & Configuration Tips

Do not commit credentials, secret backend URLs, or local database state. Keep `.next/` and `node_modules/` out of commits. When touching GraphQL client code, verify query, mutation, and subscription behavior against the expected backend version.
