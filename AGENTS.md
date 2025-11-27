# Repository Guidelines

## Project Structure & Module Organization
- `src/app`: Next.js App Router routes/layouts; default to server components, add `use client` only when needed.
- `src/components`: Reusable UI built with Tailwind + shadcn primitives; extend here before adding new atoms.
- `src/lib`: Utilities/validators; `middleware.ts` (root) handles auth/localization.
- `src/trpc`: tRPC routers and client bindings.
- `src/scripts`: Maintenance scripts such as `generateCurrencyData.ts` (run with `ts-node -T`).
- `prisma`: Schema and migrations; commit `prisma/migrations/` with schema updates.
- `public`: Static assets; add logos/icons here.
- Tests currently at `src/lib/utils.test.ts`; keep new `*.test.ts(x)` beside the code.
- Config roots: `next.config.mjs`, `tailwind.config.js`, `jest.config.ts`, `tsconfig.json`.

## Build, Test, and Development Commands
- `npm run dev`: Start dev server on :3000 (needs `.env` + Postgres; `./scripts/start-local-db.sh` starts a local instance).
- `npm run build` → `npm run start`: Production build and serve.
- `npm run lint`: Next/ESLint rules; fix before pushing.
- `npm run check-types`: Type-check with `tsc --noEmit`.
- `npm run test`: Jest (jsdom) unit/component suite.
- `npm run check-formatting` / `npm run prettier`: Check or write Prettier formatting in `src`.
- `npm run build-image` + `npm run start-container`: Build Docker image and run app + Postgres via Compose (`container.env`).

## Coding Style & Naming Conventions
- TypeScript, functional React components; prefer server components.
- Tailwind for styling; reuse shadcn components to stay consistent.
- Naming: components/hooks in PascalCase (`GroupList.tsx`, `useGroup.ts`); utilities in camelCase (`currency.ts`); route segments follow Next folder conventions.
- Prettier + `prettier-plugin-organize-imports` manage formatting/import order; keep code lint-clean.

## Testing Guidelines
- Jest with `@testing-library/react` for UI; place `*.test.ts(x)` next to targets.
- Favor deterministic tests with local helpers/factories; avoid global state.
- Run `npm run test` before pushing; cover currency math, permissions, and TRPC surfaces you touch.

## Commit & Pull Request Guidelines
- Commits: short, imperative subjects (e.g., `Add shared password banner`); keep scope tight.
- PRs: state intent, summarize key changes, link issues, and add screenshots/GIFs for UI. Call out env flags or migrations (`npx prisma migrate dev`) needed for review.
- Require clean lint, types, and tests prior to review.

## Security & Configuration Tips
- Copy `.env.example` to `.env`; never commit secrets.
- Prisma migrations belong in git; skip committing local databases. Document feature toggles (open group mode, shared password, receipt/category extraction, S3 uploads, OpenAI) and operational impact in PRs.
