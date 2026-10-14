# Progress

The memory between sessions. `/finish-task` adds one entry per task, newest at the bottom. `/next-task` reads the two newest entries and every line that names its task, so a note for one later task starts with `For <id>:`.

## Format of an entry

```
## <id> <title> (<date>, pull request #<number>)

**Built**
- <what exists now, in a few lines>

**Left out, and the task that brings it**
- <thing>: task <id>

**Open for the owner**
- <a decision or data the owner must give, and by which task>

**What the next sessions must know**
- <a helper to reuse and where it is>
- <a pattern that was set and must be followed>
- <a trap that cost time>
```

Keep an entry under 25 lines. Facts only: no story of the session, no praise, nothing that is already in the code or the spec.

## Entries

## 0.1 Repository skeleton (10.10.2026, pull request #1)

**Built**
- Next.js 16.4 App Router project, TypeScript 6.0 strict, Tailwind CSS 4, ESLint 9, Prettier, shadcn/ui set up with no component yet.
- The folder layout of `CLAUDE.md`; nine npm scripts (the eight of the task and `format`); `.env.example` with no name yet.
- A start page at `/` with two texts from `src/i18n/messages/`; one Vitest test file (4 tests) and one Playwright test.

**Left out, and the task that brings it**
- Docker Compose, the database, real `db:migrate`: task 0.2. Real `db:seed`: task 0.14.
- next-intl and the language choice: task 0.5. A `start` script: task 0.15.
- Any shadcn component: the first task that needs one. Its plan lists `@base-ui/react` as a new dependency and its build installs it: `shadcn add` does not (the dry run of a button lists only `cn`). The Vega button is 36 px high by default; rule 13 of `11-screens-and-ux.md` asks for 44 px touch targets, so that task sets the size.

**Open for the owner**
- Docker Desktop was not on the machine on 10.10.2026; it must be installed and running before task 0.2.

**What the next sessions must know**
- seed: placeholder until 0.14. `npm run db:seed` only prints `NOT BUILT YET` and ends without an error; every `/finish-task` report from 0.2 to 0.13 writes "seed: placeholder until 0.14" where it would show the seed run. `db:migrate` is the same until 0.2.
- Next.js 16.4 ships its own guides in `node_modules/next/dist/docs/`. Read the guide there before using a Next.js feature; it differs from older versions.
- The page texts are read by a plain import of `uz.json`. Task 0.5 replaces that import in `src/app/layout.tsx` and `src/app/page.tsx`. A new text goes into all three message files.
- shadcn (style `base-vega`: Base UI, the Vega look): add a component with `npx shadcn@latest add <name>` and never run `init` again; `init` writes a font, a dark block and `src/lib/`. After an `add`, check `git status` for anything beyond the component. `cn()` is imported from `@/components/utils`; there is no `src/lib/`.
- For 2.1: add a lint rule that stops `src/domain/` importing from outside its folder (report of 0.1, point 7; the review said yes).
- `npm run lint` also checks formatting; `npm run format` fixes it. `docs/`, `.claude/` and `CLAUDE.md` are never formatted. `npm run dev` answers on this machine only (`127.0.0.1`); never open it to the network.
- Trap: `next dev` writes an `AGENTS.md` when it sees an AI agent. `agentRules: false` in `next.config.ts` stops it; do not remove that line.
- Trap: the Playwright browser download broke twice on a weak connection. `npx playwright install chromium --only-shell` fetches only the missing part.

## 0.2 Database and migrations (11.10.2026, pull request #2)

**Built**
- `docker-compose.yml`: PostgreSQL 17 on `127.0.0.1:5433`, no password (D18 moved the storage service to 0.12). Drizzle, the migration `0000_settings`, `npm run db:migrate`, the client `src/server/db/client.ts`.
- The test-database helper in `tests/helpers/`, Vitest projects `unit` and `db`, 47 tests. The constraint style: `docs/decisions.md`, 0.2.

**Left out, and the task that brings it**
- The storage service: 0.12. CI: 0.3. The clock, invented users: 0.4. The settings keys and their accessor: 1.1.

**Open for the owner**
- Before task 0.12, one `/spec-change` on `main` for one point: what replaces MinIO on the developer's computer; reports of September 2026 say the last community image, frozen at 07.09.2025, can still be pulled from `quay.io/minio/minio`, and only a real `docker pull` tells. Done on 12.10.2026 by `/spec-change`: `14-data-model.md` now says in plain words that every table has `created_at` and a table with its own key has no `id`.

