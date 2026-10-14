# School Procurement & Warehouse Platform

One web app that replaces the paper order request form and the warehouse records for every branch of a private school. It does two jobs:

1. **Order requests.** A manager asks to buy things for one branch. Three people approve in a fixed order: Procurement Head, Principal, Finance. The manager buys and records the real prices and numbers, Finance settles any money difference, and the request closes.
2. **Warehouse.** Every recorded purchase enters the branch stock. Managers give items to departments, and the system always knows how many are left.

About 20 to 30 users. The interface is in Uzbek, Russian and English.

The project is being built task by task from `docs/build-plan.md`. So far the skeleton and the database set-up exist: the app opens on a start page and nothing can be used yet.

## What you need

| Tool                        | Version     | What for                                            |
| --------------------------- | ----------- | --------------------------------------------------- |
| Node.js (npm comes with it) | 24 or newer | The app and every command below.                    |
| Git                         | any recent  | The repository.                                     |
| Docker Desktop              | any recent  | PostgreSQL. It must be running, not only installed. |

`docs/START-HERE.md` has the install commands for Windows 11.

## Run it

The first time, in this order:

1. Install the packages:

   ```
   npm ci
   ```

2. Create a file named `.env` beside `.env.example` with this one line:

   ```
   DATABASE_URL=postgres://procurement@127.0.0.1:5433/procurement
   ```

   The address is written here in full because it holds no secret: the local database has no password, answers on this machine only and holds invented data. The real database always has a password, and its address is never written into a file of this repository.

3. Start PostgreSQL and create the tables:

   ```
   docker compose up -d
   npm run db:migrate
   ```

4. Start the app:

   ```
   npm run dev
   ```

Then open `http://localhost:3000`.

After the first time: `docker compose up -d` when Docker Desktop was restarted, `npm run db:migrate` when new migrations arrived, and `npm run dev`.

PostgreSQL is published on port 5433 of this machine, not on the usual 5432, which another PostgreSQL on the same computer often holds. `docker compose stop` stops it and keeps the data.

`npm ci` installs exactly the versions in `package-lock.json`. Use `npm install` only to add or change a package, and ask before you do (`CLAUDE.md`, "Ask before you do any of these").

`.env.example` lists the names of the variables, never a value; each task adds the names its code reads. `.env` itself is ignored by git.

## In a Claude Code cloud session

Nothing is done by hand there. A hook of `.claude/settings.json` runs `scripts/cloud-session-start.sh`, which does the steps of "Run it" on the cloud machine: the local `.env`, `docker compose up -d`, `npm ci` and `npm run db:migrate`. On a laptop the hook ends at once. `docs/cloud-loop.md` describes the one-time set-up of the cloud environment.

## Commands

| Command              | What it does                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`        | The app on `http://localhost:3000`, for this machine only, reloading as files change. |
| `npm run build`      | The production build.                                                                 |
| `npm run lint`       | ESLint with no warnings allowed, then the Prettier format check.                      |
| `npm run format`     | Prettier rewrites the files. Run it when the format check fails.                      |
| `npm run typecheck`  | Generates the Next.js types, then runs the TypeScript compiler.                       |
| `npm test`           | Unit tests and database tests with Vitest. PostgreSQL must be running.                |
| `npm run test:e2e`   | Playwright in a real browser at 375 px and 1440 px. It starts the app itself.         |
| `npm run db:migrate` | Applies the SQL migrations of `drizzle/` and prints the name of each one it applied.  |
| `npm run db:seed`    | **Not built yet.** It only prints a notice; task 0.14 brings the demo data.           |

Only the unit tests, with nothing running:

```
npx vitest run --project unit
```

Only the database tests (files named `*.db.test.ts`):

```
npx vitest run --project db
```

Every database test file gets its own database, named `procurement_test_<random>`, which is dropped when the file ends. The tests never touch the database of `DATABASE_URL`; they only read the server's address from it.

A new migration is written from the schema files in `src/server/db/schema/`, read line by line, and then committed:

```
npx drizzle-kit generate --name <what-it-adds>
```

`drizzle-kit push` is never used: it changes a database without a migration file. A merged migration is never edited.

Before the first `npm run test:e2e` on a machine, download the test browser once:

```
npx playwright install chromium
```

`npm run db:migrate` refuses to finish when Drizzle's bookkeeping does not hold one row per entry of `drizzle/meta/_journal.json`: a migration whose time stamp is older than one already applied would otherwise be skipped in silence. A database migrated by a newer branch is refused the same way.

## CI

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`, with two jobs. Their names, `checks` and `e2e`, are what the reviewer reads and what `main` requires; they are never renamed.

- **`checks`**: `npm ci`, `npm audit --omit=dev --audit-level=high`, PostgreSQL from `docker-compose.yml`, lint, typecheck, `npm run db:migrate` on the empty database (every migration applied) and once more (nothing to apply), `npm test`, `npx drizzle-kit generate` writing nothing (the schema files and the migrations agree), and a check that no `.sql` file under `drizzle/` that was already on `main` was modified, deleted or renamed.
- **`e2e`**: PostgreSQL, `npm run db:migrate`, the Playwright browser, `npm run test:e2e`. A failed run keeps its traces as the artifact `playwright-traces` for 14 days.

The same on this machine, with `docker compose up -d` running: `npm run lint`, `npm run typecheck`, `npm test`, `npx drizzle-kit generate` (then `git status` shows nothing new) and `npm run test:e2e`.

## Where things are

```
src/app/            routes and screens
src/domain/         pure business rules and the state machine
src/server/         database, sign-in, permissions, the action wrapper, clock, jobs, storage
src/features/<area> actions, queries and components of one area
src/components/     shared interface parts; ui/ holds shadcn components
src/i18n/           messages/uz.json, ru.json, en.json and the formatters
drizzle/            SQL migrations
tests/              test helpers, and e2e/ for Playwright
scripts/            seed, first Head, checks
docs/               spec, build plan, progress, decisions
```

| File                 | What it is                                                 |
| -------------------- | ---------------------------------------------------------- |
| `docs/spec/`         | The spec, the source of truth. Start at `00-index.md`.     |
| `docs/START-HERE.md` | The owner's one-page guide to the working method.          |
| `docs/build-plan.md` | Every task in order, with a checkbox each.                 |
| `docs/progress.md`   | What each finished task left for the next.                 |
| `docs/decisions.md`  | Standing decisions, and each task's technical choices.     |
| `CLAUDE.md`          | The rules Claude Code reads at the start of every session. |

## Rules for anyone who touches the code

- Real names, phones, prices and stock lists of the school never enter the repository, a test or a log. Examples use invented data.
- Secrets live in the provider dashboards and the local `.env` only.
- The owner merges spec changes and process changes. The review routine merges task pull requests, only with green checks (`docs/cloud-loop.md`).
