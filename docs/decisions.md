# Decisions

Four kinds of entries live here.

- **Standing decisions**: what the owner decided outside the spec. They hold for every task. A new one is added by the owner's word only, with the date.
- **Decided ahead**: the owner's answers for tasks that have not started, prepared with the owner's reviewer. `/next-task` reads the entries for its task; what is decided there is not decided again.
- **Task sections**: every task appends its own dated section in `/finish-task`, listing each choice made alone and why, the decisions made without the owner included (D20). A decision that changes a rule of the spec is recorded there with the wording a `/spec-change` should give; the spec itself changes only through `/spec-change`.

## Standing decisions

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| D1 | 10.10.2026 | The spec is final at document revision 123. `docs/spec/` in this repository is now the source of truth; the earlier online document is history. Changes go through `/spec-change` only. | Owner: "final". |
| D2 | 10.10.2026 | Assumptions A1 to A14 are confirmed. A7, A8 and A11 were confirmed with changes, already written into `02-assumptions.md`. | Owner's answers. |
| D3 | 10.10.2026 | What matters most, in order: money and stock always correct; nobody sees or changes another branch's data; the approval order cannot be skipped. | Owner agreed to the ranking. |
| D4 | 10.10.2026 | The audit log and the notification bell are built in phase 0 as foundations. The spec's build order lists them under phases 1 and 2; the product order is otherwise unchanged. | Owner: "do whichever is logical". Every later task writes audit rows and notifications, so the helpers must exist first. |
| D5 | 10.10.2026 | There is no REST API. "API foundations" means the server-action wrapper of task 0.8. | The spec's stack uses Server Actions. |
| D6 | 10.10.2026 | Technical choices are recorded in this file, `docs/decisions.md`. | Owner: change the spec's wording; done in architecture rule 15. |
| D7 | 10.10.2026 | Package manager: npm. | It ships with Node.js, so nothing extra is installed. |
| D8 | 10.10.2026 | The second reviewer is `permission-reviewer`. Money and stock rules are the first thing the `spec-reviewer` checks. | Owner: "whichever". Permissions touch every action of every task and are the hardest to see in a hand test. |
| D9 | 10.10.2026 | The Head creates each password and can renew any user's password at any time, typed or generated; a renewal signs that user out on every device at once; users cannot change their own. There are no password rules and no forced change at first sign-in. A session lasts 24 hours after sign-in, on any device. | Owner's answers; written into A8. |
| D10 | 10.10.2026 | The first day of the school year is a setting (`school_year_start`). | Owner's answer. |
| D11 | 10.10.2026 | No Telegram and no other messenger, email or SMS. Notifications are the in-app bell only. | Owner's answer. |
| D12 | 10.10.2026 | Claude Code writes the interface texts in Uzbek, Russian and English; the owner corrects Uzbek and Russian (task 8.4). | Owner: "you write". |
| D13 | 10.10.2026 | No `LICENSE` file for now. | Owner: "maybe". Open question 4. |
| D14 | 10.10.2026 | Addresses: `ombor.sodiqschool.uz` for production and `ombor-test.sodiqschool.uz` for the test copy. | Owner chose `ombor.sodiqschool.uz`; the test address follows it. |
| D15 | 10.10.2026 | Hosting as the spec says: app and database on DigitalOcean in Frankfurt, files on Cloudflare R2, about $25 a month. The test copy ($17 a month) runs only while the app is being built, from task 0.16 (D22) until go-live, and is switched off after go-live; it can be switched on again for a period when the app is changed later. | Owner chose the $25 setup on 10.10.2026. Corrected on 12.10.2026: this row said the owner chose $42 with the test copy included. |
| D16 | 10.10.2026 | The owner's machine is Windows 11. Tools are checked and installed in step "Once" of `docs/START-HERE.md`. The GitHub repository is private and is `sodiqschoolapp/procurement`. | Owner's answers. |
| D17 | 10.10.2026 | ~~Only the owner merges pull requests. No skill, agent or session merges or pushes to `main`.~~ Replaced on 12.10.2026 by D21 for task pull requests. Still true: the owner merges every spec change and process change, and nothing is pushed to `main` directly. | The working method of the starter pack. |
| D18 | 11.10.2026 | The local storage service moves from task 0.2 to task 0.12. Task 0.2 puts PostgreSQL only into `docker-compose.yml`. Before task 0.12, `/spec-change` names what replaces MinIO on the developer's computer. | MinIO's public images were removed from Docker Hub in September 2026 and the project `minio/minio` is archived (25.04.2026, "no longer maintained"). Nothing before 0.12 uses file storage. Owner: "yes" on 11.10.2026 (review of the plan of 0.2, answer 2). |
| D19 | 12.10.2026 | The build loop runs without the owner in the middle, as in the owner's other project (`sodiqschoolapp/sodiq-platform`): builder sessions in the cloud, a review routine, a start routine, a bridge from GitHub Actions. Its loop is proven there, so it is copied here in one process change and not rebuilt step by step. `docs/cloud-loop.md` describes it; the section "The loop runs without the owner" below holds its rules. | Owner: "I want the same independence as sodiq-platform now, without passing messages task by task." A task waited far longer for a message to be passed on than it took to build (issue #10). |
| D20 | 12.10.2026 | **Decide and flag** replaces "the builder asks, it never guesses". Where the spec is silent or unclear the builder takes the most reasonable reading, writes it under "Decided without the owner" with the reason and goes on; the reviewer confirms or changes it; the owner confirms or changes it afterwards on issue #9, and a changed decision becomes a fix task `<id>b`. No extra stop for rules about money, stock or the approval order: those are **Look first** decisions. In force since the process change of 12.10.2026 (`CLAUDE.md`, the skills). It replaces rule 15 of `edge-cases/developer-rules.md` ("Ask, do not guess") and the sentence "Nobody decides one alone" of `open-questions.md`; the owner's `/spec-change` rewrites both. | Owner's decision, "exactly as in sodiq-platform": the owner reviews every independent decision on the decisions issue and changes what is wrong through fix tasks. |
| D21 | 12.10.2026 | **The review routine merges task pull requests**: `task/` branches only, at the commit it reviewed, with the checks `checks` and `e2e` green. The owner merges spec changes and process changes, and task 0.3 once, by hand, because no CI exists before it. Replaces D17 for task pull requests. In force since the process change of 12.10.2026. | Owner's decision. The merge was the one step that still needed a person on every task. |
| D22 | 12.10.2026 | **The test copy comes now**, as task 0.16, the next task after 0.3: the app online at `ombor-test.sodiqschool.uz`, a new version on every merge to `main`. The task is built by the loop like any other; the owner's own steps (the DigitalOcean account and its payment, the app created from the repository, the DNS record) are listed in `docs/deploy.md` and done after the merge. Task 0.15 keeps what needs later tasks: the test copy's file storage and its seed users. The cost note of `18-hosting-and-costs.md` ("from task 0.15") is corrected by `/spec-change`. | Owner's decision. With the loop, the owner looks at each merged task online; the test copy costs $17 a month from the day the owner creates it. |
| D23 | 12.10.2026 | The procurement app and the academic platform (`sodiqschoolapp/sodiq-platform`) share one design system, `docs/design-system.md`: everything above its last section ("This app") is the same text, word for word, in both repositories, and a change to it is a process change made in both in the same week. The logo files are `public/brand/`, the exact vectors of the brand book. | Owner: "Design codes of both platforms should be exactly the same." The two apps are one family and will share one sign-in. |
| D24 | 12.10.2026 | After both apps are live, they share one sign-in: a member of staff signs in once and uses both apps. Nothing of it is built now; it is planned when both are live. Until then each app keeps its own accounts as its spec says. | Owner: "we will merge the platforms after both are live. We just join the logins." |
| D25 | 12.10.2026 | Approved ahead for the design system (a new dependency: a stop item then, a Look first kind since D26): the fonts Golos Text and Bitter served from the app's own files (Fontsource packages, or `next/font/local` with the files committed; the plan of 0.10 chooses), one package of the `@material-symbols` family that ships the SVG files, and an SVG loader for React components if Next.js needs one (`@svgr/webpack` or its Turbopack setting). lucide is not installed. | Owner's design decision of 12.10.2026 (D23). |
| D26 | 12.10.2026 | **Until go-live the loop does not wait for decisions.** Only two things stop a task: (1) secrets, accounts with a provider, anything that costs money, and production; (2) a task pull request that changes the loop's own rules. Two brakes stay: three review rounds without agreement, and three red CI runs in a row. Everything else is decided and flagged on issue #9, the weightiest marked **Look first**: a reading of a money, stock or approval-order rule; an open question of the spec that "Decided ahead" does not answer; a test or constraint deleted or weakened because a requirement changed; a new dependency; a spec contradiction or a text that should change; a task split. One owner gate is left in the build plan, before task 9.4. Before go-live the owner and the owner's reviewer go through every Look first decision, and the owner tightens the stop list for the live system. `CLAUDE.md`, "Stop and wait for the owner". | Owner: "Until go-live only these stop: secrets, money, production, and a task changing the loop's own rules; everything else is decided and flagged." Nothing the loop builds before go-live is used by real people, holds real data or spends money. |

