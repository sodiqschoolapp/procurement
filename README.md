# School Procurement & Warehouse Platform

One web app that replaces the paper order request form and the warehouse records for every branch of a private school. It does two jobs:

1. **Order requests.** A manager asks to buy things for one branch. Three people approve in a fixed order: Procurement Head, Principal, Finance. The manager buys and records the real prices and numbers, Finance settles any money difference, and the request closes.
2. **Warehouse.** Every recorded purchase enters the branch stock. Managers give items to departments, and the system always knows how many are left.

About 20 to 30 users. The interface is in Uzbek, Russian and English.

The project is being built task by task from `docs/build-plan.md`. So far only the skeleton exists: the app opens on a start page and nothing can be used yet.

## What you need

| Tool                        | Version     | Needed from                                                 |
| --------------------------- | ----------- | ----------------------------------------------------------- |
| Node.js (npm comes with it) | 24 or newer | now                                                         |
| Git                         | any recent  | now                                                         |
| Docker Desktop              | any recent  | task 0.2, for PostgreSQL and MinIO. Not needed before that. |

`docs/START-HERE.md` has the install commands for Windows 11.

## Run it

```
npm ci
npm run dev
```

Then open `http://localhost:3000`.

`npm ci` installs exactly the versions in `package-lock.json`. Use `npm install` only to add or change a package, and ask before you do (`CLAUDE.md`, "Ask before you do any of these").

There is no `.env` file to fill in yet. `.env.example` lists the names of the variables, never a value; each task adds the names its code reads.

## Commands

| Command              | What it does                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`        | The app on `http://localhost:3000`, for this machine only, reloading as files change. |
| `npm run build`      | The production build.                                                                 |
| `npm run lint`       | ESLint with no warnings allowed, then the Prettier format check.                      |
| `npm run format`     | Prettier rewrites the files. Run it when the format check fails.                      |
| `npm run typecheck`  | Generates the Next.js types, then runs the TypeScript compiler.                       |
| `npm test`           | Unit tests with Vitest. Database tests join in task 0.2.                              |
| `npm run test:e2e`   | Playwright in a real browser at 375 px and 1440 px. It starts the app itself.         |
| `npm run db:migrate` | **Not built yet.** It only prints a notice; task 0.2 brings the migrations.           |
| `npm run db:seed`    | **Not built yet.** It only prints a notice; task 0.14 brings the demo data.           |

Before the first `npm run test:e2e` on a machine, download the test browser once:

```
npx playwright install chromium
```

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
- Only the owner merges pull requests.
