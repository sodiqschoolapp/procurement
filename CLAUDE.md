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
7. Stock movements, money actions and rows, and order events are append-only. A correction is a new row. (rule 7)
8. Every create action carries a browser-made id; the same id twice returns the first result. Bad internet must not buy things twice. (rule 8)
9. An order has a version; a write with an old version is refused, and an action on ticked orders is all or nothing. (rule 9; `06-approval-workflow.md` rule 8)
10. Timestamps are UTC; business dates are `Asia/Tashkent`; time comes from the injected clock, never from `new Date()`. (rule 10)
11. Nothing with data is deleted, only deactivated. The one exception is a draft that was never submitted. (rule 11; `04-catalogs.md` rule 2)
12. The plan of an Open order never changes. (`06-approval-workflow.md` rule 6)
13. No text is written in a screen. Every label comes from the `uz`, `ru` and `en` files. (`11-screens-and-ux.md` rule 14)

## Stack

From `docs/spec/13-technology.md`. A library that is not on this line is a new dependency: a **Look first** decision ("Stop and wait for the owner").

Next.js 16 (App Router, Server Components to read, Server Actions to write; no REST API) · TypeScript strict · PostgreSQL 17 · Drizzle ORM with SQL migrations · Better Auth with the username plugin · Tailwind CSS, shadcn/ui, Material Symbols Rounded, TanStack Table · Golos Text and Bitter · React Hook Form with Zod · next-intl · Cloudflare R2 (MinIO locally) with sharp · ExcelJS · @react-pdf/renderer · Recharts · decimal.js · Vitest and Playwright · Docker, DigitalOcean App Platform in Frankfurt. Package manager: npm.

## Repository layout

```
src/app/            routes and screens
src/domain/         pure business rules and the state machine; no imports from outside this folder
src/server/         db (schema, client), auth, authorize, action wrapper, clock, jobs, storage
src/features/<area> actions/, queries/ and components/ of one area (catalog, orders, purchasing, money, warehouse, analytics)
src/components/     shared interface parts; ui/ holds shadcn components
src/i18n/           messages/uz.json, ru.json, en.json and the formatters
drizzle/            SQL migrations, never edited after merge
tests/              helpers (database, clock, invented users) and e2e/ for Playwright
scripts/            seed, first Head, checks
docs/               spec, build plan, progress, decisions; design-system.md, shared with sodiq-platform
public/brand/       the logo files and app icons
```

## Commands

```
docker compose up -d        PostgreSQL
npm run dev                 the app on localhost
npm run lint                ESLint and the Prettier check
npm run format              Prettier rewrites the files
npm run typecheck           tsc
npm test                    unit and database tests (the whole suite; CI runs it on every pull request)
npx vitest run --changed origin/main      only the tests the change touches
npm run test:e2e            Playwright
npm run db:migrate          apply migrations
npm run db:seed             invented demo data
npm run user:first-head     the first Head of an empty database, password typed at the prompt
```

## How to work on a task

One task per session, branch and pull request. The loop runs without the owner in the middle (`docs/cloud-loop.md`): the start routine or the owner runs `/next-task`, and the review routine reviews with `/review-pr`.

1. `/next-task` reads the task, its spec files, `docs/progress.md` and the decisions, writes a plan, has the `spec-reviewer` check it, opens a draft pull request and waits in the same session for the plan review (up to 15 minutes), then builds; without a review in that time it stops.
2. Where the spec is silent or unclear, nothing waits: take the most reasonable reading (the spec's own lines, the standing decisions, the way the school works), write it in the plan under "Decided without the owner" with the reason, and go on. The reviewer confirms or changes it; the owner confirms or changes it afterwards on issue #9. A rule the spec gives is never replaced by a reading, and nobody works from memory of the spec.
3. Build only after `[review] approved`, with its corrections. Build the plan and nothing more.
4. Run `npm run format`, lint, typecheck and the tests the change touches. CI runs everything on the pull request and is the gate; a red CI is fixed before a review is asked for. Never skip, delete or weaken a test to get to green. A test that is wrong because a requirement or a decision changed is fixed, with the reason in the report and the mark **Look first**.
5. `/finish-task` runs the checks and the `permission-reviewer`, ticks the task, writes progress and decisions, merges `main` in, posts the report and the decisions, and marks the pull request ready. At `[review] ready to merge` with green checks the reviewer merges a pull request from a `task/` branch. The owner merges spec changes and process changes.

`docs/spec/` is never changed by a task. A rule that should change, or two rules that contradict each other, do not stop the task: follow the most reasonable reading, mark it **Look first** on issue #9 with the wording a `/spec-change` should give, and go on; the owner runs `/spec-change` when they agree.

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
- Lint and typecheck pass with no warnings; CI is green on the pull request, earlier phases included.
- New actions are in the permission-matrix test; new rules each have a test that names them.
- Migrations run on an empty database and the seed still runs.
- New screens were opened at 375 px and 1440 px; no translation key is missing.
- `build-plan.md` is ticked; `progress.md` and `decisions.md` are written; the report says what to look at.
- Every decision made without the owner is in the report and on issue #9.

## Stop and wait for the owner, even when nobody is watching

Until go-live (task 9.4) nothing the loop builds is used by real people, holds real data or spends money, so a mistake can be corrected afterwards. Only two things stop a task. For these the session posts `[review] owner decision needed` (or says what it needs in the pull request, with `@abbosc`) and stops:

1. Secrets, accounts with a provider, anything that costs money, and production (the live system, its data, its address).
2. A task pull request that changes the loop's own rules beyond what `review-pr` allows.

Two brakes are failures, not decisions, and stay: three review rounds without agreement, and three red CI runs in a row. Everything else is decided, written under "Decided without the owner", confirmed or changed by the reviewer, and posted on issue #9. The weightiest decisions carry the mark **Look first** and come first:

- a reading of a money, stock or approval-order rule: a formula or a rounding in `src/domain/`, a status move, the permission matrix, the branch wall (the rules that are never broken stay unbroken);
- an open question of `docs/spec/open-questions.md` that "Decided ahead" in `docs/decisions.md` does not answer;
- a test or constraint deleted or weakened, or a column or table dropped: only when a requirement or a decision changed, never to make failing code pass, with the reason named; a merged migration is still never edited;
- a new dependency: free licence, maintained, no audit finding, all three checked by the reviewer;
- a spec contradiction, or a spec text that should change, with the proposed `/spec-change` wording;
- a task split into a, b, c.

Before go-live the owner and the owner's reviewer go through every Look first decision again, and the owner tightens this list for the live system.