**What the next sessions must know**
- A database test is a file named `*.db.test.ts` that imports `db` from `@/server/db/client`; the file gets its own database, dropped at its end. More databases: `inject("databaseServerUrl")` with `createTestDatabase()` and `dropTestDatabase()` of `tests/helpers/test-database.ts`. A constraint test reads the refusal with `refusalOf()` of `tests/helpers/database-error.ts`; Drizzle wraps the driver's error, PostgreSQL's code is in `error.cause`.
- Never name a database test `*.test.ts`: the `unit` project has an empty `DATABASE_URL` and the client refuses to load there.
- `created_at` has no database default; every insert passes it. Until the clock of 0.4, a test passes a fixed invented moment.
- A migration: `npx drizzle-kit generate --name <name>`, read it, commit it. Never `drizzle-kit push`.
- For 0.3: the database tests and the helper work only on a server with `cluster_name=procurement-compose`, so CI starts PostgreSQL with `docker compose up -d --wait` or gives its service the same name; the `trust` setting needs no value in the workflow. Proposed for that plan: a check that `npx drizzle-kit generate` finds nothing new to write, so schema files and migrations agree.
- For 0.4: emptying tables between two tests of one file is not built and no task names it; proposed for that plan. Two test runs at the same moment on one machine drop each other's databases.
- For 0.7: a key of several columns is given the name `<table>_pkey` in the schema (style 10). Nothing stops a page from importing `db`; that plan proposes the fence (a lint rule, or `server-only`, which is a new dependency).
- For 0.11 and 2.3: `notifications.type` and `orf_events.type` have no bracketed list in `14-data-model.md`, while "types are enums"; each plan decides the values and marks the decision **Look first**.
- For 1.1: Drizzle writes a JavaScript `null` into `jsonb` as SQL NULL, so `settings.value NOT NULL` refuses it. JSON `null` can be written only as raw SQL and reads back as `null` too. How an unset setting is stored is decided in that plan.
- For 0.16 (moved forward from 0.15): the local image should be the managed database's major version. The client sets UTC through the connection option `options`; whether a connection pooler in front of the managed database passes it on was not tried.
- Trap: on the owner's machine port 5432 belongs to another project's PostgreSQL. Ours is 5433; never point `DATABASE_URL` at 5432.
- Trap: the first unit-test run after `npm ci` is slow; a test that imports the client inside its body needs a longer timeout (`src/server/db/client.test.ts`).
- seed: placeholder until 0.14.

## Process: the loop runs without the owner (12.10.2026)

**What the next sessions must know**
- `CLAUDE.md` changed: where the spec is silent you decide, write it under "Decided without the owner" and go on; only the stop list stops a task; the weightiest decisions are marked **Look first** (D20, D26).
- The three skills changed: `/next-task`, `/finish-task`, `/review-pr`. Read the skill, not your memory of it. The loop is in `docs/cloud-loop.md`.
- `/finish-task` runs the format, lint, typecheck and `npx vitest run --changed origin/main`; CI runs everything once task 0.3 is merged.
- A note for one later task starts with `For <id>:`; `/next-task` reads the two newest entries and every line that names its task.
- For 0.3: the owner's answers are in `docs/decisions.md`, "Decided ahead: task 0.3"; the owner merges that pull request by hand.
- For 0.16: the task after 0.3 is 0.16, the test copy, moved forward from 0.15 (D22); "Decided ahead: task 0.16".
- 14.10.2026: the loop brought up to sodiq-platform of 14 October (D27 to D41): only a `[review]` by `abbosc` counts and a fork's pull request gets nothing; after every push the builder checks that CI started and calls the owner instead of pushing an empty commit; a failure outside the code is re-run once, and a head green after a re-run is reviewed again.

## 0.3 CI (14.10.2026, pull request #12)

**Built**
- `.github/workflows/ci.yml`: jobs `checks` (install, production audit, lint, typecheck, migrate an empty database then once more, `npm test`, `drizzle-kit generate` writes nothing, no merged `.sql` edited) and `e2e` (migrate, Playwright shell, `npm run test:e2e`, traces kept 14 days on failure). PostgreSQL is the service of `docker-compose.yml`.
- Guard 1: `tests/migration-journal.test.ts`. Guard 2: `applyMigrations` refuses when the bookkeeping rows differ from the journal entries (a skipped migration, or a database ahead of the code).

**Left out, and the task that brings it**
- The seed step: task 0.14. The translation check: task 0.5. The image build: task 0.16.

**Open for the owner**
- Merge #12 by hand, then add `checks` and `e2e` as required checks to the ruleset `protect-main` (`docs/cloud-loop.md`, section 7).

**What the next sessions must know**
- CI is now the gate: after every push, check that the run `checks` started on the head (D28).
- Actions are pinned to a commit sha with the tag in a comment; checkout keeps no token (`persist-credentials: false`).
- `applyMigrations(url, folder)` takes a migrations folder for tests only; `tests/migrations.db.test.ts` writes invented journals under the system temp folder.
- For 0.5 and 0.14: add the translation check and the seed step to the job `checks` of `ci.yml`; the jobs are never renamed.
- For 0.16: the image build goes into `ci.yml` too; a new job is not required by `main` until the owner adds it.
- Trap: a push to a pull request cancels the older run of that pull request; wait for a run to finish before pushing when its result is needed.

The next task is 0.16.