## Decided ahead

### Task 0.3, CI (12.10.2026)

Decided by the owner's reviewer on the owner's behalf and merged by the owner with the process change of 12.10.2026. The loop's gate rests on these.

1. **Two jobs, named exactly `checks` and `e2e`.** The review routine reads these two names and the owner makes them required (`docs/cloud-loop.md`, section 7). They are never renamed.
2. **`checks`**: the repository with its whole history; install with `npm ci`; `npm audit --omit=dev --audit-level=high`; lint; typecheck; `npm test` (unit and database); `npm run db:migrate` on an empty database, and a second run that applies nothing; `npx drizzle-kit generate` finds nothing new to write, so the schema files and the migrations agree.
3. **`e2e`**: migrate, install the browser of `package-lock.json` (`npx playwright install --with-deps chromium`, the headless shell is enough), `npm run test:e2e`; the traces of a failed run are kept as an artifact.
4. **PostgreSQL is the service of `docker-compose.yml`** in both jobs (`docker compose up -d --wait`): the same image, port and server name as on the laptop and in a cloud session. The workflow holds no secret; it sets `DATABASE_URL` to the public local address that `README.md` shows, which has no password in it. The test helper refuses any other server.
5. **A merged migration is never edited.** A step of `checks` fails when a pull request modifies, deletes or renames a `.sql` file under `drizzle/` (`git diff --name-status --diff-filter=a origin/main...HEAD -- 'drizzle/*.sql'` lists nothing; only additions pass). `drizzle/meta/_journal.json` is changed by every new migration and is not part of this check.
6. **No migration is skipped in silence** (from the review of task 0.2). Drizzle's migrator skips a migration whose time stamp is older than the newest one already applied, and `scripts/apply-migrations.mjs` works out its list with the same comparison. Two guards: a unit test that the time stamps in `drizzle/meta/_journal.json` ascend, and, after migrating, a check in `scripts/apply-migrations.mjs` that the bookkeeping table holds as many rows as the journal has entries.
7. Node from `.nvmrc`. Actions pinned to a commit. `permissions: contents: read`. A newer push to a pull request stops the older run. The workflow runs on every pull request and on every push to `main`.
8. The seed step and the translation check are switched on by tasks 0.14 and 0.5, as the build plan says.
9. **The owner merges this task by hand** (D21): no gate exists before it. The reviewer reviews it as any task and ends at `[review] ready to merge … @abbosc`.

