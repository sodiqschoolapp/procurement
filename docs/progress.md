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

## 0.16 Test copy: the app online at the test address (14.10.2026, pull request #13)

**Built**
- `Dockerfile` (node 24 slim by digest, production `node_modules`, user `node`, port 8080), `.dockerignore`, `scripts/start.sh`: migrate, then `next start`; a failed migration ends the container.
- `GET /health` (`src/app/health/route.ts`, `src/server/health.ts`): 200 with status, commit and the session time zone, 503 after 3 s or on any failure. `src/server/commit.ts` reads `GIT_COMMIT`; the start page shows "Versiya <sha>".
- `connectionOptions()` in `src/server/db/connection-options.mjs`, used by the pool and `db:migrate`: with `DATABASE_CA_CERT` the certificate is verified and the address's `sslmode` removed.
- `.do/app.yaml` (Frankfurt, 1 GiB fixed, dev database PG 17, deploy on push to `main`, `ombor-test.sodiqschool.uz`); `docs/deploy.md`; CI job `e2e` builds the image, runs it on a fresh database and calls `/health` and `/`.

**Left out, and the task that brings it**
- The test copy's file storage and seed users: task 0.15. Production and open question 10: task 9.4.

**Open for the owner**
- The five steps of `docs/deploy.md` (account and card, DigitalOcean's GitHub app, the app from `.do/app.yaml` at $17, the CNAME, the check). The DigitalOcean facts in `.do/app.yaml` are unconfirmed (the session could not read the docs).
- A `/spec-change` for "from task 0.15" in `18-hosting-and-costs.md` (two places) and for the `/health` exception to rule 4 (with `CLAUDE.md` rule 4).

**What the next sessions must know**
- `next build` runs with no `DATABASE_URL`: a route that needs the database imports `@/server/db/client` inside its handler, or the page is dynamic and never imports it at build time.
- In a cloud session `docker build` fails on npm's TLS behind the proxy; build with a scratch copy of the Dockerfile that adds `/root/.ccr/ca-bundle.crt` as `NODE_EXTRA_CA_CERTS` and `npm_config_cafile` (`--build-context ca=/root/.ccr`). Never commit that copy.
- For 0.7: `/health` and the start page are the open entry points. The permission-matrix test lists the open routes explicitly and fails when an unlisted open route appears (permission review of 0.16).
- For 0.15: the image copies only what `Dockerfile` names into the run stage; a new script the container runs must be added there. `public/templates/**/*.xlsx` is let through `.dockerignore`.
- `/health` gives up after 3 s, but its query keeps running; a statement timeout on the pool is not set (permission review, outside its scope).

## 0.4 Clock, ids and test helpers (14.10.2026, pull request #14)

**Built**
- `now()` and `today()` in `src/server/clock.ts`, the only file that reads the system time; `businessDate()`, `businessYear()`, `businessDayStart()` in `src/domain/business-date.ts` (Tashkent, `YYYY-MM-DD`).
- `newClientKey()` and `isClientKey()` in `src/components/client-key.ts` (UUID v4).
- Test helpers: `setClock`, `advanceClock`, `resetClock` (`tests/helpers/clock.ts`, reset after every test); `inventedUser`, `inventedBranch` (plain data); `runTogether` with `meet()`.
- ESLint: `FORBIDDEN_TIME_SELECTORS` (`new Date()`, `Date.now`, `Date()`, `Temporal.Now`, `.defaultNow()`), and only tests may import `setTestClock`.

**Left out, and the task that brings it**
- `insertUser()`: 0.6. `insertBranch()`: 0.7. The `client_key` columns and the repeat behaviour: 0.8 and each table's task. A per-form key hook: the first create form.

**What the next sessions must know**
- Every insert passes `createdAt: now()`; a test fixes the moment with `setClock("…Z")` (a text without Z or offset is refused).
- For 0.5: a block that sets `no-restricted-syntax` for screens must spread `FORBIDDEN_TIME_SELECTORS`; `tests/forbidden-time.test.ts` lints samples under `src/app` and `src/components` and turns red otherwise. The date formatter calls `businessDate()`.
- For 0.6: the session test moves the clock with `advanceClock({ hours: 24, minutes: 1 })`; Better Auth reads its own time, so that plan decides how it gets `now()`.
- For 0.8: a `client_key` column is `uuid UNIQUE`; NOT NULL follows decisions 0.2 item 8. The wrapper returns the first result of a repeated key only to the same user and branch, else "Not found", with a matrix test (permission review of 0.4).
- Same-moment tests: `runTogether([a, b])`; each action calls `meet()` inside its transaction before it takes a lock, never after, or both wait for ever.
- `dropTestDatabase` waits up to 5 s for a closed pool's connections to leave before `with (force)`: `pool.end()` resolves early, and a terminated connection (57P01) failed CI as an unhandled error.
- Not caught by the lint rule: `new globalThis.Date()`, `Date["now"]`, a raw `sql\`now()\``; reviewers look for them.

## 0.5 Languages and formats (14.10.2026, pull request #15)

**Built**
- next-intl 4 without routing: `src/i18n/request.ts` picks the language with `chooseLocale()` (`src/i18n/locale.ts`): user, cookie `locale`, else `uz`. The layout and start page read texts through `getTranslations`; `<html lang>` follows the language.
- `src/i18n/format.ts`: `formatMoney(bigint, unit)`, `formatDate`, `formatTime`, `formatQuantity(text, locale)`, `bindFormatters()`; `useFormatters()` and `getFormatters()` bind them to the request. `businessTime()` in `src/domain/business-date.ts`.
- `npm run i18n:check` (`scripts/check-translations.mjs`), a step of the job `checks`. The red run that proved it: actions run 38518216269.
- ESLint: `react/jsx-no-literals` and `LITERAL_TEXT_PROP_SELECTORS` for screens; `tests/no-literal-text.test.ts`.

**Left out, and the task that brings it**
- `users.locale`, the sign-in language select that writes the cookie: 0.6. A language switch for a signed-in user: the app shell of phase 1.

**What the next sessions must know**
- A screen shows money, dates, times and quantities only through `useFormatters()` (components) or `getFormatters()` (async server code, PDF, export); never import `get-formatters.ts` into a client component.
- `next-intl.d.ts` types the keys from `uz.json`: a missing key is a typecheck error, a key missing in `ru`/`en` fails `i18n:check`.
- For 0.6: pass the user's `locale` into `chooseLocale()` in `src/i18n/request.ts`, read from the server session only, never from a cookie or browser input (permission review of 0.5). The sign-in select writes the cookie `LOCALE_COOKIE`.
- `NextIntlClientProvider` sends the whole message file to the browser; once a file holds texts only some roles may see, pass namespaces selectively (permission review of 0.5).
- Install packages with npm 11 (`npx npm@11 install …` in a cloud session, whose `npm` is 10): npm 10 rewrites the lock file's `libc` fields.
- Every new screen block of `eslint.config.mjs` that sets `no-restricted-syntax` spreads both `FORBIDDEN_TIME_SELECTORS` and `LITERAL_TEXT_PROP_SELECTORS`.

## 0.6 Sign-in and sessions (14.10.2026, pull request #16)

**Built**
- Migration `0001_sign_in`: `users`, `sessions`, `accounts`, `verifications`, `login_attempts`; enums `user_role`, `locale`.
- `signIn()` / `signOut()` (`src/server/auth/sign-in.ts`), the reader `getCurrentUser()` / `requireUser()` (`session.ts`), the lazy library `getAuth()` (`auth.ts`), the limit in `src/domain/sign-in-limit.ts`, `/login`, sign-out on `/`, `src/proxy.ts`, `npm run user:first-head`.

**Left out, and the task that brings it**
- Renewing a password, signing a user out everywhere, creating and deactivating users: 1.3. The brand sign-in page, the menu with sign-out: 0.10.

**Open for the owner**
- `BETTER_AUTH_SECRET` in the DigitalOcean dashboard (docs/deploy.md); until then sign-in on the test copy is refused.

**What the next sessions must know**
- Tests: `insertUser(role, { password, isActive })` and `signInAs(user)` in `tests/helpers/users.ts`; a session test fixes the clock, only our reader judges expiry.
- Every page or action reads the user with `getCurrentUser()` / `requireUser(path)`; never the library's `getSession`. The library pool closes in `db-file-setup.ts`.
- A module the layout or a page imports never imports `@/server/db/client` at the top: `next build` has no `DATABASE_URL`. Load it inside the function (`src/server/auth/session.ts`).
- For 0.7: add `signInAction`, `signOutAction`, `chooseLanguageAction` to the permission matrix as open to everyone; test that `signOutAction` ends only the caller's session.
- For 0.7 and every file or export route: the proxy lets through paths ending in an image or `.txt` extension and `/brand/`; such a route calls `requireUser()` / `authorize()` itself.
- For 1.3: deactivating a user and renewing a password delete that user's `sessions` rows (A8), so a reactivated user's old devices are not signed in again.
- For 0.10: `/` becomes the home page per role; the CI container step that reads the commit from `/` moves with it.
- For 0.9: the first-Head script gains its audit row.

The next task is 0.7.
