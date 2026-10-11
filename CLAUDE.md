# School Procurement & Warehouse Platform

A web app for the procurement department of a private school with several branches. It replaces the paper order request form (approved by Head, then Principal, then Finance) and the warehouse records of every branch. About 20 to 30 users; the interface is in Uzbek, Russian and English.

The spec in `docs/spec/` is the source of truth. Start at `docs/spec/00-index.md`.

## What matters most

1. **Money and stock are always correct.** A wrong total, cash balance or stock number is the worst possible bug.
2. **Nobody sees or changes another branch's data, and nobody does another role's action.**
3. **The approval order cannot be skipped or repeated wrongly:** Head, Principal, Finance, with every move in the history.

When two goals pull apart, the higher one wins. Speed and looks come after all three.

## Rules that are never broken

Each has a test or a database constraint. Sources are files in `docs/spec/`.

1. Every formula lives once, as a pure function in `src/domain/`. A second copy drifts, and then screen, PDF and report disagree. (`edge-cases/developer-rules.md` rule 1)
2. One state-machine file decides every status move. The screen asks it for buttons; the server asks it again. (rule 2; `06-approval-workflow.md`)
3. Every write goes through the action wrapper: check permission, lock, check status and version, write, history event, notifications, in one transaction. Half-saved money is worse than an error. (rule 3)
4. Every server action and every query calls `authorize()`; lists filter by branch inside the SQL. Hiding a button protects nothing. (rule 4; `03-roles-and-permissions.md`)
5. The database is the last defence: stock CHECK ≥ 0, unique numbers, enums, amount CHECKs, a foreign key on every relation. (rule 5; `14-data-model.md`)
6. Money is whole so'm in `bigint`, quantities are `numeric(14,3)`, rounding is half up, and no JavaScript float touches money. (rule 6; `08-money-and-settlement.md`)
7. Stock movements, money entries and request events are append-only. A correction is a new row. (rule 7)
8. Every create action carries a browser-made id; the same id twice returns the first result. Bad internet must not buy things twice. (rule 8)
9. A request has a version; a write with an old version is refused. (rule 9)
10. Timestamps are UTC; business dates are `Asia/Tashkent`; time comes from the injected clock, never from `new Date()`. (rule 10)
11. Nothing with data is deleted, only deactivated. The one exception is a draft that was never submitted. (rule 11; `04-catalogs.md` rule 2)
12. The planned lines of an Open request never change. (`06-approval-workflow.md` rule 6)
13. No text is written in a screen. Every label comes from the `uz`, `ru` and `en` files. (`11-screens-and-ux.md` rule 14)

## Stack

From `docs/spec/13-technology.md`. Do not add or swap a library without asking.

Next.js 16 (App Router, Server Components to read, Server Actions to write; no REST API) · TypeScript strict · PostgreSQL 17 · Drizzle ORM with SQL migrations · Better Auth with the username plugin · Tailwind CSS, shadcn/ui, Material Symbols Rounded, TanStack Table · Golos Text and Bitter · React Hook Form with Zod · next-intl · Cloudflare R2 (MinIO locally) with sharp · ExcelJS · @react-pdf/renderer · Recharts · decimal.js · Vitest and Playwright · Docker, DigitalOcean App Platform in Frankfurt. Package manager: npm.

## Repository layout

```
src/app/            routes and screens
src/domain/         pure business rules and the state machine; no imports from outside this folder
src/server/         db (schema, client), auth, authorize, action wrapper, clock, jobs, storage
src/features/<area> actions/, queries/ and components/ of one area (catalog, requests, purchasing, money, warehouse, analytics)
src/components/     shared interface parts; ui/ holds shadcn components
src/i18n/           messages/uz.json, ru.json, en.json and the formatters
drizzle/            SQL migrations, never edited after merge
tests/              helpers (database, clock, invented users) and e2e/ for Playwright
scripts/            seed, first Head, checks
docs/               spec, build plan, progress, decisions
```

## Commands

```
docker compose up -d        PostgreSQL
npm run dev                 the app on localhost
npm run lint                ESLint and the Prettier check
npm run format              Prettier rewrites the files
npm run typecheck           tsc
npm test                    unit and database tests
npm run test:e2e            Playwright
npm run db:migrate          apply migrations
npm run db:seed             invented demo data
```

## How to work on a task

One task per session, one session at a time in this folder.

1. `/next-task` reads the task, writes a plan with numbered questions, opens a draft pull request and stops.
2. The reviewer posts a `[review]` comment on the pull request. Build only after `[review] approved`.
3. Build exactly the plan. A business rule the spec does not give is a question, never a guess.
4. `/finish-task` runs the checks and both reviewers, ticks the task, writes progress and decisions, and stops.
5. The owner merges. Nobody else merges, ever.

`docs/spec/` is read-only. If the spec must change, stop and say: run `/spec-change` in its own session on `main`.

## Conventions

- Tests come with the code, and each test names the spec rule it checks.
- A bug is fixed by first writing the test that fails.
- Names, phones and ids in tests, seeds and examples are invented. Real personal data never enters the repository, a test, a log or a chat.
- Secrets live in provider dashboards and the local `.env` only. Never ask for one in chat, never print one, never write one to a file.
- Every change to catalogs, users and settings writes an audit row in the same transaction.
- Interface texts are written in all three languages in the same task; the owner corrects Uzbek and Russian later.
- Technical choices made alone go into `docs/decisions.md` with the date and the reason.
- Commits are small and say what changed. Branches are `task/<id>-<name>`.

## Definition of done for a task

- Everything under **Build** exists and nothing more; **Done when** is met and shown.
- Lint and typecheck pass with no warnings; all tests pass, earlier phases included.
- New actions are in the permission-matrix test; new rules each have a test that names them.
- Migrations run on an empty database and the seed still runs.
- New screens were opened at 375 px and 1440 px; no translation key is missing.
- `build-plan.md` is ticked; `progress.md` and `decisions.md` are written; the report has hand-test steps.

## Ask before you do any of these

- Add, remove or upgrade a dependency.
- Edit anything under `docs/spec/`, or build anything from `17-later-ideas.md`.
- Change a merged migration, or drop a column or table.
- Decide a business rule, an open question, or anything about money, stock or permissions the spec does not state.
- Touch hosting, DNS, environment variables or anything that costs money.
- Skip, weaken or delete a test.