### Task 0.16, the test copy (12.10.2026)

1. **The task does not wait for the owner.** Everything in the repository is planned, built, reviewed and merged by the loop. The steps only the owner can do come after the merge and are written in `docs/deploy.md`, one by one: the DigitalOcean account and its payment, the app created from the repository's app spec, the DNS record for `ombor-test.sodiqschool.uz`. The report lists them under "For the owner" with `@abbosc`.
2. **No secret passes through a session.** The database address is bound to the app inside DigitalOcean; a value the owner must type is typed in the provider's dashboard and is named, never shown, in `docs/deploy.md`.
3. **A new version on every merge to `main`** comes from DigitalOcean's own link to the GitHub repository, not from a deploy key in GitHub. Migrations run before the new version starts.
4. The size and the price are the ones of `18-hosting-and-costs.md`, row 7. Anything dearer is a stop-list item (money).
5. The proof inside the loop is CI: the image builds, the container starts against the CI database and its health route answers. The proof online is the owner's, after their steps: the start page opens at the test address and shows the commit of `main`.

## Task sections

Each task adds one section here, newest at the bottom:

```
### <id> <title> (<date>)
- <choice made alone>: <reason>.
- Constraint style, naming or structure introduced: <what later tasks must follow>.
```

### 0.1 Repository skeleton (10.10.2026)

- TypeScript 6.0.x, not 7.0: `typescript-eslint` 8.71, which `eslint-config-next` 16.4 brings, accepts TypeScript below 6.1 only. It moves up when `typescript-eslint` declares support for 7 and lint, typecheck and build pass with it.
- ESLint 9.x, not 10: `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, all brought by `eslint-config-next` 16.4, accept ESLint up to 9. npm marks ESLint 9 as no longer supported. It moves up when an `eslint-config-next` release has all its plugins accepting 10; nothing is forced with `--legacy-peer-deps` or `overrides`.
- Node.js 24: `.nvmrc` says `24` and `engines` says `>=24`. Vitest 5 needs 22.12, 24 or newer; the owner's machine has 24.
- `noUncheckedIndexedAccess` is on beside `strict`: an array or record read may be `undefined`, which is where wrong totals start. If a shadcn-generated file fails under it, that one file gets the smallest fix; the flag stays (plan review).
- `tsconfig.json` has `"types": ["node"]` because TypeScript 6 no longer loads every `@types` package by itself, `"allowJs": true` because Next.js writes it on the first run and a clean clone must not be rewritten, and `**/*.mts` in `include` so `vitest.config.mts` is type-checked.
- `npm run lint` runs ESLint with no warnings allowed and then `prettier --check .`: one script guards both, so CI needs no extra step. `npm run format` fixes formatting (approved in the plan review).
- `.prettierignore` holds `docs/`, `.claude/`, `CLAUDE.md`, `drizzle/`, `package-lock.json` and the build folders: the spec, the working method, the project rules and merged migrations are never rewritten by a tool.
- Prettier: line width 100, and `prettier-plugin-tailwindcss` keeps Tailwind class names in one order (approved in the plan review).
- `npm run typecheck` runs `next typegen` before `tsc --noEmit`: `next-env.d.ts` is ignored by git, so a clean clone has to generate it first.
- `vitest.config.mts`, not `.ts`: the `.ts` name made Vite warn about ESM syntax in a file loaded as CommonJS.
- shadcn/ui: style `base-vega`, which is the Base UI library with the Vega look (the classic shadcn look, Inter as its font), base colour `neutral`, CSS variables, lucide icons. Decided in the review of the finished work on the owner's behalf: since July 2026 shadcn recommends Base UI for new projects and a new component may exist for Base UI only; Vega and not Nova, because Nova has "reduced padding and margins for compact layouts", against rules 13 and 15 of `11-screens-and-ux.md` (44 px touch targets, plenty of white space). The plan said `new-york` (built on Radix). No component exists yet and `@base-ui/react` is not installed: it comes with the first component, and the plan of that task lists it.
- How `base-vega` was applied: the tool was run for that style in a throwaway copy outside the repository; its `components.json` and its theme in `globals.css` were compared with ours. Apart from what the plan removes or places elsewhere (the two `--font-*` theme lines and the Inter import, the `.dark` block, `src/lib/utils.ts`, the `lib` and `hooks` aliases), only the style and the two menu keys of `components.json` differed, so that file alone changed. Task 0.10, which brings Inter, has to add the two `--font-*` theme lines.
- `npm run dev` is `next dev --hostname 127.0.0.1`: the development server answers this machine only (review of the finished work; `CLAUDE.md`, "What matters most", point 2). By default Next.js answers every device on the network, and from task 0.6 that server holds a sign-in and a database. `http://localhost:3000` still opens. Screens are checked on a phone by Playwright at 375 px and, from task 0.15, on the test copy.
- The Geist font, the `.dark` block and the button that the shadcn set-up wrote are removed: Inter and the look are task 0.10, the app has a light theme only (`11-screens-and-ux.md` rule 15), and the plan adds no component. The line `@custom-variant dark` stays, so the `dark:` classes inside shadcn components never apply, whatever the device prefers.
- `shadcn` and `tw-animate-css` are development dependencies. The app uses each for one CSS import at build time, the shadcn registry itself declares them so, and `tailwindcss` already sits there. With `shadcn` in `dependencies`, as its set-up wrote it, the production tree had 378 packages and 7 high audit findings; now it has none.
- `cn()` lives at `src/components/utils.ts` and comes from the package `cn`, which shadcn now installs in place of `clsx` and `tailwind-merge`. The `CLAUDE.md` layout has no `src/lib/`; the shadcn aliases for `lib` and `hooks` point inside `src/components/` too.
- `agentRules: false` in `next.config.ts`: Next.js 16.4 writes an `AGENTS.md` into the repository when `next dev` sees an AI coding agent, which left the tree dirty after every Playwright run. `CLAUDE.md` is the rules file here; a second one is the owner's decision.
- Feature areas (`src/features/<area>/`) get their `actions/`, `queries/` and `components/` folders with their first file. Empty folders are kept in git by a `.gitkeep`, removed when the first real file arrives.
- The start-page texts are read by a plain import of `uz.json` until task 0.5 brings next-intl; the three message files exist from the first commit, so rule 13 never had an exception.
- `.env.example` holds no name until a task's code reads one; names are not invented ahead of the code. A test refuses any line with a value, and any comment that holds an `=`.
- `db:migrate` and `db:seed` are placeholders that print `NOT BUILT YET: <script> arrives in task <id>` and end without an error (plan review, answer 3), until tasks 0.2 and 0.14 replace them.
- Playwright runs Chromium only, in two projects: `phone-375` and `desktop-1440`, the two widths of the quality bar. It starts `npm run dev` itself.
- Version ranges with a committed `package-lock.json`; `npm ci` for a clean install.
- Naming or structure introduced: where no spec rule exists, a test names the build-plan task or the `CLAUDE.md` line it guards and says so in a comment (plan review). Playwright tests read expected texts from the message files and never type them again.

### 0.2 Database and migrations (11.10.2026)

**The constraint style.** Written once here; every later migration follows it (`developer-rules.md` rules 5, 6, 10, 11, 12; `14-data-model.md`).

1. **Names.** Tables and columns are written in snake_case exactly as `14-data-model.md` writes them. The Drizzle schema states every column name itself.
2. **Keys.** `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` (built into PostgreSQL, no extension). Where the data model shows a different key, that key is the primary key and the table has no `id`.
3. **`created_at`.** `timestamptz NOT NULL`, **with no database default**, on every table, also on the eight with their own key (`settings`, `user_branches`, `manager_rights`, `stock_minimums`, `number_counters`, `purchase_files`, `orf_settlements`, `stock_balances`): in "unless a different key is shown" the exception is about the key only (plan review, answer 5). The value comes from the injected clock (rule 10), so a test that sets the clock also sets `created_at`, and a write that forgets it fails loudly instead of quietly taking the database's time (plan review, answer 6).
4. **Time.** A moment is always `timestamptz`; `timestamp` without a time zone is never used. The session time zone is UTC. A business date (`needed_by`, `purchased_on`, `occurred_on`, `doc_date`) is a `date` column, read as the text `YYYY-MM-DD` and never as a JavaScript `Date`, which would shift it by the machine's time zone.
5. **Enums.** Every list that `14-data-model.md` writes in square brackets is a PostgreSQL enum (`CREATE TYPE`): statuses, progress, kinds, types, roles, payment types, priority, locale, the nine Manager rights, counter scopes, price sources, and any other bracketed list. The enum is named for what it means in singular snake_case (`orf_status`, `payment_type`), with the values exactly as the data model writes them. Never a text column with a list. A new value is a new migration (`ALTER TYPE ... ADD VALUE`); a value is never renamed or removed.
6. **Money.** `bigint`, whole so'm, read in TypeScript as `bigint` (Drizzle `mode: "bigint"`). `mode: "number"` is forbidden on a money column. Every amount has a CHECK; its task takes the bound from the spec.
7. **Quantities.** `numeric(14,3)`, read as text and handed to decimal.js inside `src/domain/`. `mode: "number"` is forbidden here too.
8. **NOT NULL** unless the spec says the value can be absent; the task's plan names each column that may be empty and why.
9. **Relations.** Every relation has a foreign key. Nothing cascades: `ON DELETE` is left at "no action", because nothing with data is deleted (rule 11). The draft that was never submitted is the one exception and its task designs it. Every foreign key and every filter column gets its index in the same migration (rule 12).
10. **Constraint names** are written out: `<table>_<what>_check`, `<table>_<columns>_key` for unique, `<table>_<columns>_idx` for an index. A primary key is named `<table>_pkey`: PostgreSQL gives that name itself to a key written on one column; a key of several columns is given the same name in the schema, because Drizzle would otherwise name it `<table>_<columns>_pk`. A test, and later an error message, can then name the constraint that refused a write.
11. **Text** is `text`; JSON is `jsonb`.
12. **Each constraint has a database test that tries the forbidden write directly** (rule 5, "Proved by"). `refusalOf()` in `tests/helpers/database-error.ts` returns the code, constraint, table and column PostgreSQL names.
13. **Migrations.** One file per task unless the plan says why; written by `npx drizzle-kit generate --name <name>`, read, then committed; SQL that Drizzle cannot express is added by hand to the same file and said so in a comment. A merged migration is never edited. A `DROP` is a Look first decision (D26; until 12.10.2026 it needed the owner's yes first). `drizzle-kit push` is never used.

The tables the login library creates itself in task 0.6 are the one place this style may not hold; the plan of 0.6 lists where they differ.

**Choices made alone, and decided in the reviews.**

- Driver `pg`, not postgres.js (plan review, answer 3): a plain pool with a transaction on one connection, which the action wrapper of 0.8 needs for row locks; Drizzle and Better Auth both accept it.
- The local database has no password: `POSTGRES_HOST_AUTH_METHOD: trust` in `docker-compose.yml` (plan review, answer 4). Safe there and nowhere else: the port answers on `127.0.0.1` only and the data is invented. `.env.example` holds the one name `DATABASE_URL`; `README.md` shows the local address in full because it holds no secret. `pg`, Drizzle's migrator and the PostgreSQL image all work with it; the fallback to a password was not needed.
- PostgreSQL is published on `127.0.0.1:5433`, not 5432: on the owner's machine another PostgreSQL holds 5432 on every network interface (plan review, correction 1).
- `cluster_name=procurement-compose` is set on the server of `docker-compose.yml`, and a database test reads it back. With a second PostgreSQL on the same machine, the version alone cannot show which server answered (plan review, correction 1). The database tests therefore pass only against the service of `docker-compose.yml`.
- The test helper asks every server it connects to for that cluster name and refuses any other server before it creates or drops anything (permission review of the finished work): a good database name on a wrong server, such as the other PostgreSQL on this machine or a hosted one, is still refused. The check is inside the one function every create and drop goes through.
- When no PostgreSQL answers, the helper stops with "PostgreSQL does not answer at <host>:<port>. Start it with: docker compose up -d". A server that answers and refuses (a role that does not exist) is passed on in its own words, so the line never hides another cause.
- The `unit` project runs with an empty `DATABASE_URL`, and the global setup reads only that one name from `.env` without putting it into the environment (permission review): a database test named `*.test.ts` by mistake fails at the client's import instead of writing to the developer's database.
- Host, port and database name in a printed line come from the driver's own reading of the address (`databaseTarget()` in `scripts/apply-migrations.mjs`), because an address can name its host a second time after a question mark and `pg` follows that one.
- A unit test reads `docker-compose.yml` and fails when a published port does not start with `127.0.0.1:`: with no password, that binding is the only wall.
- Image `postgres:17` (the Debian image), a named volume, a health check with `pg_isready`.
- The pool holds at most 10 connections; every connection sets `timezone=UTC` through the connection option `options`, so no query can run before it. In development the pool is kept on `globalThis` across hot reloads.
- `bigint` and `numeric` arrive from `pg` as text, its own default, and no global type parser is changed: a raw query gives exact digits, and a column gives `bigint` through Drizzle's `mode: "bigint"`.
- `.env` is read by Node.js's own `--env-file-if-exists` and `process.loadEnvFile()`; no `dotenv`. The scripts are plain `.mjs`; no `tsx`.
- `db:migrate`: Drizzle's migrator applies the files but returns nothing, so `scripts/apply-migrations.mjs` works out the names beside it, from `drizzle/meta/_journal.json` and Drizzle's bookkeeping table `drizzle.__drizzle_migrations`, with the comparison the migrator makes itself. After migrating it counts the bookkeeping rows again and stops with an error if the count does not match its report. Chosen by the owner in the session on 11.10.2026 (way a of the pull-request comment) over printing a count or no detail.
- No npm script for writing a migration: the Build line names only `db:migrate`. The command is in `README.md`.
- Two Vitest projects: `unit` (nothing running) and `db` (files named `*.db.test.ts`, PostgreSQL running). `npm test` runs both.
- A database per test file, named `procurement_test_<12 hex digits>`, copied from `procurement_test_template`, which each run builds once from the migrations and drops at the end. Chosen over one shared database that is emptied: files run side by side, tests can really commit (the same-moment tests of 0.4 need it), and nothing is left behind because the whole database is dropped. The global setup first drops test databases a crashed run left.
- The helper creates and drops only names that match `procurement_test_[a-z0-9_]{1,40}`, checked before a command is sent. It connects to the server's own `postgres` database to do so, and never to the database of `DATABASE_URL`.
- Database tests of a schema file or the client sit beside the code (`src/server/db/**/*.db.test.ts`); tests of the migrations and the helper sit in `tests/`.
- `npm audit`: the production tree has no finding. `drizzle-kit` 0.31.11, a development tool, brings 4 moderate findings through the `esbuild` 0.18 inside `@esbuild-kit`, about esbuild's own development server, which nothing here starts. Not forced with `overrides`; it goes when drizzle-kit drops that package.

## Process changes

Changes to the working method itself. Each is a `process/` pull request that the owner merges.

### Cloud sessions (12.10.2026)

- A cloud session uses the PostgreSQL service of `docker-compose.yml`, like the laptop. The cloud machine has Docker with its service stopped; `scripts/cloud-session-start.sh` starts it and runs `docker compose up -d --wait`. Chosen over installing a second PostgreSQL on the cloud machine: the image, the port, the missing password and the server name the test helper asks for stay written in one file, and the tests meet the same server on the laptop, in the cloud and in CI.
- Two scripts, as the cloud environment has two moments. `scripts/cloud-setup.sh` is pasted into the environment and prepares the machine once (Node 24, the `postgres:17` image); what it leaves on disk is kept for about a week. `scripts/cloud-session-start.sh` is the `SessionStart` hook and prepares the clone at every start and resume. Both never abort: a failed step prints a line starting with `!!`.
- The hook does nothing on a laptop: it works only when `CLAUDE_CODE_REMOTE` is `true`.
- The hook writes the cloud session's `.env` with the local database address of `README.md`. That address holds no secret. `.env.example` keeps names only.
- `npm ci` is skipped on a resume when `package-lock.json` has not changed (a stamp file inside `node_modules`).
- The cloud machine carries a browser for another Playwright version, so the hook asks Playwright for the one of `package-lock.json` (`chromium --only-shell`). For that the environment allows two download hosts beyond the default list.
- Node 24 comes from the npm package `node`, with nodejs.org as the fallback, and the environment's `PATH` puts `/opt/node24/bin` first: the machine's own Node is 22.
- A variable `PROCUREMENT_REVIEW_ONLY=1` makes the hook install the packages and nothing else. It is for the review routine's environment, which reads code and needs no database.

### Design system (12.10.2026)

- `docs/design-system.md` and `public/brand/` come from the owner's approval of the design board "Sodiq Platform design directions" (page "Final") on 12.10.2026, the same files as in `sodiqschoolapp/sodiq-platform` (D23). The text above its last section is identical in both repositories; "This app" names this app's files, menu icons, status labels and PDFs.
- The spec still says "light theme, Inter, one accent colour" (`11-screens-and-ux.md` rule 15) and keeps a logo and an accent colour in Settings (`14-data-model.md`). The owner's `/spec-change` of 12.10.2026 brings the spec in line; it is merged after this change, and task 0.10 builds the design system.
- The builder reads the design system before any screen or PDF (`.claude/rules/ui.md`), and the `spec-reviewer` checks a changed screen against it.

### The skills work in a cloud session (12.10.2026)

- `/next-task` no longer reads the branch name alone. A task branch whose pull request is merged starts the next task (the laptop met this after every merge); any other clean branch starts a task, because a cloud session begins on a branch of its own; a task that already has a branch on GitHub is continued on that branch and never gets a second one.
- `/finish-task` marks the pull request ready through `pulls/<number>/ccr/ready_for_review` in a cloud session, where GitHub's GraphQL is blocked, and checks afterwards that the pull request is no longer a draft. The address is the one the owner's other project uses; here it is first tried by task 0.3.
- The skills name the repository in full where `gh` may not work it out, and fall back to a folder outside the repository when `.claude/tmp/` cannot be written.
- Nothing else in the skills changes. "The builder asks" and "only the owner merges" hold until the process change of D20 and D21.

### The loop runs without the owner (12.10.2026)

Brought from `sodiqschoolapp/sodiq-platform` as it stood on 12.10.2026, with its open change "the loop does not wait for decisions until go-live". Each rule there came from a failure of that loop; the reasons are in its `docs/decisions.md`. What differs here is named.

| Rule | Where it lives |
| --- | --- |
| Decide and flag; the stop list of two; the Look first kinds (D20, D26). Here the first Look first kind is a reading of a money, stock or approval-order rule, and an open question of the spec not answered ahead is one too | `CLAUDE.md`; `next-task` step 6; `review-pr` step 4 |
| A stop-list step the owner can do after the merge does not hold a task: the build goes on, the report lists the steps. Added here for the test copy (D22) | `next-task` steps 6, 11, 13; `review-pr` step 5 |
| Every verdict names the commit it read; "needs a review" compares shas, never times; one verdict per head | `review-pr` steps 1, 5, 9 and Rules |
| Three rounds on the plan and three on the code, counted apart by distinct sha; a CI red verdict is no round; three red CI runs in a row stop the builder | `review-pr` steps 5, 7, 9; `finish-task` step 9 |
| The reviewer merges only `task/` pull requests, at the reviewed sha, with `checks` and `e2e` green, never with auto-merge (D21). Here the first CI (task 0.3) is the owner's merge | `review-pr` step 10 |
| The loop may not loosen its own rules: `.claude/`, `CLAUDE.md`, `.github/`, `docs/cloud-loop.md`. Here a third exception lets a task add to a CI workflow when its Build line on `main` asks for it (tasks 0.3, 0.5, 0.14, 0.16), never `routines.yml`, never a loosening | `review-pr` Rules |
| CI is the gate for the whole suite; a session runs the format, lint, typecheck and the tests its change touches (`npx vitest run --changed origin/main`, or the whole `npm test` when files the tests read as files changed) | `finish-task` step 1 |
| The builder merges `main` in before marking ready; a head with no checks and a conflict gets `CI red (no checks: merge conflict with main)` | `finish-task` step 8.1; `review-pr` step 7; `next-task` step 12 |
| One start per task; a builder shows it is alive ("Acting on the review.", a progress comment each hour, an empty commit after a plan revision); a stalled task is resumed by the start routine | `next-task` steps 3, 9, 12, 13; the start routine's prompt |
| The report says what to look at, not a hand test; the decisions go to issue #9 with the migrations named; the Uzbek and Russian texts go into a "Texts to read" comment | `finish-task` steps 7 and 8 |
| A general must-fix becomes a line in the reviewers' checklists in the same fix commit | `finish-task` step 4; `review-pr` step 8 |
| `@abbosc` on every comment that needs the owner; the label `needs-owner` stops the start routine | the three skills |
| GitHub Actions fires the two routines through their API triggers; the routines have no GitHub triggers; hourly schedules are the second net | `.github/workflows/routines.yml`; `docs/cloud-loop.md`, sections 3 to 6 |
| Issue #9 holds the decisions to confirm, issue #10 the cycle time per task | `docs/cloud-loop.md` |

Choices made for this repository:

- Both reviewers run on every finished task, as before (D8); the other project runs the permission reviewer only when routes changed.
- A progress entry stays under 25 lines, newest at the bottom; `/next-task` reads the two newest and every line that names its task, so a note for a later task starts with `For <id>:`.
- The permissions (`.claude/settings.json`): the rule that refused the REST merge call is removed, because the review routine merges with it; `gh pr merge`, the GraphQL merge and auto-merge stay refused. `npm install`, `npm update` and `npx shadcn` no longer ask: a new dependency is a Look first decision checked by the reviewer and by the audit in CI, and a question nobody answers would stall a cloud session. Editing `docs/spec/` still asks.
- No format hook: `/finish-task` runs `npm run format` first.
- The handover of the other project advised an extra stop for money, stock and approval-order rules. The owner decided against it (D20); they are the first Look first kind instead, and the reviewer works such a reading through with numbers before confirming it.
