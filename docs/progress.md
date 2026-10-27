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
- 17.10.2026: balanced reviews and one spec review of the code (D44 to D46): reviewers name over-engineering as a should-fix to remove and never ask for safeguards no rule needs; `/finish-task` runs only the `permission-reviewer`, and the review routine applies the `spec-reviewer` checks and the matching `.claude/rules/` lines to the code; twenty-two check lines brought from sodiq-platform.
- 17.10.2026: five task pairs merged (D47). For 2.11, 3.5, 5.4, 5.12 and 9.1: every note and decision that names the former 2.12, 4.11, 5.5, 5.13 or 8.3 is yours.
- 17.10.2026: the owner answered open questions 3, 8, 9, 11, 12, 13 and 19 (`docs/decisions.md`, Decided ahead). For 3.2, 3.7, 3.10, 4.1, 4.3, 5.4, 5.6, 5.7, 5.8, 5.9, 5.11, 7.2 and 7.4: your answer is there.
- 17.10.2026: the Phase 2 audit (D48) found one gap. Fix task 2.7b comes next after the task running when it was added (3.5). For 2.7b: the order page's confirmation is in `order-action-bar.tsx`; reuse it. The last line of this file may name 3.6; 2.7b comes first.
- 17.10.2026: the loop's waits and stalls (D49): `next-task` step 11 now waits for the plan review in the same session; progress comments every 20 minutes, a stall after 45 minutes; "Acting on the red CI."; the reviewer merges only while its verdict is the newest. For 2.11b: the findings are in the `changes needed` comment of #61.
- 17.10.2026: D50: before acting on a review, and before the first commit, re-read the comments; act on the newest verdict at the head sha; stop when another session posted "Resumed by the start routine." after it.
- 19.10.2026: D51: a reviewer claims a commit ("Reviewing <sha>.") before reviewing it; a stricter verdict is posted even after another run's. For 6.5a-2: the finding is in decision D51. 6.5a-2 sits above the finished 6.5b in `docs/build-plan.md`, so it is the next task after the one running when D51 merged.
- 20.10.2026: D53: CI runs in parts (`lint-and-migrations`, `tests (N/3)`, `e2e (N/4)`, `image`); the last jobs are still `checks` and `e2e`. A failure names its part; after every push the job `checks` appears only once its parts have finished.
- 20.10.2026: D54: the reviewer claims a commit only after its CI is green, the claim lives 40 minutes, and the wait for CI is up to 30 minutes.

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

## 0.7 Permissions and the branch wall (14.10.2026, pull request #17)

**Built**
- Migration `0002_permissions`: `branches`, `user_branches` (copied `user_role`, `user_is_active`; the deferred Principal trigger), `manager_rights`, enum `manager_right`.
- `src/domain/permissions.ts`: `PERMISSIONS` and `decide()`; `src/server/authorize.ts`: `authorize()`, `branchFilter()`, `AuthorizationError`.
- `tests/helpers/permission-matrix.ts` (`describePermissionMatrix`), `tests/permission-matrix-expected.ts`, `tests/permission-registry.ts`; the ESLint fence against screens reading the database.

**Left out, and the task that brings it**
- `/branches`: 1.2. Users with branches, replacing a Principal, the last Head, the "no active user" warning: 1.3. The switches: 1.4.
- `03` rule 6 (Head step approved automatically): 2.7. Rule 7 (moving a request at cash balance 0): 4.10. Rule 2 "the first action wins": the locks of 0.8.
- Drafts visible to the owner and the Head only: 2.4 (and the lists of 2.8).

**What the next sessions must know**
- Every action and query: `const actor = await authorize(user.id, "<permission>", { branchId, ownerId }, tx)`; a list adds `branchFilter(actor, table.branchId)` to its `where`. `branchId` and `ownerId` come from the record in the database, never from input (a create action excepted).
- A new action or query goes into `tests/permission-registry.ts` and gets `describePermissionMatrix({ permission, run })`; a new permission goes into `PERMISSIONS` and `tests/permission-matrix-expected.ts`.
- `insertUser(role, { branches: [id] })`, `insertBranch()`, `setManagerRight()`. A Principal needs its branch row in the same transaction as the user: the database refuses at commit otherwise. For 0.14 and 1.3: the seed and the user form write them together.
- For 1.3: replace a Principal by deactivating the old one first, in the same transaction (decisions 0.7 item 1).
- For 2.x: request edit, submit, cancel and take back ask `request.edit` (own requests), not `request.create`.
- Screens never import `src/server/db/*`, `pg` or `drizzle-orm/node-postgres`; data comes through `src/features/<area>/queries`.

## 0.8 Server-action foundations (14.10.2026, pull request #18)

**Built**
- `src/server/action.ts`: `defineAction()`, `runAction(definition, userId, input)`, `serverAction(definition)`, `ActionError`, `describeForLog()`. Order: Zod, then in one transaction `target` → `authorize()` → `repeat` (advisory lock + `find`) → `lock` (branch and owner compared: `conflict`) → version → `check` → `write` → version raised by the wrapper → `history` → `notify`.
- `src/server/action-result.ts` (`ActionResult`, codes, `errors.*` keys; client-safe), `src/server/action-input.ts` (Zod issue → `errors.field.*`), texts in uz, ru, en.
- `src/components/action-runner.ts` (`callWithRetry`, `createActionRunner`), `src/components/use-action.ts` (`useAction`).
- ESLint `OWN_TRANSACTION_SELECTORS`: no `.transaction(` in `src/app`, `src/features`, `src/components`.

**Left out, and the task that brings it**
- `audit()`: 0.9. `notify()`: 0.11. Request events and the state machine: 2.x. Toasts and the confirm dialog: 0.10. The `client_key` of `orfs`: 2.2.

**What the next sessions must know**
- An action file: `"use server"` with `export const x = serverAction(definition)`; `next build` accepts it (checked in 0.8). List it in `tests/permission-registry.ts` with the definition's own `permission`; nothing checks the two match yet, so the reviewer compares them (permission review of 0.8).
- `target` reads branch and owner from the database (a create: the input's branch). Every action but a create has `lock`, returning `{ target, version?, rows }`; with a version it names `versionOf`, and the Zod schema requires `version: z.number().int().min(1)`. The action never raises the version itself.
- A create's schema requires `clientKey` (`isClientKey`), and `repeat.find` reads the table's `client_key UNIQUE` column and returns `{ result, userId, branchId }` equal to what `write` returned.
- A refusal inside a step: `throw new ActionError("wrong_status")`. Never log an error yourself: `describeForLog()` (`.claude/rules/server-actions.md`).
- A `bigint` in the result reaches the browser exactly (`tests/server-action-bigint.test.ts`).
- Tests: the sample action of `src/server/action.db.test.ts` shows each step; `serverAction(def, async () => user)` runs without a request.
- For 0.9 and 0.11: `audit()` and `notify()` take the transaction (`WriteContext.tx`) and are called from the `history` and `notify` steps.

## 0.9 Audit log (14.10.2026, pull request #19)

**Built**
- Migration `0003_audit_log`: `audit_log` with format CHECKs, `before`/`after` JSON objects, the actor foreign key, two indexes, and the hand-written trigger `audit_log_append_only` (refuses UPDATE, DELETE, TRUNCATE).
- `src/server/audit.ts`: `audit({ tx, userId }, entry)`; `src/server/audit-row.mjs`: the one insert; `src/domain/audit-secrets.mjs`: the secret field names; `src/domain/audit.ts`: `AUDIT_ACTIONS`, `auditValue()`, `changedFields()`.
- The first-Head script writes its `user.create` row in the same transaction (closes decision 20 of 0.6).
- `listChangeHistory(userId, { entity, entityId, page })` in `src/features/audit/queries/` (Head only, 50 a page); `src/components/change-history.tsx` with texts in uz, ru, en.

**Left out, and the task that brings it**
- The audit rows of settings 1.1, branches 1.2, users 1.3, switches 1.4, catalogs 1.5 to 1.9, direct entries 5.8. The component on a page: 1.1. The seed's rows: 0.14.

**What the next sessions must know**
- In an action's `history` step: `await audit({ tx, userId }, { action, entity: "<table>", entityId, before, after, at: now() })`. The actor is always the wrapper's user. `before` and `after` hold the changed fields only; money as `bigint`, moments as `Date`, never a password, hash, token or secret field.
- A new audit action goes into `AUDIT_ACTIONS` and gets `audit.actions.<area>.<verb>` in the three message files (the component test checks it).
- A page shows the history with `listChangeHistory(user.id, …)` and `<ChangeHistory entries fields>`; `fields` maps each field to a label key and a kind (`text`, `money`, `quantity`, `date`, `moment`, `boolean`, `{ enum: namespace }`).
- `audit_log` rows cannot be deleted, also in tests: a test counts its own rows, never the whole table.
- For any task that opens the history to a role other than the Head: add `branchFilter()` on the audited record's branch first (comment in the query).

## 0.10a Design system and shared parts (14.10.2026, pull request #20)

**Built**
- Light and dark tokens in `src/app/globals.css` with `tests/contrast.test.ts`; the theme follows the device, a chosen theme is kept in `localStorage` (`src/components/theme.ts`, inline script in the root layout). Golos Text and Bitter from Fontsource.
- `src/components/`: `icon.tsx` (+ `icon-paths.ts` from `npm run icons`), `ui/button.tsx` (`pending`), `ui/field.tsx`, `ui/input.tsx`, `ui/select.tsx`, `ui/segmented.tsx`, `status-label.tsx`, `skeleton.tsx`, `empty-state.tsx`, `hexagons.tsx`, `toast.ts` + `toaster.tsx`, `confirm-dialog.tsx`, `unsaved-changes-guard.tsx`. `src/domain/request-status.ts`.
- `/login` as the brand moment; browser icons of `public/brand/` in the layout metadata.

**Left out, and the task that brings it**
- Shell, menu per role, branch switcher, `/profile` with language and theme switch, home pages, and `/` with the CI container step: 0.10b.

**What the next sessions must know**
- Every button is `<Button>` (`variant`, `size`, `icon`, `pending`); a link styled as a button uses `buttonVariants()`. Fields: `<Field id label error><Input /></Field>`; the control takes id and aria from the field.
- Icons: add the name to `ICONS` in `scripts/icons.mjs`, run `npm run icons`, commit `icon-paths.ts`. Never import `lucide-react`; after `shadcn add`, replace its lucide imports with `<Icon>`.
- Feedback: `toast.success(t(...))` / `toast.error(t(...))`; irreversible actions use `<ConfirmDialog>`; a form renders `<UnsavedChangesGuard dirty={...} />`.
- Status and colour labels only through `RequestStatusLabel` and `ColourLabel`; the colour comes from `src/domain/` (phase 3), the label refuses a difference whose sign contradicts the colour.
- For the first task with a form: the guard's browser wiring (link capture and the back button) has no e2e test yet; that task writes it (review of 0.10a, correction 8).
- For 0.10b: a `<Skeleton>` is `--accent`, the canvas colour in the light theme; on the canvas, outside a white panel, give it `bg-secondary` (spec review of 0.10a).
- For 0.10b: the theme switch on `/profile` calls `applyTheme()` of `src/components/theme.ts` with `device`, `light` or `dark`.
- Bitter and Golos Text are named `Bitter Variable` and `Golos Text Variable` in CSS; Tailwind `font-slab` is Bitter, for brand moments only.
- Trap: the browser reports token colours as `lab()`; an e2e colour check reads the pixel through a canvas (`tests/e2e/design-system.spec.ts`).

## 0.10b App shell, menu per role and profile (14.10.2026, pull request #22)

**Built**
- `src/app/(app)/`: the layout (sidebar, top bar with the branch view, phone tab bar), `/` (empty home per role), `/profile` (language, theme, sign-out). The menu per role is `src/components/shell/menu.ts`.
- Permission `profile.edit`; the wrapper's global form (`GLOBAL_TARGET`); `chooseOwnLanguage` (audit row `user.change_language`); `chooseBranch` and the `branch` cookie (`src/features/catalog/branch-*.ts`); `listMyBranches`, `currentBranchChoice`.
- `/` is no longer open; the commit caption is on `/login`. Browser tests use their own database `procurement_e2e` on port 3100.

**Left out, and the task that brings it**
- The bell and `/notifications`: 0.11. Search: 6.10. Home contents: 2.x to 6.x. The pages the menu links to: their tasks. A styled full-page "not found": no task names it.

**What the next sessions must know**
- Every signed-in page goes under `src/app/(app)/`; the layout already calls `requireUser()`, the page calls it again with its own path.
- A list reads its branch scope with `currentBranchChoice(user.id, (await cookies()).get(BRANCH_COOKIE)?.value)`: `null` is "All my branches"; the SQL still filters with `branchFilter()`.
- An action of a global permission returns `GLOBAL_TARGET` from `target` and `lock`; a branch target there is a definition error. A global create with `repeat` is refused until a task decides how its repeat is matched.
- Action definitions that touch the database live under `src/features/<area>/actions/`; the `"use server"` file in `src/app/` only wraps them.
- E2E people: `E2E_ROLES` and `E2E_BRANCHES` of `tests/e2e/global-setup.ts`; a test that changes a person's settings uses its own person (the language test has one per project).
- Page titles are `text-[28px] leading-[34px] font-bold tracking-[-0.01em]`; the shell sets the page padding (32, 16 on a phone).
- Trap: a click on a Base UI trigger before hydration opens nothing; the shell test retries the "More" click with `toPass()`.

## 0.11 Notifications (14.10.2026, pull request #24)

**Built**
- Migration `0004_notifications`: enum `notification_type` (27 values), `notifications` with link, params and read_at CHECKs, two indexes, the hand-written trigger `notifications_guard` (no DELETE or TRUNCATE; UPDATE only `read_at` NULL → moment).
- `notify({ tx, userId | null }, { to, type, params, branchId, link, at })` in `src/server/notify.ts`, one statement in `src/server/notification-row.mjs`; `src/domain/notifications.ts` (types, params per type, `isInternalLink()`, page size); permission `notification.own`.
- `openNotification`, `markAllNotificationsRead`, `listMyNotifications`, `countMyUnread` in `src/features/notifications/`; the bell in the top bar; `/notifications`; `npm run dev:notify`.

**Left out, and the task that brings it**
- Sending each type and its text and params: 1.3, 1.4, 2.x, 3.x, 5.x, 8.1. The role groups of the table ("Finance users of the branch"): the first task that sends to each.

**What the next sessions must know**
- In an action's `notify` step: `await notify({ tx, userId }, { to, type, params, branchId, link, at: now() })`. `branchId` is the record's branch (`null` only for an event of no branch): a recipient outside it gets no row; the actor, repeats and inactive users get none.
- A new type that is sent: add its params to `NotificationParamsOf` and `NOTIFICATION_PARAMS`, and `notifications.types.<TYPE>` in uz, ru, en (`tests/notification-texts.test.ts` checks every param changes the text). Params are strings or numbers (an ICU argument; a flag is a word for a `select`); money a string of whole so'm. Any request number or amount in params is a Look first of that task (decision 4).
- A job (8.1) calls `notify()` with `userId: null`.
- `notifications` rows cannot be deleted, also in tests: count the person's own rows. The e2e test marks its Head's older rows read first.
- An action whose success changes the bell revalidates the layout in its `"use server"` wrapper (`revalidatePath("/", "layout")`); `router.push()` and `router.refresh()` at once can leave the address behind the page.
- A link is printable ASCII only (CHECK and `isInternalLink()`): PostgreSQL and JavaScript call different Unicode characters "space".

## 0.12 File storage (14.10.2026, pull request #25)

**Built**
- `docker-compose.yml` service `storage`: SeaweedFS 4.48 (S3 API) on `127.0.0.1:8333`, invented keys; `npm run storage:bucket`. Migration `0005_files` with the trigger `files_guard` (no UPDATE, DELETE, TRUNCATE).
- `src/server/storage.ts` (client on first use), `src/server/files/process.ts` (160/1200 px JPEG, HEIC through heic-decode, pixel limit before decoding), `src/domain/files.ts` (sniffer, limits, shrink target).
- `POST /files` and `GET /files/<id>/<small|large|original>`, outside the proxy (401 for a signed-out visitor); permission `file.upload`; `uploadFile`, `fileForDownload`; `src/components/files/upload.ts` (browser shrink and upload).
- The wrapper takes a global create with `repeat` (matched by its maker).

**Left out, and the task that brings it**
- Attaching files and each record's download check: 1.x (catalog photos, suggestions), 3.x (receipts), 4.x (money documents). The photo field and its Playwright test of the browser shrink: the first task with one. The test copy's R2 bucket: 0.15.

**What the next sessions must know**
- For 1.x, 3.x, 4.x: an attaching action takes only a file the caller uploaded and no record holds, checked under its lock; adds a unique constraint on its file column; adds an owner to `FILE_OWNERS` (`src/server/files/owners.ts`) returning the permission and target that see the record now (a Draft: `request.edit` with its owner), with a database test. Read the contract at the top of that file.
- Upload from a screen: `uploadFile(file, purpose, clientKey)` of `src/components/files/upload.ts`; `purpose` `photo` or `document` (PDF allowed); the attaching action checks the type fits its field. Show a file with `/files/<id>/small` or `/large`.
- Tests: `tests/helpers/files.ts` makes invented pictures; the tests' buckets are `procurement-test` and `procurement-e2e`, their S3_* values from `tests/helpers/local-storage.ts`. The local `.env` needs the S3_* lines of README.md for `npm run dev`.
- Trap: a production build sets a `__Secure-` cookie, which a browser keeps over http only on `localhost`, not `127.0.0.1`.
- Trap: sharp's prebuilt build reads only AVIF of the HEIF family; HEIC goes through heic-decode.

## 0.13 Scheduler (14.10.2026, pull request #27)

**Built**
- `src/domain/schedule.ts`: `tickOf({ everyMinutes }, moment)`, ticks counted from 00:00 Tashkent through `businessDayStart`; minutes divide 1440.
- Migration `0006_scheduled_jobs`: one row per job (`last_tick`, `last_started_at`, `last_finished_at`, `last_failed_tick`, `last_failed_at`), five CHECKs.
- `src/server/jobs/`: `Job` type, the registry `JOBS` with `heartbeat` (every minute, writes only its record), `runDueJobs` (row `FOR UPDATE SKIP LOCKED`, run in a savepoint, record under the lock), `startScheduler` (every 15 s). `src/instrumentation.ts` starts it once per process; `SCHEDULER=off` turns it off.

**Left out, and the task that brings it**
- Times of day and weekdays in a schedule, the nightly check, the weekly copy: 8.2. Reminders: 8.1. The analytics refresh: 6.x.

**What the next sessions must know**
- For 8.1, 8.2, 6.x: a job is `{ name, schedule, run({ tx, tick }) }` added to `JOBS` in `src/server/jobs/registry.ts`. It runs as the system (no user, no `authorize()`, no `runAction`); it writes through `tx` only, which is a savepoint: a throw saves nothing and the tick is not tried again. It tells people through `notify({ tx, userId: null }, …)`. `now()` is the moment, `tick` the tick it runs for.
- For 8.2: a job that must not run inside one transaction (the weekly copy) needs its own shape; add time-of-day schedules to `src/domain/schedule.ts`.
- Test a job with `runDueJobs([job])` and the fixed clock (`src/server/jobs/scheduler.db.test.ts`); a run holds the row, so a second instance gets `locked`, and a later round in the same tick gets `not_due`.
- The scheduler runs in `npm run dev`, `next start`, CI's container and Playwright's servers; the heartbeat writes only its own row.

## 0.14 Seed data (14.10.2026, pull request #28)

**Built**
- `npm run db:seed` (`scripts/db-seed.mjs`, core `seed(client, env, moment)` in `scripts/seed.mjs`): branches CHL and YUN, users `seed_head`, `seed_manager` (CHL, YUN), `seed_principal` (CHL), `seed_finance` (CHL, YUN); passwords from `SEED_HEAD_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_PRINCIPAL_PASSWORD`, `SEED_FINANCE_PASSWORD`; one audit row each (`branch.create` new), the seed Head as actor.
- Creates what is missing, keeps what is there; refuses a seed user of another role and a missing seed Principal when CHL has an active Principal. Takes the first-Head lock `(61, 0)`.
- CI `checks`: "Seed the empty database, then once more" with random passwords, comparing the exact lines.

**Left out, and the task that brings it**
- 30 products and a few requests (rule 14): 1.5 to 1.9 and 2.x extend the seed. A Principal for YUN: open (decision 1). Seed users on the test copy and a guard for hosted databases: 0.15.

**What the next sessions must know**
- To extend the seed: add the rows to `seed()` in `scripts/seed.mjs`, in its one transaction, found by a unique key and kept when found, each with its audit row (actor: the seed Head); add a line `created …`/`kept …` and add it to the expected lines of the CI step and `tests/seed.db.test.ts`.
- For 0.15: the seed has no production guard (permission review, Should fix 1); decide it there, as the test copy needs the seed users.
- Tests that count rows run on their own database: `withFreshDatabase` in `tests/seed.db.test.ts`.


## 0.15 Test copy: file storage and seed users (14.10.2026, pull request #29)

**Built**
- `scripts/start.sh` seeds after the migration when `SEED_DEMO_DATA` is exactly `yes`; a failed seed prints `db:seed failed: …` and the app starts. `.do/app.yaml` sets it, with `S3_REGION=auto` and `S3_BUCKET=ombor-test-files`.
- The seed guard `seedTargetAllowed()` (`scripts/seed.mjs`, host read with `pg-connection-string`): a database not on `127.0.0.1`, `localhost` or `::1` needs `SEED_DEMO_DATA=yes`. An unreachable database is named by its error kind, never its host.
- `scripts/storage-check.mjs` (`npm run storage:check`): a 160 px JPEG made by sharp, written under `checks/`, read back and compared; prints `storage ok`. In the image, with the seed files (`tests/image-files.test.ts` checks the copies).
- `s3ClientOf` sends checksums only when required. `docs/deploy.md` steps 6 to 8: R2 bucket and token, the spec update, the eight typed values, the seed lines, the console check.

**Left out, and the task that brings it**
- A photo uploaded through a screen on the test copy: the first task with a photo field (1.x). Production's spec and variables: 9.4. The CI steps for the seed in the image: the owner, by hand (report, Look first).

**Open for the owner**
- `docs/deploy.md` steps 6 to 8 (Cloudflare account and R2, the token, the spec update, the eight typed values, four sign-ins, the console check).

**What the next sessions must know**
- For 9.4: the production app spec must not carry `SEED_DEMO_DATA`; add a test that it does not (permission review of 0.15, Should fix 1). A tunnel to a hosted database on `127.0.0.1` passes the guard.
- For 1.x: the first task with a photo field asks the owner in its report to upload a photo on the test copy and see it shown.
- A new script the container runs: add its files to the run stage of `Dockerfile`; `tests/image-files.test.ts` follows imports from `ENTRY_POINTS`, so add the script there.
- `.do/app.yaml` changes need the owner to apply it again and type the dashboard values again (`docs/deploy.md`, step 7).

## 1.1 Settings (14.10.2026, pull request #30)

**Built**
- `src/domain/settings.ts`: the eight keys, defaults, limits and value checks, `settingsFrom()`, `changedSettings()`; `src/domain/payment-types.ts` (`PAYMENT_TYPES`).
- Migration `0007_settings_values`: one CHECK per known key on `settings.value`.
- `readSettings(executor)` in `src/server/settings.ts`; `saveSettings` (Head, audit row `settings.change`); `getSettingsForHead`, `getSchoolName` in `src/features/settings/queries/`.
- `/settings` with the change history; the school name under the logo in the sidebar; Admin opens `/settings`.
- `<ChangeHistory>` kinds `percent`, `percentOrOff`, `hours`, `monthDay`.

**Left out, and the task that brings it**
- Using each value: price hint and default payment type 2.x; receipt rule 3.x; overspend guard 3.x/4.x; school year 6.x; reminders 8.1; school name in the PDF 7.x.
- Admin back to `/catalog`, and moving between the Admin pages: 1.5 and 1.2.

**What the next sessions must know**
- Read a setting inside an action or query with `readSettings(tx)`; never from a page. A new key goes into `SETTING_DEFAULTS`, `SETTING_CHECKS`, a CHECK in a new migration, the form, and the history `FIELDS` of the page.
- For 1.5: point the Admin item of `src/components/shell/menu.ts` back to `/catalog` (and its test in `menu.test.ts`).
- For 2.x: the orf payment-type enum is built from `PAYMENT_TYPES`; the request's default is `readSettings(tx).default_payment_type`.
- For 3.x/4.x: `overspend_guard_percent` is `number | "off"`; 0 means every overspend; the comparison belongs in `src/domain/`.
- A form: Save `disabled` until hydrated (`useSyncExternalStore`), or a click before hydration submits the plain form; browser tests wait for Save to be enabled. In the dev server the Next.js indicator covers the phone's first tab.
- Settings rows can be deleted in tests (`db.delete(settings)` in `beforeEach`); audit rows cannot.

## 1.2 Branches (14.10.2026, pull request #32)

**Built**
- `src/domain/branches.ts`: `isBranchCode`, `branchName`, `branchAddress`, limits, `changedBranchFields`, `BRANCHES_PAGE_SIZE`.
- Migration `0008_branches_client_key`: `branches.client_key uuid`, unique, nullable.
- `createBranch`, `updateBranch`, `setBranchActive` (`src/features/catalog/actions/branches.ts`); `listBranches`, `getBranch` (`queries/branches.ts`); audit actions `branch.update`, `branch.deactivate`, `branch.activate`.
- `/branches`, `/branches/new`, `/branches/[id]` (form, Deactivate/Activate, change history); `AdminNav` (`src/components/admin-nav.tsx`) on `/branches` and `/settings`.
- `ActionError("invalid_input", { field: key })` returns field errors from a step; field kind `taken`.

**Left out, and the task that brings it**
- Code lock after the first request: 2.7. Block on closing a branch: 5.13. Pickers of active branches only: 1.3 and 2.x. Admin item to `/catalog`: 1.5.

**What the next sessions must know**
- A taken name or code: check under an advisory lock with the unique index's own SQL expression, throw `ActionError("invalid_input", { name: "errors.field.taken" })`.
- A global create's `repeat.find` with no maker column reads the maker from its own `<x>.create` audit row (review of the 1.2 plan, correction 1).
- For 1.3: the user form's branch picker lists active branches only (decisions 1.2, item 3).
- For 1.5 and later Admin pages: add the page to `PAGES` of `src/components/admin-nav.tsx`; over four pages it needs another element.
- For 2.7: lock `code` in `updateBranch` once the branch has a request.
- Browser tests: codes and names are new on every run (branches are never deleted); a toast and a history row can share words, use `.first()`.

## 1.3 Users (14.10.2026, pull request #33)

**Built**
- Migration `0009_users`: `users.client_key` (unique) and the deferred trigger `users_keep_one_active_head` (takes the advisory lock `users_active_head`, then counts).
- `src/domain/users.ts` (name, phone, branch count per role, `changedUserFields`, `vacatedPlaces`), `src/domain/passwords.ts` (`generatePassword(bytes)`).
- `createUser`, `updateUser`, `setUserActive`, `renewUserPassword` (`src/features/users/actions/users.ts`); `listUsers`, `getUser`, `listBranchVacancies`, `listBranchChoices` (`queries/users.ts`); `staffedPlaces` (`vacancies.ts`). Audit actions `user.update`, `user.deactivate`, `user.activate`, `user.renew_password`; `BRANCH_ROLE_VACANT` is sent.
- `/users` (vacancy warning), `/users/new`, `/users/[id]` (form, Renew password, Deactivate/Activate, history); `AdminNav` gains Users.

**Left out, and the task that brings it**
- Manager rights switches: 1.4. Moving a deactivated Manager's requests: 2.x. Reminders: 8.1. The vacancy warning on the home page: home contents (2.x). A way back in for a single Head who forgot the password: no task (report).

**What the next sessions must know**
- Every user write takes, in order: the advisory lock `users_active_head`, the advisory lock `users`, the touched branch rows `FOR UPDATE` in id order, then the user row (`lockUser`). A new action on users (1.4) does the same.
- A user's branches change by deleting and inserting `user_branches` rows (Look first); the old rows go first.
- Deactivation and renewal delete the user's `sessions` rows; the Head can do neither to themselves.
- A vacancy notice is sent with `notify({ tx, userId: null }, …)` so the acting Head is told too (decisions 1.3).
- For 1.4: the switches go on `/users/[id]` (a Manager's page) and use `catalog.manage`'s neighbour `manager_rights.switch`; take the same locks.
- For 2.x: a Head-made request and moving a deactivated Manager's requests read `users.is_active`; a deactivated user keeps their `user_branches` rows.
- Tests: a file's database is its own, so a test may deactivate the other Heads with SQL to make "the last Head"; two Heads deactivating each other at once end with `wrong_status` or `forbidden`, depending on timing.

## 1.4 Manager rights (14.10.2026, pull request #34)

**Built**
- `switchManagerRight` (`src/features/users/actions/manager-rights.ts`; `manager_rights.switch`, Head only): one right per call, upsert in place, audit `user.switch_right` (`{ CODE: boolean }`), notice `MANAGER_RIGHT_SWITCHED` (`{ right, state: "on" | "off" }`, link `/`, no branch) to the Manager.
- `getManagerRights` (`queries/users.ts`): the nine in the order of 03, a missing row on; `null` for a non-Manager.
- The "Rights" section on a Manager's `/users/[id]`: nine navy checkboxes with the "when off" hint, flipped at once (`useOptimistic`); disabled for an inactive Manager.
- `describePermissionMatrix`: the "right off" case is a Manager of two branches, refused in both, the Head allowed in both (A13).

**Left out, and the task that brings it**
- Hiding each action's buttons when a right is off, and `CLOSE_ALONE` sending closing to Finance: the task of each action (2.x to 5.x). A page showing a Manager their own rights: no task (report).

**What the next sessions must know**
- A button of a right-guarded action asks `decide()` with the actor `authorize()` returns; the server refuses anyway.
- The same switch twice and an inactive Manager are `wrong_status`; a non-Manager is `invalid_input`.
- `lockUser` is exported from `users.ts`; a new user action takes it.
- A notification type of codes only gets `null` in `SHOWN` of `tests/notification-texts.test.ts`.

## 1.5 Measures, categories, extra cost types, companies (14.10.2026, pull request #35)

**Built**
- Migration `0010_catalogs`: `units`, `categories`, `extra_cost_types`, `companies` (enum `company_kind`), each with a unique normalised name (units also `short_name`), a nullable unique `client_key`, an `is_active` index (companies `(is_active, kind)`).
- `src/domain/catalogs.ts`: `CATALOGS` (kind → entity and fields), `catalogName()`, limits, `isTaxId()`, `companyKindsFor()`.
- `defineCatalogActions()` (`src/features/catalog/actions/catalog-entries.ts`) and twelve actions (`createMeasure` … `setCompanyActive`); audit `unit.*`, `category.*`, `extra_cost_type.*`, `company.*`.
- Queries `listCatalogEntries`, `getCatalogEntry`, `countActiveCatalogEntries` (catalog.manage) and `listCatalogChoices` (new `catalog.pick`, every role; active only, at most 50).
- `/catalog`, `/catalog/[catalog]` (search in the address), `/new`, `/[id]`; one form and one list for the four. Admin opens `/catalog`; `AdminNav` has Catalogs first.

**Left out, and the task that brings it**
- The lock on a measure's "Allows decimals" and on a product's measure: 1.7. Calling the picker from a screen: 1.7. Seed catalog rows: 1.13. Ctrl+K search of companies: its own task.

**What the next sessions must know**
- A new small catalog: a table with the same name index, client key and `is_active` index; an entry in `CATALOGS`, `SOURCES` of the queries, `ACTIONS` of `src/app/(app)/catalog/actions.ts`; a `defineCatalogActions()` file; audit actions and texts.
- For 1.6 and 1.7: `/catalog/departments` and `/catalog/products` are static routes beside `[catalog]`; add a row to `/catalog`'s list (`CATALOG_KINDS` drives it today).
- For 1.7: `updateMeasure` refuses a change of `allowDecimal` once a product points at the measure, with its test (plan review of 1.5, correction 3). Pickers call `listCatalogChoices`; an edit screen must still show a current value that is inactive (it is absent from the picker).
- For 1.9: Prices makes five Admin pages; `AdminNav` needs another element than the segmented control.
- Browser tests: after a refusal the error toast covers Save at phone width until it fades; submit with Enter.

## 1.6 Departments (15.10.2026, pull request #36)

**Built**
- Migration `0011_departments`: `departments` (FK `branch_id`, unique `(branch_id, normalised name)`, blank CHECKs, nullable unique `client_key`, `is_active` index).
- `defineCatalogActions()` takes an optional `within` parent (`key`, `column`, `check`, `shown`): names are unique inside it; create reads it from the input, update from the locked row. `CATALOG_ENTRIES` (`src/domain/catalogs.ts`) = the four of 1.5 plus `DEPARTMENTS`.
- `createDepartment`, `updateDepartment`, `setDepartmentActive` (`actions/departments.ts`); audit `department.*`, the create row holds `branchId` and `branch` (code). Queries `listDepartments` (top-bar branch view, search), `getDepartment`; `countActiveCatalogEntries` counts departments.
- `/catalog/departments`, `/new`, `/[id]` on the shared `CatalogForm` and `CatalogActiveButton`; `/catalog` has a Departments row. `HistoryField.hidden` hides a field kept in the row.

**Left out, and the task that brings it**
- A department picker (branch-scoped): the first task that picks a department (2.x after D42, or 5.4). Excel import: 1.10. Seed departments: 1.13.

**What the next sessions must know**
- For 1.8: subtypes are unique inside a product: pass `within: { key: "productId", ... }` to `defineCatalogActions()`, as departments do with the branch.
- For the first task that points a branch record at a department: hold the branch wall in the database too (plan review of 1.6, decision 1), for example a foreign key on `(department_id, branch_id)` against a unique `(id, branch_id)` of `departments`.
- A department picker must filter by branch inside the SQL (`branchFilter()`), unlike the Head's list.
- `PageLinks` lives in `src/app/(app)/catalog/page-links.tsx`.
- Browser tests: the top bar's branch switcher is also labelled "Filial"; scope a form's branch field with `page.locator("form")`. After Deactivate, wait for the dialog to be hidden: its button reads "Activate" while it closes.

## 1.7 Products and services (15.10.2026, pull request #37)

**Built**
- Migration `0012_products`: `products` (enum `product_type`, FKs to categories, units, files, companies; unique normalised name; unique `photo_file_id`; `reference_price` bigint CHECK > 0; blank CHECKs; nullable unique `client_key`).
- `src/domain/products.ts` (types, default GOODS, `lockedChanges()`), `src/domain/money.ts` (`parseSom()`, `isSom()`, `MONEY_MAX`).
- `createProduct`, `updateProduct`, `setProductActive` through `defineCatalogActions()`, which gained `guard`, `createOnly`, `createShape` and `shownRefs`; audit `product.*` with the names of category, measure, company and the photo's file name. `updateMeasure` locks `allowDecimal` once a product uses the measure.
- `PRODUCT_USES` (`actions/product-uses.ts`, empty) and `productInUse()`; file owner `PRODUCT_PHOTOS` (catalog.pick).
- Queries `listProducts`, `getProduct`, `listProductChoices`, `listCategoryFilter`; `/catalog/products`, `/new`, `/[id]`; `/catalog` has the row.

**Left out, and the task that brings it**
- Subtypes and the default subtype: 1.8. New price with a note, price history: 1.9. Excel import: 1.10. Seed products: 1.13. The request-line product picker: the request task after D42.

**What the next sessions must know**
- For 1.8: the default subtype takes the product's `reference_price`; after 1.8 a request line's suggestion reads only `product_variants.reference_price` (plan review of 1.7, decision 2). `products.photo_file_id` is unique; a subtype photo must also be refused when a product holds the file (`accessOf()`), and the subtype table adds its owner to `FILE_OWNERS`.
- For 1.9: write or backfill a HEAD `price_history` row for every price set in 1.7; from the first change on, no screen, PDF or suggestion reads `products.reference_price` as the current price (plan review of 1.7, correction 2).
- For every task that writes a row holding a quantity of a product's subtype (request lines, stock movements and balances of any source, the existing-stock import, stock minimums): add its check to `PRODUCT_USES` with a database test, and take the product row `FOR SHARE` before the insert (plan review of 1.7, correction 1).
- A new reference to a catalog entry: lock it `FOR SHARE` and refuse `errors.field.inactive` / `notAllowed`, as `refuseInactive()` in `actions/products.ts`.
- `tests/helpers/catalog.ts` inserts categories, measures, companies, file rows and products.
- A plain `truncate files` is refused (0A000) since `products` points at `files`.

## 1.8 Subtypes (15.10.2026, pull request #38)

**Built**
- Migration `0013_product_variants`: `product_variants` (FKs product, file; unique `(product_id, normalised name)`; one default per product; price CHECKs; nullable unique `client_key`), `products.has_variants`, a backfilled default row for every product, the deferred trigger `product_variants_shape` (at least one row; `has_variants` agrees with the rows) and the guard `product_variants_guard` (no delete, no move to another product, never back to the default).
- `createProduct` writes the hidden default subtype with its price (`afterInsert`). `createSubtype` (hand-written: the first subtype is the default row made real, same id), `updateSubtype`, `setSubtypeActive` (`lockable`, `checkActive`); audit `subtype.*` with `productId` and `product`; the conversion also writes `product.update` `{ hasVariants }`.
- `src/domain/products.ts`: `DEFAULT_SUBTYPE_NAME`, `firstSubtypePriceRefused()`, `firstSubtypePrice()`. `optionalId` and `priceField` moved to `catalog-fields.ts`; `refusePhoto()` and `fileNameOf()` to `actions/photos.ts`; file owner `SUBTYPE_PHOTOS`.
- Queries `listSubtypes`, `getSubtype`; `listProducts` and `getProduct` read the default subtype's price and give `hasVariants` and `subtypeCount`. The product page's Subtypes section, `/catalog/products/[id]/subtypes/new` and `/[subtypeId]`.

**Left out, and the task that brings it**
- A new price with a note, price history: 1.9. Excel import of subtypes: 1.10. Seed subtypes: 1.13. The subtype picker: the request task after D42 and phase 5.

**What the next sessions must know**
- For 1.9: the HEAD `price_history` backfill covers every price set in 1.7 and every subtype price set in 1.8 (on create, and on the first subtype when the default held none). Prices live on `product_variants.reference_price`; `products.reference_price` is the value typed at creation only.
- For 1.10: an imported product with subtypes is written as `createSubtype` does: the first subtype turns the default real (same id, `is_default` false, `has_variants` true in the same transaction), the others are new rows.
- A raw-SQL product insert in a test needs its default row in the same transaction (`withDefault()` in `products.db.test.ts`; `insertProduct()` and `insertSubtypes()` in `tests/helpers/catalog.ts`).
- A row that holds a quantity points at `product_variants.id`; its task adds the check to `PRODUCT_USES` (progress 1.7).
- Browser tests: after a click on a link to a new page, wait for its heading before filling a field: the old page's form has the same labels.

## 1.9 Prices and price history (15.10.2026, pull request #39)

**Built**
- Migration `0014_price_history`: enum `price_source`, `price_history` (FKs subtype and user; `price > 0`; blank-note CHECK; HEAD without and PURCHASE with `purchase_id`; unique `client_key`; identity `seq`), the append-only trigger, the deferred check `price_recorded` (a subtype's `reference_price` is its newest HEAD row's by `seq`; never back to empty) and the backfill of every 1.7 and 1.8 price.
- `recordHeadPrice()` (`actions/price-rows.ts`), the one writer of a HEAD row; `createProduct`, `createSubtype` and `addPrice` call it. `afterInsert` of `defineCatalogActions()` now takes `{ tx, userId }`.
- `addPrice` (`actions/prices.ts`, price.add, any subtype, the hidden default too), audit `price.add`; `src/domain/prices.ts` (sources, the note rule).
- Queries `listPrices`, `getPriceHistory`; `getProduct` gives `defaultVariantId`; `listChangeHistory` takes `also`. Pages `/prices`, `/prices/[variantId]` with `PriceForm`; `PriceHistoryLink` on the product and subtype pages; `AdminNav` has five pages and scrolls sideways at phone width.

**Left out, and the task that brings it**
- PURCHASE rows, the FK of `purchase_id`, `last_purchase_price`: 3.2. The 20% prompt: 3.9. Excel import of prices: 1.11. Seed prices: 1.13. The price on a request line: the request task after D42.

**What the next sessions must know**
- For 1.11: each imported price goes through `recordHeadPrice()` with the `reference_price` update in one transaction, or `price_recorded` refuses the commit.
- For 1.13: a seeded price needs its HEAD row and a Head as `set_by`.
- For 3.2: a PURCHASE row names its `purchase_id` (CHECK); add the FK then. `getPriceHistory` needs `branchFilter()` on PURCHASE rows before another role reads it.
- A raw-SQL price in a test needs its HEAD row in the same transaction: `priceSetter()` and the helpers of `tests/helpers/catalog.ts` do it.
- `reference_price` is never set back to empty once set.

## 1.10 Excel import: products, subtypes, departments (15.10.2026, pull request #40)

**Built**
- ExcelJS 4.4.0 (`overrides` lifts its `uuid` to ^11.1.1; audit clean). `src/server/excel.ts`: `readSheet()` (content check, 900 KB, real unpacking under 20 MB by `checkZip()`), `writeTemplate()`.
- `src/domain/imports.ts`: columns, limits, `cellText()`, `cellPrice()` (through `parseSom`), `headerMatches()`, `readProductRows()`, `readDepartmentRows()`. Titles and type words from the message files (`features/catalog/imports/titles.ts`).
- Migration `0015_catalog_imports` (enum `import_kind`, the import's client key, who, file, rows). `checkProductImport()`/`checkDepartmentImport()` (one query per table, `FOR SHARE` on save).
- `importProducts`, `importDepartments` (`actions/imports.ts`), query `previewImport`, page actions with `authorize()` before the file is read, route `GET /catalog/import/[kind]/template`, page `/catalog/import/[kind]`, Import buttons on both lists.
- `defineCatalogActions()` returns `insert` and `recordCreate`; `addSubtype`/`recordSubtypeCreate` hold createSubtype's body; a fence test keeps them inside actions. A custom Zod issue may name its field kind (`params.fieldError`).

**Left out, and the task that brings it**
- Prices of existing subtypes from Excel: 1.11. Existing stock: phase 5 (direct entry). Seed catalogs: 1.13. Subtypes for an existing product by file, updates by file: no task (decision 6).

**What the next sessions must know**
- For 1.11: add `PRICES` to `import_kind`, a column set to `IMPORT_COLUMNS` with its titles in the three files, a reader in `src/domain/imports.ts`, a check in `imports/check.ts`, and an action like `importProducts` that writes each price through `recordHeadPrice()` with the `reference_price` update. The page, the route and the page actions take a new kind as they are.
- An import's row error is the field `<row>:<column>`, the file's `file`; the form reads both back.
- A test that builds an import sheet uses `tests/helpers/imports.ts`.
- The page actions take a `FormData`; a server action's body limit is 1 MB, so the file limit stays under it.

## 1.11 Excel import: prices (15.10.2026, pull request #41)

**Built**
- Migration `0016_import_prices`: `PRICES` added to `import_kind`, nothing else.
- Kind `prices` on the 1.10 framework: columns product name, subtype, new price, note; `IMPORT_PERMISSIONS` (domain) gives each kind its permission, checked by page, template route, page actions and preview alike.
- `readPriceRows()` (domain; `named` feeds the preview's database check), `checkPriceImport()` (one query, subtypes locked `FOR UPDATE` in id order, every condition on the `product_variants` row; two rows on one subtype refused).
- `importPrices` under `price.add`; `setHeadPrice()` and `recordPriceAdd()` in `actions/price-rows.ts`, shared with `addPrice`, behind the write fence.
- An **Import prices** button on `/prices`; the import page of prices leads back to Prices.

**Left out, and the task that brings it**
- A template pre-filled with every subtype and its price: no task (idea in the report). Existing stock by file: phase 5. Seed prices: 1.13.

**What the next sessions must know**
- A new import kind: add it to `IMPORT_KINDS`, `IMPORT_PERMISSIONS`, `IMPORT_COLUMNS`, the message files (`imports.*.<kind>`), the enum, the page's columns and back link, and `saveImportAction`'s dispatch.
- A price with a note is set only through `setHeadPrice()` + `recordPriceAdd()`; the deferred `price_recorded` check refuses anything else at commit.
- The unknown kind in tests is now `stock`.

## 1.12 Product suggestions (15.10.2026, pull request #42)

**Built**
- Migration `0017_catalog_suggestions`: enum `suggestion_status`, `catalog_suggestions` (FKs, unique photo, product and client key; blank and length CHECKs; the decision shape CHECK), the guard trigger (no delete; decided once; what was sent never changes).
- `src/domain/suggestions.ts`; `suggestProduct`, `addSuggestedProduct`, `declineSuggestion` (`actions/suggestions.ts`), audit `suggestion.*`, notifications `PRODUCT_SUGGESTED` and `PRODUCT_SUGGESTION_DECIDED` with params and texts.
- Queries `listSuggestions`, `getSuggestion`, `countPendingSuggestions`; file owner `SUGGESTION_PHOTOS`; `decideList()`/`authorizeList()` and `roleMay()` in the permission layer.
- Pages `/suggestions`, `/new`, `/[id]`, `/[id]/add` (the product form of 1.7 with a `suggestion` prop); a row on `/catalog`; a link on the Manager's home.

**Left out, and the task that brings it**
- The Head's home list of suggestions: 6.2. The entry from the request editor's product search: the request task after D42. Adding a suggestion as a subtype of an existing product: no task.

**What the next sessions must know**
- A list of a branch permission that names no branch: `authorizeList()` and `branchFilter()` in the SQL; a branch view: `authorize()` on that branch (permission-matrix test through the view).
- A screen shows a button of a global permission through `roleMay()`, never `role === …`.
- For 6.1: keep the Manager's "Suggest a product" link beside the three large buttons. For 6.2: `countPendingSuggestions` and `listSuggestions` give the Head's list.
- A textarea inside `Field` needs its own `id`; only `Input` and `Select` read it from the field.
- `insertProduct()` takes `{ acceptedPhotoId }` for the add of a suggestion only; nothing else passes it.

## 1.13 Seed: catalogs (15.10.2026, pull request #43)

**Built**
- `scripts/seed-catalogs.mjs`: `seedCatalogs()` and the data (`SEED_MEASURES` 5, `SEED_CATEGORIES` 6, `SEED_EXTRA_COST_TYPES` 3, `SEED_COMPANIES` 6, `SEED_DEPARTMENTS` 4 CHL + 3 YUN, `SEED_PRODUCTS` 30: 26 goods, 4 services, 6 with 16 real subtypes), each price with its HEAD row and every entry with its audit row, the seed Head as actor.
- `seed()` returns `{ lines, catalogs }`; `db-seed.mjs` prints `lines` only, so CI's expected output is unchanged. The Dockerfile copies the new file.

**Left out, and the task that brings it**
- Demo requests in different statuses (rule 14): the request tasks after D42. The printed catalog lines and their CI step: the owner (report of #43).

**What the next sessions must know**
- To add seed catalog rows: extend the arrays of `seed-catalogs.mjs`; a new table needs its lock in `LOCKED_ENTITIES` (the order there), its audit row with the action's exact `after` fields, and a count in `SEED_CATALOGS` and the tests' `ALL_CREATED`.
- Prices in the seed are `BigInt` literals; money in an audit row goes through `som()` (decimal text).
- `seed()` no longer returns an array: read `.lines`.
- For the request tasks: the seed's products, subtypes and departments exist after `npm run db:seed`; look them up by name, never by a fixed id.

## 2.1 Orders: names and the built parts (15.10.2026, pull request #45)

**Built**
- Menu item `orders` (Orders, Заказы, Buyurtmalar) at `/orders`; `src/features/orders/`; every built text says order, with a test that none says request.
- Texts and params for the eleven `REQUEST_*` notification types: `{ actor, count, branch }`, the two waiting types `{ count, hours }`; `orderActionNotices()` splits an action into one notice per branch.
- Setting `overspend_guard_min_amount` (100 000n): migration `0018` (CHECK on the JSON text), `parseSomOrZero()`/`isSomOrZero()`, `storedSettingValue()`, the field on `/settings` beside the percent.
- Settings are read as `value::text` and parsed once (`selectSettingRows()`/`parsedSettingRows()` in `src/server/settings.ts`).

**Left out, and the task that brings it**
- The `/orders` page: 2.5 and 2.8. Sending the order notifications: 2.7, 2.10, 2.11, phase 4; the reminders: 8.1. The guard's check: phase 4.

**What the next sessions must know**
- For 2.2: add the lint rule that stops `src/domain/` importing from outside its folder (moved from 2.1, decision 7; the note in 0.1 named the old numbering).
- For 2.7: an order action notifies through `orderActionNotices(actor, orders)`: one `notify()` per branch with its `branchId`; never one notification across branches.
- For 8.1: a waiting reminder's `count` covers only the recipient's branches; `hours` is the setting in force.
- Trap: Drizzle's `jsonb` column parses a JSON text a second time (`"100000"` → 100000). Read a jsonb column that can hold a top-level JSON string as `::text` and `JSON.parse` once.
- A setting holding money is a JSON text in the row and a bigint in force; convert only through `settingsFrom()` and `storedSettingValue()`.
- Internal codes keep "request": permission keys `request.*`, `CREATE_REQUESTS`, `RequestStatus`, `requestStatus.*`, `REQUEST_*` (D43).

## 2.2 Domain: order totals (15.10.2026, pull request #46)

**Built**
- `src/domain/order-totals.ts`: `OrderPlan` (`quantity` text of numeric(14,3), `price` and `extras` bigint, `paymentType`), `orderGoods`, `orderExtras`, `orderTotal`, `ordersTotals` (goods, extras, grand, `byPaymentType` with all three codes), `priceHintPercent(typed, reference, threshold)` → `bigint | null`.
- decimal.js 10.6.0 through a private clone (precision 64, `ROUND_HALF_UP`); message `orders.priceHint` in three languages.
- ESLint fence: `src/domain/**` (tests excluded) imports nothing through `..` or `@/`; `ICON_IMPORT_PATHS`, `TEST_CLOCK_IMPORT_PATTERNS`, `DOMAIN_IMPORT_PATTERNS` in `eslint.config.mjs`.

**Left out, and the task that brings it**
- The totals under the list, group row totals, the hint on screen: 2.5 and the list tasks. Actual totals, difference, colours: phases 3 and 4.

**What the next sessions must know**
- Every planned money number calls `order-totals.ts`; a set is summed with `ordersTotals()`, never by rounding a summed quantity × price (08).
- The functions throw `RangeError` on an incomplete or invalid plan; for 2.5: pass only drafts that have quantity and price to `ordersTotals()`, and decide on the screen what a draft without a price shows.
- For 2.5: the hint compares with the subtype's reference price only (never the last purchase price), with the setting `price_hint_percent`; pass the bigint to `t("orders.priceHint", { percent })` as it is (cast to the message's number type), never through `Number()`.
- A later block that sets `no-restricted-imports` spreads `ICON_IMPORT_PATHS` and `TEST_CLOCK_IMPORT_PATTERNS` in (flat config replaces the options).

## 2.3 Domain: the state machine (15.10.2026, pull request #48)

**Built**
- `src/domain/order-moves.ts`: `ORDER_ACTIONS` (12 codes), `ORDER_MOVES` (the 21 entries of 06 Allowed moves), `OrderState`, `allowedActions(actor, orders)`, `checkMoves(actor, orders, action, { reason })`, `assertMove()` throwing `OrderMoveRefused`, `isMoveReason()`/`moveReason()` (5 to 500 code points), `ORDER_ACTION_MAX` 200.
- Permission `request.send_to_settlement` (Head all, Manager own orders, no right).

**Left out, and the task that brings it**
- The writer of the moves, events and version: 2.4 onward. The facts `buyingFinished`, `exactMatch`, `ownerClosesAlone`, `readyToClose`: phases 3 and 4. Button labels: the task that shows each button.

**What the next sessions must know**
- Every status move calls `assertMove()` (server) or `allowedActions()` (screen); no other code compares statuses to decide a move.
- For 2.4: `order_actions.type` and `order_events.type` take the `ORDER_ACTIONS` codes for the moves, plus the non-move events 2.4 decides. Raise `version` on every move, so decision 11 (one action across statuses) stays safe. Map `OrderMoveRefused`: `not_found` → `not_found`, `wrong_status` → `wrong_status`, `forbidden` → `forbidden`, `not_ready` and `reason` → `invalid_input` or a code of its own (2.4 decides); name every failing order.
- For 2.4: read every field of `OrderState` (branch, owner, `createdByHead`, the owner's `CLOSE_ALONE`) from the locked order and its owner inside the transaction, never from the input (developer-rules rule 13), with a test that a forged one has no effect; add the actions to the database matrix test.
- For 2.4 and 2.7: a taken-back Draft keeps its number and revision; only `SUBMIT_AGAIN` raises the revision (`PlannedMove.revisionUp`). `headStepAuto` is logged as "Created by Head".
- For phases 3 and 4: `ownerClosesAlone` is `true` when the owner is the Head or a Manager with `CLOSE_ALONE` on; a phase-2 caller passes `false` for the facts not built yet.
- A Draft of another user is `not_found` for everyone but its owner and the Head.

## 2.4 Orders schema and many orders in one action (16.10.2026, pull request #49)

**Built**
- Migration `0019_orders`: `number_counters`, `orders`, `order_extras`, `order_revisions`, `order_actions`, `order_events`, empty `stock_balances` (no `avg_cost`); enums from the domain lists; triggers `orders_guard` (number fixed, branch fixed once numbered, plan frozen outside DRAFT/RETURNED except Finance's payment type, delete only of a never-submitted draft), `order_extras_guard`, append-only history (UPDATE, DELETE, TRUNCATE).
- `src/server/order-action.ts`: `ordersInput()`, `defineOrdersAction()`, `runOrdersAction()`, `ordersServerAction()`; result `{ actionId, orders: [{ id, status }] }`. `src/server/order-moves.ts`: `orderMoveAction()`, `orderState()`. `authorizeOrders()`; code `not_ready`; `ActionFailure.orders`; `behindDraftWall()` in the domain.

**Left out, and the task that brings it**
- Every order action with a screen and its permission-matrix rows: 2.5, 2.7, 2.10, 2.11; the full matrix 2.15. Counter and revision rows: 2.7. "Already approved by … at …": 2.10. `avg_cost` and the ledger: 3.1.

**What the next sessions must know**
- Every action on ticked orders is an `orderMoveAction()` (or `defineOrdersAction()`); never `runAction()` with a loop. Write what a move adds in `afterMove` and return each order's event `note`/`payload`.
- For 2.5: drafts are edited with `runAction()` and `versionOf` on `orders`; a never-submitted draft writes no event and is deleted with its extras (cascade). Register orders as a file holder for `reference_photo_file_id` (unique).
- For 2.7: Submit sets `number`, `submitted_at`, `planned_total`, `stock_at_submit` before the status leaves DRAFT (the CHECKs need them); "Created by Head" is already `payload.headStepAuto`.
- For 2.5, 2.7, 2.10, 2.11: add each action's full role × branch × right rows to the permission-matrix test (permission review of 2.4).
- For 2.10: who acted and when comes from the order's newest `order_events` row.
- Test helpers: `tests/helpers/orders.ts` (`insertOrder`, `insertDepartment`, `insertOrderExtra`, `inventedNumber`).
- Trap: drizzle's `inArray(orders.id, …)` names the table, so it fails inside SQL that aliases `orders o`; join the ids with `sql.join` there.

## 2.5a Drafts: rules, actions and queries (16.10.2026, pull request #50)

**Built**
- `src/domain/drafts.ts` (quantity as the measure allows, suggested price, merge sum, Urgent reason, comment, `draftTotal()`, `totalFits()`, `seesDraftsGrid()`, `DRAFT_EXTRAS_MAX` 20); `isBusinessDate()`; the quantity pattern and `quantityOf()` exported from `order-totals.ts`.
- `src/features/orders/actions/drafts.ts`: `createDraft` (merges into the owner's never-submitted draft of the same branch, subtype and department, safe to repeat), `updateDraft`, `deleteDraft` (owner only), `setDraftsNeededBy` (all or nothing, `src/server/drafts-action.ts` on the 2.4 helpers). Queries `listDrafts` (paged, 25), `getDraft`, `searchDraftProducts`, `listDraftChoices`.
- Migration `0020_order_draft_adds` (the key, quantity, version and total of a merged add); `ORDER_USES` locks a product's type and measure; `ORDER_REFERENCE_PHOTOS` file owner with the draft wall.

**Left out, and the task that brings it**
- The grid on `/orders`, the `"use server"` exports and the Playwright tests: 2.5b. Keyboard, cards, offline retry: 2.6. Submit: 2.7.

**What the next sessions must know**
- For 2.5b: the actions are definitions only; add the `"use server"` exports there. A merged add answers `{ id, merged: true, quantity, version, total }`: update the shown row with them. `getDraft` returns `null` for every kind of not-found.
- For 2.5b: an edit that would make a second draft of the same trio is refused `draftExists` on `variantId` or `departmentId`; a total past `MONEY_MAX` is `tooLarge`.
- For 2.6: retries reuse the create's `client_key`; a deleted draft frees its keys (accepted risk, decisions 2.5a item 14).
- Find a row to merge into with `SELECT … FOR UPDATE` and the full match (`lockTrioDraft()`), never by id after a plain read. `tests/helpers/together.ts` `commitWhileWaiting()` tests a race without timers.

## 2.5b Drafts grid on `/orders` (16.10.2026, pull request #51)

**Built**
- `/orders`: the drafts grid for Manager and Head (every field of the order table as a cell, the add row with the product picker, the extra-costs dialog, the reference photo, autosave with "Saved", delete with a confirmation, "Sent back"/"Taken back" labels, the Head's "My drafts / Everyone's"); the selection bar (count, apply needed-by, clear); the ticked totals under the grid. Principal and Finance: title and an empty state.
- Domain: `extrasSum()`, `tickedDraftsTotals()`, `draftRowRights()`, `addsDraftsIn()`. `parseTypedDate()` in `src/i18n/format.ts`. `draftsServerAction()`. Seven page actions in `src/app/(app)/orders/actions.ts`, money as text (`src/features/orders/draft-wire.ts`).

**Left out, and the task that brings it**
- Tab and Enter between cells, phone cards, offline retry: 2.6. Submit: 2.7. Group rows, filters, sorting, "Select all on this filter": 2.8.

**What the next sessions must know**
- For 2.6: each row saves through `createRowSaveQueue()` (`src/features/orders/components/row-save-queue.ts`); "Apply to ticked" holds the queues. Text cells are `TextCell` (blur or Enter). After every save the row is read again with `getDraftAction`.
- For 2.7: put Submit in the selection bar beside Apply, shown with `canApplyToTicked()`-style rights; ticks belong to the page shown.
- For 2.8: the grid page reads the branch from the top bar's cookie (`currentBranchChoice`); the list goes above the grid.
- e2e: `E2E_DRAFT_USERS` (one Manager per project); type into the picker with `expect(...).toPass()` (typing before hydration is lost).
- A text with the word "request" fails `tests/notification-texts.test.ts`: field 7 is labelled "Department".

## 2.6 Drafts: keyboard and phone (16.10.2026, pull request #52)

**Built**
- Enter moves down a column (Shift+Enter up), the last draft to the add row; Enter in the add row adds or goes to the first empty field; after an add the focus is on the product cell.
- Below 640 px each draft is a card (same DOM, `data-card-label`); the ticked totals stick to the bottom, folded on a phone.
- Retries: `src/components/retry-wait.ts` (`createRetryWaits()`, `retryWhileLost()`); the row queue answers `lost` and retries; "No connection. Trying again…", "Not saved" with "Try again"; an unanswered add stays locked with "Start over".
- Fixed: a render loop of the typed cells on `/orders` (stable `typedOf`).

**Left out, and the task that brings it**
- Submit: 2.7. Group rows, filters: 2.8. Ctrl+K search: its own task.

**What the next sessions must know**
- Every cell of a draft row is `Cell` with `data-col`: a new column needs one, or Enter skips it. The add row's fields have the ids `add-branch`, `add-product`, `add-department`, `add-quantity`.
- For 2.7: Submit is a move without a client key: never retried automatically (decisions 2.6 item 7). Use the grid's `refresh()` (held while an add retries), not `router.refresh()`.
- `queue.save(job, landed)`: a job answers `lost` for no answer; `landed(sentVersion)` decides a stale retry.
- e2e: `context.setOffline(true)` makes a server action throw at once in Next 16; `renderLoops(page)` in `drafts.spec.ts` catches React render loops.

## 2.7 Submit and the order numbers (16.10.2026, pull request #53)

**Built**
- Submit of ticked drafts on `/orders`: `submitDrafts` (`src/features/orders/actions/submit.ts`) on `orderMoveAction` with a `beforeMove` hook; checks by `submitRefusals()` (`src/domain/submit-checks.ts`), all or nothing, `not_ready` with the failing cells in `fields`.
- Numbers `CODE-YY-NNNN` by `orderNumber()` (`src/domain/order-numbers.ts`), one upsert of `number_counters` per branch, in creation order; `planned_total`, `stock_at_submit`, one `order_revisions` row; Head-created orders go to Waiting for Principal, "Created by Head".
- Branch code locks at its first numbered order: `updateBranch` and the trigger `branches_code_locked` (0021).
- The grid: Submit in the selection bar, marks on the exact cells, the list on top; `submittedNumbers` reads the numbers for the message.

**Left out, and the task that brings it**
- Submit again, Take back, Cancel: 2.11. The `action=` filter of the notification link: 2.8. "What changed": 2.12.

**What the next sessions must know**
- For 2.11: a numbered DRAFT (taken back) is refused at Submit with `not_ready`; its re-submit needs a new revision row (`order_revisions` is append-only, UNIQUE(order_id, revision)), and `submitted_at` of a re-submit is decided there.
- For 2.8: the notification link is `/orders?branch=<id>&action=<actionId>`; read `action` as "the orders of this action", with the branch and draft walls in the SQL.
- For 4.10: `toWhenHeadCreated` and the Principal's "Head approved" rest on the actor of a Head-created draft being a Head; a Head-created draft moved to a Manager breaks that; check the actor is a Head there (permission review of 2.7).
- `commitWhileWaiting(change, action, waiters)`: pass 2 when two transactions must both wait on the change.
- A query reading orders by id puts the draft wall in the SQL even for numbered orders (`.claude/rules/server-actions.md`).

## 2.8 Order list: group rows, ticking and filters (16.10.2026, pull request #54)

**Built**
- `/orders` for every role: the order list above the drafts grid. Filters and sort in the address (`src/features/orders/list-filters.ts`), group rows per branch, subtype and status, 25 a page, opening to their orders; ticks on rows and orders; "Select all on this filter" (200); the action bar with count and totals.
- Domain `src/domain/order-list.ts`: `groupSummary()`, `groupPriceHint()`, `pinsUrgent()`, `tickFits()`, `LIST_STATUSES`; `nextBusinessDate()`.
- Queries `listOrderGroups`, `selectAllOnFilter`, `tickedSummary`, `listOrderFilterChoices` (`queries/order-list.ts`), each in one `readSnapshot()`; page actions `selectAllOnFilterAction`, `tickedSummaryAction`.

**Left out, and the task that brings it**
- Move buttons in the bar: 2.10, 2.11. Copy as new, Overdue: 2.13. Download: 2.14. Colour labels: phase 4. The Manager's "30 requested": 6.1.

**What the next sessions must know**
- For 2.10 and 2.11: add each move's button to `ListActionBar` where `summary.actions` names it; pass the ticked ids and versions (`selectAllOnFilter` gives versions; the groups' orders carry `version`), then `router.refresh()`. After a move the ticks should be cleared.
- For 2.14: read the filters with `parseListFilters()` and the rows with `listWhere`'s filters; the number and date rules are there.
- For 2.9: the order number in an opened group is plain text; make it the link to `/orders/[id]`.
- For 6.1: 05 Group rows 5 ("30 requested", every stage) is the Manager's home (decisions 2.8 item 2).
- The grid pages with `?draftsPage=` now; `page=` is the list's.
- A query that reads in several statements uses `readSnapshot()` (`.claude/rules/server-actions.md`).

## 2.9 Order page (16.10.2026, pull request #55)

**Built**
- `/orders/[id]` for every role: top block, stepper, tabs Details and History (`?tab=history`), the action bar with Submit on a Draft and otherwise the waiting line. The list's order number links to it.
- Domain `src/domain/order-steps.ts`: `orderSteps()` (only the moves after the newest Submit count) and `waitingFor()`.
- Query `getOrderPage` (`queries/order-page.ts`) in one `readSnapshot()`, the walls inside the SQL; `othersSeen` counts only the orders of an action the reader may see.
- `src/features/orders/order-facts.ts`: `createdByHeadSql`, `ownerClosesAloneSql`, shared with `tickedSummary`.

**Left out, and the task that brings it**
- Approve: 2.10. Send back, Reject, Cancel, Take back, Submit again: 2.11. What changed: 2.12. Purchases tab: 3.5. Money tab: 4.3. Colour labels: phase 3/4. Stock at submit and now: 2.10.

**What the next sessions must know**
- For 2.10 and 2.11: add each move's button to `OrderActionBar` (`src/features/orders/components/order-action-bar.tsx`) where `order.actions` names it, with the confirmation of 11 rule 6; the waiting line shows only when `actions` is empty (decisions 2.9 item 4).
- For 2.10: stock at submit and stock now go into the page's Details and the list's opened group (06 rule 10).
- For 2.12: History reads `order_events` newest first; "What changed" can sit above Details on a re-submitted order.
- Every e2e project has its own order-page Manager and Finance user (`E2E_PAGE_USERS`).
- A query file's exports under `queries/` are counted as queries by `tests/permission-registry.test.ts`: shared SQL fragments live outside `queries/`.
- Two vitest runs at once drop each other's template database: run one at a time.

## 2.10 Approvals (16.10.2026, pull request #56)

**Built**
- `approveOrders` (`src/features/orders/actions/approve.ts`): one action for the three steps on `orderMoveAction`; Finance's `paymentTypes` written in `beforeMove`, `approved_at` in `afterMove`; one notice per branch and step (`notices.ts`: `actionLink`, `branchNotices`, shared with Submit).
- `approveOrdersAction` answers `decided` for orders another approver moved: `newestMoves` query + `alreadyApprovedBy()` (`src/domain/already-decided.ts`), named only to a role that approves that step.
- `ApproveButton` (list bar and order page), Finance's payment-type selects in the dialog; refused orders named above the list and marked in their group. Stock at submit and now on the page and in the opened group.

**Left out, and the task that brings it**
- The cash table of Finance's dialog and per-type totals following the selects: 4.2. Send back, Reject, Cancel, Take back and their "Already … by" verbs: 2.11.

**What the next sessions must know**
- For 2.11: pass a move's button into `ListActionBar`'s `actions` slot and `OrderActionBar` like `ApproveButton`; send versions through `versionOf` (the list keeps the last shown version per id in a ref).
- For 2.11: extend `alreadyApprovedBy()` with the other verbs; `newestMoves` already returns `type` and `from`.
- For 4.2: `ConfirmDialog` takes `children` under its result line; the Finance dialog's selects live in `approve-button.tsx`.
- `plainQuantity()` refuses 0; a stock is read with `inStock()`.
- The e2e Head reads Uzbek and is shared: never change his language in a spec.
- `departments.spec.ts` can fail when its random tag holds "eb"/"ea" (the branch filter is `hasText`); seen once in this build, not fixed here.

## 2.11 Send back, reject, cancel, take back; what changed (16.10.2026, pull request #61)

**Built**
- `sendBackOrders` (reason, a note per order), `rejectOrders`, `cancelOrders`, `takeBackOrders`, `submitAgainOrders` (`src/features/orders/actions/`) on `orderMoveAction`; the page actions share `moveAnswer()` with Approve.
- Submit of a taken-back Draft: same number, revision and first `submitted_at`; its copy is the revision's next `submission` (migration 0022, key (order, revision, submission)).
- `submit-steps.ts`: the checks, numbers, plan facts and copies of Submit and Submit again, one copy.
- Domain `revisionChanges()` (`src/domain/revision-changes.ts`) and `alreadyDecidedBy()` (all five verbs); `draftSubmittableAgain()`.
- `MoveButton` (reason box, notes) in the list bar and the page bar; Submit again in the drafts grid; `WhatChanged` above Details from rev 2.

**Left out, and the task that brings it**
- Copy as new of a rejected order: 2.13. Reminders: 8.1. Cancel of a taken-back Draft: none (decisions 2.3 item 7).

**What the next sessions must know**
- For 8.1: `submitted_at` stays the first submit; "waiting more than 24 hours" is measured from the newest `order_events` row that moved the order into its step, never from `submitted_at` (review of the plan of 2.11, correction 2).
- For 2.13: Copy as new reads the order as it is; `order_revisions` keeps every copy, the newest of a revision is its highest `submission`.
- `created_by_head` of `lockOrders` is true only for a never-submitted order: a taken-back order goes to the Head (permission review, Must fix 1).
- A test that orders events by time sets a different clock for each move: two moves at one frozen time come back in id order.
- `catalog.spec.ts` once missed its dialog under the full parallel run; it passed alone. Not fixed here.

## 2.13 Copy as new and stale drafts (16.10.2026, pull request #62)

**Built**
- `copyOrdersAsNew` (`src/features/orders/actions/copy-as-new.ts`) on a third wrapper, `runCopyAction` of `src/server/copy-action.ts`: one client key per ticked order, a savepoint per create so a refusal names its order. Page export `copyOrdersAsNewAction`.
- `insertDraft()` takes the fields as written; `createDraft` fills and checks the picks before it. `mergeInto()` and `firstAnswer()` are exported for the copy.
- `isOverdue()` (`src/domain/order-steps.ts`), `GroupSummary.overdue`; `overdue` and `canCopy` in `listOrderGroups`, `tickedSummary` and `getOrderPage`.
- `CopyButton` in the list bar and the page bar; the Overdue label (icon `schedule`). S18 as a database test over the 2.5a hint.

**Left out, and the task that brings it**
- Download: 2.14. The orders' branch wall sweep: 2.15. Reminders: 8.1.

**What the next sessions must know**
- For 2.15: `copyOrdersAsNew` reads sources through `guardOrders` (branch wall, draft wall); its matrix is `copy-as-new-matrix.db.test.ts` and `actions-matrix.db.test.ts`.
- For 8.1: `isOverdue()` is the one test of "late against needed-by"; a reminder that names late orders calls it.
- A test fixture that gives a submitted order plan fields or extras writes them while it is RETURNED, then sets the status (`orders_plan_frozen`): see `withPlan()` in `copy-as-new.db.test.ts`.
- Every bar that counts its buttons in an e2e test now counts Copy as new for a user who may add drafts in the branch.

## 2.14 Download: Excel and PDF (17.10.2026, pull request #63)

**Built**
- `GET /orders/download/excel` and `/orders/download/pdf` (`src/app/(app)/orders/download/[format]/route.ts`): every order of the list's filters, in the list's order, in the downloader's language (`chooseLocale()`).
- Query `orderDownload()` in `queries/order-list.ts` under `data.export`, through the list's own `listWhere()`; filter names read inside the walls. Domain `orderDownloadRow()` (`src/domain/order-download.ts`) over `orderSteps()` and order-totals.
- `src/features/orders/download/`: `columns.ts` (the one table both files draw), `filters-text.ts`, `excel.ts` (money cells up to `MONEY_MAX`), `pdf.tsx` (letterhead, Golos Text from `fonts/`), `DownloadButtons` on `/orders`.
- `headStepAutoSql` in `order-facts.ts`, shared by the order page and the download.

**Left out, and the task that brings it**
- The actual columns (actual quantity, price, extras, total, difference): 3.5.

**What the next sessions must know**
- For 3.5: add the actual columns to `DOWNLOAD_COLUMNS` and `DownloadLine` in `columns.ts`, the values from the domain functions of 3.x; both files follow. Money cells go through `moneyCellValue()`; a negative difference needs its own bound there.
- For 5.4 and 6.7: reuse the PDF parts of `pdf.tsx` (fonts, letterhead, `logoPng()`); the Golos Text TTFs must keep distinct PostScript names, or react-pdf embeds one font copy per text run (641 copies, 1.2 MB, seen here).
- Golos Text has no U+02BB: the PDF fonts map it to the glyph of U+2018 (decisions 2.14). On screen the browser falls back to another font for it.
- PDF text in tests: `pdfPages()` of `tests/helpers/pdf-text.ts` (pdfjs-dist, dev only).
- `next start` locally needs `BETTER_AUTH_SECRET` to sign in; a throwaway value in the shell is enough for a local check.

## 2.15 Orders: branch wall and matrix (17.10.2026, pull request #64)

**Built**
- `describeTickedWall()` (`tests/helpers/ticked-wall.ts`): every order action on ticked orders, each role, an own and another branch's order ticked together; the answer each expects from `permission-matrix-expected.ts`; refused whole with nothing saved (orders, actions, events, revisions, draft adds, notices, number counters), or both saved. Used in `src/app/(app)/orders/branch-wall.db.test.ts`, with the ticked-id reads (`tickedSummaryAction`, `newestMoves`, `submittedNumbers`).
- A repeat of `runOrdersAction` puts the sent ids through the branch and draft walls (`wallSent()` in `src/server/order-action.ts`): a known key with another branch's id was answered before.
- `src/app/(app)/not-found.tsx`: "Not found" for every signed-in `notFound()`, `EmptyState`.
- S7 for orders: `tests/e2e/branch-wall.spec.ts` (Not found at an EB address; the page's Approve request forged by `page.route`). E2E users `e2e_wall_phone`/`_desktop`, Managers of EA and EB.
- Seed: seven orders (`scripts/seed-orders.mjs`), found again by fixed client keys; the seed test checks totals, numbers, dates, moves and copies against the domain.

**Left out, and the task that brings it**
- S7's stock part: 5.2. S7's report part: 6.8.

**What the next sessions must know**
- For 3.x, 4.x, 5.x: put every action on ticked orders through `describeTickedWall()`; pass `saved` when the action does not raise the ticked orders' version.
- For 5.2 and 6.8: `tests/e2e/branch-wall.spec.ts` holds S7; add the stock and report parts there, the forged request through `page.route` as for Approve.
- A move is refused behind the wall by `guardOrders()` and by the state machine's `judge()`: a mutation of one alone leaves the move cells green.
- The seed's orders are data in `SEED_ORDERS`; an order whose product, subtype or department is not found as listed is left out.
- `notifications.spec.ts` (its users are Heads, and every parallel Submit or Approve notifies all Heads) and `catalog.spec.ts` each failed once in the full local e2e run and passed alone; not fixed here.

## 3.1 Stock ledger (17.10.2026, pull request #65)

**Built**
- Migration `0023_stock_ledger`: `stock_movements` (enum `stock_movement_type`, `seq` identity for order, CHECKs on 0, sign by type, cost and balance, append-only triggers); `stock_balances.avg_cost` (bigint, ≥ 0, 0 when empty).
- `src/domain/stock.ts`: `MOVEMENT_TYPES`, `MOVEMENT_RULES` (direction and priced/at-average per type), `nextBalance()` (stock, moving average half up, refusal with the available quantity).
- `src/server/stock-ledger.ts`: `postMovement(tx, input)` (product FOR SHARE, service and measure refused, balance FOR UPDATE or made, movement and balance written) and `postMovements()` (lines in branch, subtype order); `StockShortError` (`conflict` with `available`).
- `STOCK_USES` in `PRODUCT_USES`: a movement locks a product's type and measure.

**Left out, and the task that brings it**
- FKs of `purchase_id` and `document_line_id`: 3.2 and 5.1. A reversal's match to its movement: 3.7 and 5.7. The nightly recompute: 8.2.

**What the next sessions must know**
- For 3.3, 3.7 and 5.x: call `postMovement()` (one line) or `postMovements()` (several) inside the action's transaction; `branchId` from the locked record, `createdBy` the wrapper's `userId`; the type-to-permission contract is in the header of `stock-ledger.ts`. Never under `readSnapshot()` (REPEATABLE READ).
- For 3.7: a cancelled purchase is a priced REVERSAL of the receipt (`unitCost` = its price); the average floors at 0. Check its branch and variant against the receipt.
- For 5.4: `StockShortError.available` is what the Issue screen names; show it only for the actor's own branch.
- For 5.6: a RETURN into empty stock comes in at average 0 (decisions 3.1 item 2); a cost of its own enters through `MOVEMENT_RULES`.
- For 8.2: replay movements by `seq`; `balance_after` of the newest is the balance.
- A same-moment test of an existing balance must find the row there first: `insert … on conflict do nothing` alone also serialises a held update, so `postMovement` locks before it inserts.

## 3.2 Purchases schema and domain (17.10.2026, pull request #66)

**Built**
- Migration `0024_purchases`: `purchase_trips` (unique `client_key`), `purchases` (with `branch_id`: composite keys to the trip and to the order, `orders_id_branch_key`; CHECKs on qty, price ≥ 0, comment length, the cancel fields together), `purchase_extras` (amount > 0), `trip_files` (unique `file_id`); `stock_movements_purchase_fk` on (`purchase_id`, `branch_id`, `variant_id`); the key of `price_history.purchase_id`.
- Triggers: `purchases_cancel_only` (one cancel, nothing else; no delete); `purchasing_append_only` on trips, extras and trip files.
- `src/domain/purchases.ts`: `actualQuantity`, `actualGoods`, `actualExtra`, `actualTotal`, `difference`, `progressAfterBuying`, `finishRefusal`, `splitGroupQuantity`, `ORDER_PROGRESS` (the enum of `orders.progress` now reads it). `Exact` of `order-totals.ts` is exported and shared.
- `tests/helpers/purchases.ts`: `insertTrip`, `insertPurchaseRow`, `insertPurchase` (raw rows for constraint tests).

**Left out, and the task that brings it**
- Recording, the cached `actual_total`, progress written, `last_purchase_price` and the PURCHASE price row: 3.3. Trip of many orders and the one-owner rule: 3.4. Finish and Not bought: 3.5. Same-product substitution: 3.6. Cancel and its reason rules: 3.7.

**What the next sessions must know**
- For 3.3: a record's date, supplier and payment type are read from its trip; write `purchases.branch_id` = the trip's branch, and a receipt movement with `purchaseId` and the record's subtype, or the keys refuse. Add the `trip_files` owner to `FILE_OWNERS` (trip's branch, `data.view`) in the same task, and refuse under the lock a file held anywhere or not uploaded by the caller (permission review of 3.2). `price_history.price > 0`: decide whether a gift writes a PURCHASE row. Permission-matrix tests: four roles, own and other branch, own and other Manager's order, RECORD_PURCHASES off.
- For 3.3 and 3.5: after each record saved or cancelled, `orders.progress` = `progressAfterBuying(current, planned, actualQuantity(records))`; `actual_total` = `actualTotal(records)`, never a stored sum.
- For 3.4: build the group's orders from the trip's branch in SQL before `splitGroupQuantity`; an order given "0" gets no record.
- For 3.7: a cancel is one UPDATE of the four cancel columns; the trigger refuses anything else. Cancel trip = cancel each record.

## 3.3 Record a purchase (17.10.2026, pull request #67)

**Built**
- `recordPurchase` (`src/features/purchasing/actions/record-purchase.ts`) on `runOrdersAction`, one order (`.length(1)`): trip, record, extras, trip files, Receipt movement for a product, last purchase price and PURCHASE price row above price 0, `actual_total` and `progress`, event `RECORD_PURCHASE` (payload `purchase`, note = comment). Page export `src/app/(app)/orders/[id]/purchase/actions.ts`.
- Domain: `purchaseCommentNeeds`, `purchaseDateRefusal`, `sameAsPlanned` in `src/domain/purchases.ts`. `ORDER_EVENT_TYPES` (moves + writes) in `order-moves.ts`; migration `0025_record_purchase` adds the enum value.
- `/orders/[id]/purchase` (`PurchaseFormView`), `getPurchaseForm`; order page: Record purchase button, Received/Used fact, actual total from the records. `TRIP_FILES` in `FILE_OWNERS`. `orderRecords()` in `src/features/purchasing/order-records.ts`.

**Left out, and the task that brings it**
- Many orders and group rows, `describeTickedWall()`: 3.4. Purchases tab, finish, reopen, red over-plan number: 3.5. Substitution: 3.6. Cancel: 3.7. "No receipt" label: 4.5. Give to requester: 5.4. Home button: 6.1.

**What the next sessions must know**
- For 3.4: widen the input's `.length(1)`; the field checks run in `write()` and throw `ActionError("invalid_input")` with paths per order; add `describeTickedWall()`.
- For 3.5: "buying more than planned needs a comment" is `purchaseCommentNeeds()` (`OVER_PLAN`); reuse it. A record is refused unless progress is OPEN: the reopen makes it recordable. Read actual numbers with `orderRecords()`.
- For 3.5, 3.7: add new history writes to `ORDER_EVENT_TYPES` and a label under `orders.page.history.moves`.
- A form with `UnsavedChangesGuard` that leaves after saving passes `dirty && !pending`, and does not `revalidatePath` its own page: the guard's `history.back()` or the re-render cancels `router.push`.

## 3.4 One trip, many orders (17.10.2026, pull request #68)

**Built**
- `recordPurchase` takes 1 to 200 orders as one trip: shared `purchasedOn`, `paymentType`, `supplierId`, `receiptFileIds`; one `lines[]` entry per ticked order (`qty`, `unitPrice`, `extras`, `comment`), matched to the ticked ids by Zod. One branch and one owner checked first in `write()` (`errors.field.tripOneOwner`); records written in `inSplitOrder()` (new in `src/domain/purchases.ts`, shared with `splitGroupQuantity`); movements through one `postMovements()`; last purchase price per subtype in variant-id order.
- `getPurchaseForm(userId, ids)` returns the recordable orders, their owners and a left-out count; `/orders/purchase?ids=` (new) and `/orders/[id]/purchase` share `PurchaseFormView` (blocks per subtype with one quantity and price split by `splitGroupQuantity`, per-order Same as planned, the Head's owner select).
- `tickedSummary().recordTrip` and the "Record purchase" link in the list's action bar.
- `describeTickedWall` options `order`, `oneBranch`, `unchanged`.

**Left out, and the task that brings it**
- Subtype bought (substitution): 3.6. Give straight to requester: 5.4. Purchases tab, finish, reopen: 3.5. Cancel a record or trip: 3.7. Colours: 3.8. Phone one-at-a-time layout: 3.9.

**What the next sessions must know**
- For 3.5 and 3.7: an action on ticked orders that writes purchasing rows passes `unchanged` to `describeTickedWall` so a refusal is checked against those tables.
- For 3.6: the subtype bought goes into each `lines[]` entry; `plansOf()` in `record-purchase.ts` reads the ordered subtype, and the movement and price steps take `plan.variantId`.
- For 3.9: `PurchaseFormView` takes `backHref`; its line errors are `lines.<index in what was sent>.<field>`, mapped back through `sent`.
- An e2e insert that uses one `pg` parameter in two places casts each use (`$5::numeric`, `$5::bigint`), or PostgreSQL refuses "inconsistent types deduced".

## 3.5 Purchases tab, order progress and the actual columns of the download (17.10.2026, pull request #69)

**Built**
- `finishOrders`, `markNotBought`, `reopenBuying` (`src/features/purchasing/actions/finish-buying.ts`) on `runOrdersAction` under `purchase.record`, events `FINISH_ORDER`, `MARK_NOT_BOUGHT`, `REOPEN_BUYING` (migration `0026_finish_buying`, payload `progress: {from, to}`); page exports in `src/app/(app)/orders/actions.ts`.
- The wrapper's optional `inspect()` step (`src/server/order-action.ts`): a check that reads other tables under the lock, its failures named with `check()`'s.
- Domain: `finishedProgress` (replaces `finishRefusal`), `BUYING_ACTIONS`, `buyingStatusAllows`, `buyingRefusal`, `buyingActions`, `actualUnitPrice`, `overPlan`, `BUYING_STATUSES`; `orderDownloadRow()` takes the records and returns `actual`.
- CHECKs `orders_finish_reason_check`, `orders_progress_status_check`.
- `/orders/[id]?tab=purchases` (`PurchasesTab`), `ProgressLabel` in `status-label.tsx`, the three buttons through `MoveButton` on the page and in the list bar (`tickedSummary().buying`); history line of the progress.
- The five actual columns in Excel and PDF; the PDF prints the measure beside each quantity; `recordsOfOrders()` and `recordsOfListed()` in `order-records.ts`.

**Left out, and the task that brings it**
- Substitution: 3.6. Cancel and the cancelled count: 3.7. Colours and actual totals under the download: 3.8. Finished-orders summary, Send to settlement, Close: 4.4. Money tab: 4.3.

**What the next sessions must know**
- For 3.7: a cancel that takes Done short (or Not bought) back to Open clears `finish_reason` in the same update, or `orders_finish_reason_check` refuses it.
- For 3.8: the Number colour's "Bought more" is `overPlan()`; build on it, not a second comparison.
- For 4.4: "buying finished" is `progress <> 'OPEN'`; a reopened order is Open again until Finish order or a record that reaches the plan.
- An action whose check needs rows besides the locked orders uses `inspect()`, not `write()`, so every failing order is named in one answer.
- @react-pdf/renderer loses letters in a PDF made after a Russian one in the same process (reproduced on `main`; see the report of 3.5). `route-actual.db.test.ts` is its own file so its PDF is the process's first.

## 2.7b Confirm before Submit in the drafts grid; the S19 test (17.10.2026, pull request #73)

**Built**
- The drafts grid's "Submit (N)" and "Submit again (N)" open the shared `ConfirmDialog` with the count and the result (`11` rule 6); Cancel sends nothing; Confirm runs `submit(ids, again)` with the ids kept when the dialog opened, so the count shown is the count sent.
- Texts `orders.submit.confirmTitle`, `confirmResult`, `confirm`; Submit again reuses `orders.moves.title/result/button.SUBMIT_AGAIN`.
- The S19 test of `approve.db.test.ts`: three orders of quantity 10; each row's quantity and count (20/2, 20/2, 30/3); 3 events and 3 numbers.
- Playwright: a new confirmation test in `drafts.spec.ts`; the grid Submit steps there and Submit again in `send-back.spec.ts` (with a Cancel step) go through the dialog.

**Left out, and the task that brings it**
- Nothing of the task.

**What the next sessions must know**
- A grid or bar action of `11` rule 6 asks through `ConfirmDialog` and sends exactly the ids the dialog counted.
- A Playwright step that confirms finds the button inside `getByRole("alertdialog")` with `exact: true`: the bar's "Submit (2)" stays in the page under the dialog.
- The 2.7 Submit tests of `drafts.spec.ts` read every order of their product; a new test there uses products of its own.

## 2.11b The two findings of 2.11's last review (17.10.2026, pull request #75)

**Built**
- `createdByHeadSql` reads `c.role = 'HEAD' and number is null`, as `created_by_head` of `lockOrders()`; the order page and the list's ticked summary read it.
- `src/features/orders/order-facts.db.test.ts`: a Head's order walks Submit, Send back, Submit again, Take back; the fact reads the same on screen and server at each end.
- `src/server/db/schema/order-revisions-0022.db.test.ts`: 0022 over rows written before it.

**Left out, and the task that brings it**
- The `/spec-change` of 03 rule 6 (decisions 2.11 item 8): the owner's, on issue #9.

**What the next sessions must know**
- A fact read by both `order-facts.ts` and `lockOrders()` changes in both, and `order-facts.db.test.ts` gets a case.
- Take back works only at Waiting for Head: a Head's own order reaches a taken-back Draft only through Send back and Submit again.
- A migration test over old rows cuts the journal twice (before and up to the migration), so later migrations never run over its hand-made rows.

## 3.6 Substitution (17.10.2026, pull request #76)

**Built**
- `recordPurchase`: each `lines[]` entry takes `variantId`, the subtype bought; `refuseSubtypes()` locks every subtype bought `FOR UPDATE` in id order and refuses another product's or an unknown id (`errors.field.otherProduct`) and an inactive subtype or product (`errors.field.inactive`); the ordered subtype is always allowed. Record, Receipt movement, last purchase price and PURCHASE price row take the subtype bought; the event payload names it.
- Domain: `isSubstituted()`; `purchaseCommentNeeds()` takes `variantId` and `plannedVariantId` and returns `SUBSTITUTED`.
- `getPurchaseForm`: `subtypes` per order (the ordered first, then the product's other active ones by name); the form's Subtype bought select per line and per group block.
- `getOrderPage`: `substituted`, and `variantId` and `boughtSubtypeName` per record; `SubstitutedLabel` (info, `swap_horiz`) in the header, "Bought: …" in the Purchases tab.
- The 4.4 line "From 3.6" in the build plan.

**Left out, and the task that brings it**
- "Cannot close alone; Finance reviews it" and exact match: 4.4. Cancel of a substituted record: 3.7.

**What the next sessions must know**
- For 4.4: substituted is `isSubstituted(order.variantId, records)` over records with `variantId` and `isCancelled`; `orderRecords()` does not carry `variantId` yet, so read it beside them or widen the row.
- For 3.7: a cancel's REVERSAL is on the record's `variant_id` (the subtype bought), not the order's.
- For 3.9: the subtype select is `#purchase-subtype-<orderId>`; it shows only when `subtypes` has more than one entry.
- Any action that updates `product_variants` rows it also checks locks them `FOR UPDATE` first, in id order: a share lock upgraded later deadlocks two trips (`substitution.db.test.ts`).

## 3.7 Cancel a purchase record or a trip (17.10.2026, pull request #77)

**Built**
- `cancelPurchase` and `cancelTrip` (`src/features/purchasing/actions/cancel-purchase.ts`) on `runOrdersAction` under `purchase.cancel`, event `CANCEL_PURCHASE` (migration `0027_cancel_purchase`), payload `purchase: {id, tripId}` and `progress: {from, to}`; page exports `cancelPurchaseAction`, `cancelTripAction`.
- The write: the one cancel update; a priced `REVERSAL` per goods record on its branch and subtype bought, `reverses_movement_id` its RECEIPT; every short subtype refused at once (`not_ready`, field `stock: errors.field.stockShort`); the last purchase price back to the newest live record; `actual_total`, progress and finish reason again; `PURCHASE_CANCELLED` to every active Head.
- Domain: `purchaseCancelAllows()`, `cancelledCount()`, `finishReasonAfter()`.
- `getOrderPage`: `canCancel` and `trip` per record, `cancelledCount`; `CancelPurchaseButton` on the Purchases tab; the count beside the progress.

**Left out, and the task that brings it**
- Settlement's cancelled count with links: 4.5. Corrections after Closed: 4.8 (a "From 3.7" line). Manager analytics' cancelled records: 6.5.

**What the next sessions must know**
- For 4.5: the count is `cancelledCount()` over the order's records; link each record of the Purchases tab.
- For 4.8: a reopened order is Open, so `purchaseCancelAllows()` lets the cancel through; nothing else to build for it.
- For 5.4: an issue made by "Give straight to requester" blocks the record's cancel through the stock rule; the message already names the two ways out.
- For 6.5: cancelled records are `purchases.is_cancelled`, by `cancelled_by`.
- An action that reads child rows named by the browser filters them by the locked orders inside its SQL before locking them (`lockRecords()`).
- `tsc` can keep stale message-file types in `tsconfig.tsbuildinfo`: delete it when a new key is reported missing.

## 3.8 The three colours (17.10.2026, pull request #78)

**Built**
- `src/domain/colours.ts`: `orderColours()` and `setColours()` (Number, Price, Total; grey while buying is Open; the worst colour among the orders that have one; Total from the summed difference, grey while any order is buying). `liveRecords()` exported from `purchases.ts`.
- `ColourLabel` gains the set form (`orders`: a count) and Price orange at 0; `ColourLabels` shows the three from `WireColours`; `colourLabel.orders` in the three languages.
- `listOrderGroups()`: `colours` per order and per group; `tickedSummary()`: `colours`; `getOrderPage()`: `colours`. Wire: `wireColours()` in `list-wire.ts`.
- The labels on group rows, order rows, the list's action bar and the order page.

**Left out, and the task that brings it**
- Exact match and Close: 4.4. Settlement: 4.5. An actual-totals line under the download: no task asks for it (named in the report).

**What the next sessions must know**
- For 4.4: exact match starts from `orderColours()` (Number and Price green); add the other conditions beside it, not a second colour rule.
- For 4.5 and 6.x: a screen that shows colours calls `orderColours()`/`setColours()` with the order's status, progress, plan (extras included) and records, and sends them through `wireColours()`.
- A set's Number and Price have `orders`, an order's have `difference`; `ColourLabels` takes both.

## 3.9 Buying on a phone (17.10.2026, pull request #79)

**Built**
- `PurchaseFormView` at phone width (below `sm`): one step per block (one order, or one group row with its orders), Previous/Next and "{current} of {total}" in `[data-step-bar]`, Save only on the last step, the visit under the last block. Desktop: every block at once, the visit in the left column; the Head's owner select now sits above the form at every width.
- `firstStepWithError()` (`src/features/purchasing/components/purchase-steps.ts`): after a refused save, the first step with an error, line errors mapped through `sent`.
- "Take photo" and "Choose file" stacked full width, 48 px, at phone width; the camera input carries `data-receipt-camera`.
- Texts `purchase.form.step`, `next`, `previous`, `steps`.

**Left out, and the task that brings it**
- The Manager home's Record purchase button: 6.1. The issue form's phone layout and "Give straight to requester": 5.4.

**What the next sessions must know**
- For 5.4: the issue form's phone layout can follow this one: steps hidden by `max-sm:hidden` (never unmounted), a `data-step` per block, the heading `data-step-heading` with `tabIndex={-1}`, and `firstStepWithError()` for refusals.
- An e2e test at 375 px that records a trip of several products walks the steps with `[data-step-bar]` buttons; the Next.js dev tools button is also named "Next", so scope the locator.
- Playwright tests the camera input through `page.waitForEvent("filechooser")` after a click on "Take photo".

## 3.10 Price prompt for the Head (17.10.2026, pull request #80)

**Built**
- `pricePrompt()`, `recentPurchaseSince()` and the numbers (3, 2, 90 days, 20%) in `src/domain/prices.ts`; the test and percent are `priceHintPercent()`.
- `recentPurchasePrices()`/`promptsOf()` and `noticePriceDiffers()` in `src/features/purchasing/price-prompts.ts`; `getPricePrompts()` (catalog.manage) in `src/features/catalog/queries/price-prompts.ts`.
- PRICE_DIFFERS `{ count, branch }` from the notify step of `recordPurchase`, `cancelPurchase` and `cancelTrip`, when the action makes a prompt appear.
- The Price prompts section on `/prices`; "Set {average}" runs `addPriceAction` with a note from `prices.prompt.note`.

**Left out, and the task that brings it**
- The prompts on the Head's home: 6.1.

**What the next sessions must know**
- For 6.1: the Head home reads `getPricePrompts()`; do not count prompts a second way.
- For 5.x and any action that writes or cancels a purchase record: call `noticePriceDiffers(context, actionId, change)` from its notify step; it reads the action's records from `order_events.payload.purchase.id`.
- `tests/helpers/purchases.ts` `insertTrip()` takes a trip date as its fourth argument.

## 4.1 Money schema and domain (17.10.2026, pull request #81)

**Built**
- Migration `0028_money`: `money_actions` (cancel-only trigger), `money_rows` (append-only; `money_rows_one_manager`; one row per order), `order_settlements` (pair CHECKs), the enum `money_row_kind`. Schema in `src/server/db/schema/money.ts`.
- `src/domain/money-ledger.ts`: `orderCashCount()`, `cashSpent()`, `managerCashBalance()`, `isExactMatch()`, `plannedCash()`, `approvalCashRows()`, `settlementRows()`, `crossingRefusal()`, `settlementNet()`. `src/domain/overspend.ts`: `overspend()`.
- `tests/helpers/money.ts`: `insertMoneyAction()`, `insertMoneyRow()`.

**Left out, and the task that brings it**
- Every writer: 4.2, 4.3, 4.5 to 4.8. The money-with-managers page: 4.9.

**What the next sessions must know**
- For 4.2, 4.3, 4.5: read records as `CashRecord` (trip payment type, each extra's own type) and money rows with their action's `is_cancelled`; never count cash a second way.
- For 4.2, 4.3, 4.5: `money_actions` has no `branch_id` and nothing keeps one action's rows in one branch: refuse the whole action when any row's order is outside the caller's branches, and refuse a row on an order before Open (no database guard; a Draft must never reach a money list). Every read of actions joins `money_rows`→`orders` and filters by branch in the SQL (permission review of 4.1).
- For 4.3: add the `FILE_OWNERS` owner of `money_actions.file_id` with its database test; its target must cover the branches of the action's rows (permission review of 4.1, Must fix 1).
- For 4.3: the cancel of an action loads every row's order and refuses when any is outside the caller's branches or Closed.
- For 4.4: exact match is `isExactMatch()` with the count from `orderCashCount()`.
- For 4.5, 4.6, 4.7: the confirmations are Finance's (own branches) and the acknowledgment the Head's; authorise each column group with its own permission.
- For 4.9 and 6.x: `managerCashBalance()` sums the orders it is given; pass only orders of the viewer's branches.

## 4.2 Finance approval with cash (17.10.2026, pull request #82)

**Built**
- `approveOrders` takes `cash` (order id → whole so'm as digits); `checkCash()` (only at Finance's step, `money.record` per order, one branch per Manager: `errors.field.cashOneBranch`) in `beforeMove`; `giveCash()` in `afterMove` writes one `money_actions` per Manager (the approval's client key, `order_action_id`, today in Tashkent, no comment) and its `CASH_GIVEN` rows; rows of 0 write nothing.
- `runOrdersAction` writes `order_actions` before `write`; `write`, `beforeMove` and `afterMove` get `OrdersWriteContext` with `actionId`.
- Domain: `plannedCashOf()`, `actionTotal()`, `approvalCashRows({ id, ownerId, amount })` (drops 0), `totalsByPaymentType()` (used by `ordersTotals()`).
- `CASH_GIVEN` notice (`actor`, `count`, `branch`, `amount`) replaces `REQUEST_FINANCE_APPROVED` for an owner given cash; `MONEY_PARAMS` formats money params on `/notifications`.
- The Finance dialog: per-type totals, the table "Cash given to the Manager now" per Manager, the result line with the cash. `tickedSummary().orders` and the order page carry `plannedTotal` and the owner.

**Left out, and the task that brings it**
- The Money tab, other money actions and their cancel: 4.3. Settlement: 4.5.

**What the next sessions must know**
- For 4.3 and 4.5: write money with `context.actionId` of the orders wrapper as `order_action_id` (settlement); the total of an action is `actionTotal()`.
- For 4.3: an approval's cash action never spans two branches (decided item 5), so the cancel's branch check holds for it.
- For 4.3, 4.5: a new money notice adds its money params to `MONEY_PARAMS` of `src/domain/notifications.ts`.
- The test environment has no DOM: a dialog's interactions are tested in Playwright (`approvals.spec.ts`).
- `notifications.spec.ts` can fail at 1440 px when run beside `send-back.spec.ts`: every Head is told of a send-back, so its Head's bell shows 2. Seen once in this build; passes alone.

## 4.3 Money tab and money actions (17.10.2026, pull request #83)

**Built**
- Migration `0029_money_actions`: `RECORD_MONEY`, `CANCEL_MONEY` in `order_action_type` and `order_event_type`.
- Domain (`money-ledger.ts`): `moneyRecordAllows()` (Open, Waiting for settlement), `moneyCancelAllows()`, `moneyPrefill()`.
- `recordMoney` and `cancelMoney` (`src/features/money/actions/`), orders wrapper, `money.record`; page exports `recordMoneyAction`, `cancelMoneyAction`, `moneyPrefillAction`.
- `getOrderMoney()` and `moneyPrefillOrders()` (`src/features/money/queries/`), each with its own branch and draft wall; `moneyRowsOf()` (`src/features/money/money-rows.ts`) and `cashRecordsOf()` (`order-records.ts`) feed `orderCashCount()`.
- The Money tab (`?tab=money`), Record money on the list bar and the order page bar, Cancel per action; `MONEY_FILES` owner; `CASH_RETURNED`, `CASH_PAID_BACK` notices; `CASH_GIVEN` has `via` (`PARAM_DEFAULTS` reads a stored one without it as the approval's).
- `Failures` of the orders wrapper keeps the `fields` a check or inspect gives with a code.

**Left out, and the task that brings it**
- Settlement action with mixed rows and the net, confirmations: 4.5. The Head's reopen before a cancel: 4.8.

**What the next sessions must know**
- For 4.5: count an order with `orderCashCount(moneyRowsOf(), cashRecordsOf())`; prefill with `moneyPrefill()`/`settlementRows()`; a crossing check reads the counts under the orders' lock in the write step and throws `OrdersRefusal("not_ready")` with `fields.amount` (`errors.field.aboveCount`/`aboveOwed`), as `recordMoney` does.
- For 4.5, 4.6: a check or inspect step may return `fields` with an order's code now; the screen shows them through `moveFailureLines()` and the field key.
- For 4.8: a cancel on an action with a Closed order answers `wrong_status` with `fields.status = errors.field.closedReopenFirst`; after the reopen the same cancel passes.
- For 4.9, 6.x: the Money tab's count is `getOrderMoney().count`; do not count again.


## 4.4 Close on an exact match (17.10.2026, pull request #84)

**Built**
- The orders wrapper's optional `facts` step (`src/server/order-action.ts`): facts other tables hold, read under the lock on the orders behind no wall, before the status check; `LockedOrder.exactMatch`, which `orderState()` reads (false without the step).
- `exactMatchOf()` (`src/features/orders/exact-match.ts`): `isExactMatch()` with `orderCashCount()` for any number of orders in four statements; read by Close's `facts`, `tickedSummary()` (with `exactCount`) and `getOrderPage()`.
- `closeExactOrders` (`CLOSE_EXACT`, sets `closed_at`, `REQUEST_CLOSED` to owners, active Heads and the branch's active Finance) and `sendToSettlementOrders` (`SEND_TO_SETTLEMENT`, `REQUEST_SENT_TO_SETTLEMENT` to the branch's active Finance); page exports `closeExactOrdersAction`, `sendToSettlementOrdersAction`; `financeOf()` in `notices.ts`.
- Both buttons through `MoveButton` on the list bar and the order page; Close's dialog carries 08 Closing 1's sentence (`orders.moves.closeConfirm`); the bar's line "N of M match exactly" (`orders.list.bar.exact`).

**Left out, and the task that brings it**
- The Finance settlement screen and Send back for correction: 4.5. Finance's Close and readiness: 4.6. Overspend: 4.7. Reopen (and whether it clears `closed_at`): 4.8.

**What the next sessions must know**
- For 4.5: Send to settlement exists (action, buttons, the Finance notice); build the Finance screen and Send back only.
- For 4.6: Finance's `CLOSE` needs `ready_to_close`; fill it with a `facts` step as Close fills `exactMatch` (never an `inspect` beside the machine), and set `closed_at` as `closeExactOrders` does.
- For 4.6, 4.8: the notice of "Closed, reopened" goes to owners, active Heads and the branch's active Finance (`noticePerBranch` with `ownersAndHeads` and `financeOf`).
- Tests that read notices filter by the branch code in `params` and the scene's users: every active Head of the test database is told of a Close.

## 4.5 Settlement screen (17.10.2026, pull request #85)

**Built**
- Migration `0030_settlement`: `SETTLE_CASH`, `CONFIRM_SETTLEMENT` (order actions and events), `CASH_SETTLED`, `REQUEST_SENT_BACK_FOR_CORRECTION` (notices).
- Domain (`money-ledger.ts`): `paidBy()` (`cashSpent()` is its Cash case), `settlementBlocks()`, `transferNeedsNote()`, `blockConfirmed()`, `settlementAllows()`, `settlementCashRows()`.
- `settleCash`, `confirmSettlement` (`src/features/money/actions/`), `sendBackForCorrectionOrders` (`src/features/orders/actions/`); page exports `settleCashAction`, `confirmSettlementAction`, `sendBackForCorrectionOrdersAction`.
- `getSettlement()` and `settlementFactsOf()`; `/orders/settle?ids=` (`SettlementView`); `canSettle` on `tickedSummary()` and `getOrderPage()`; Settle and Send back for correction on both bars; `NoReceiptLabel`; anchors `#purchase-<id>` on the Purchases tab; Record money takes a preset `kind` and `label`.

**Left out, and the task that brings it**
- Finance's Close and readiness: 4.6. Overspend and the acknowledgment: 4.7. Reopen: 4.8. Finance's home list of settlements: 6.x.

**What the next sessions must know**
- For 4.6: readiness reads `blockConfirmed()` for the transfer and card blocks and a Cash count of 0 from `settlementFactsOf()` under the lock (a `facts` step, as 4.4's `exactMatch`); add Close to the settlement screen and the list bar.
- For 4.7: Send back for correction already clears `overspend_ack_*` with the confirmations and names it in history (`payload.settlementCleared`).
- For 4.8: the reopen clears the same columns; copy the update of `send-back-for-correction.ts`.
- `settleCash` refuses rows of two branches in one call (`moneyOneBranch`); the screen takes one branch.
- A checkbox of the screen is controlled by the server's answer: Playwright clicks it and waits for `toBeChecked()`, never `check()`.
- `order-page.spec.ts` and `settlement.spec.ts` share the page users and set them to English; a spec that shares them reads English or no label.

## 4.6 Finance closes (17.10.2026, pull request #86)

**Built**
- `readyToClose()` (`src/domain/money-ledger.ts`): cash count 0, every used transfer and card block `blockConfirmed()`, and the Head's acknowledgment when `overspend().needsHead`; `SettlementConfirmations.overspendAcknowledged`.
- `closeOrders` (`CLOSE`, `src/features/orders/actions/close.ts`): a `facts` step reads `settlementFactsOf()` (now with `records`) and `readSettings()` under the lock; sets `closed_at`; `REQUEST_CLOSED` to owners, active Heads and the branch's active Finance. Page export `closeOrdersAction`.
- `LockedOrder.readyToClose`, read by `orderState()` (false when unread).
- Close through `MoveButton` on the settlement screen (every order shown), the list bar and the order page; `orders.moves.notReady.CLOSE` names what readiness needs.

**Left out, and the task that brings it**
- The Head's "Acknowledge overspend", its notices and S12 through the button: 4.7. Reopen: 4.8.

**What the next sessions must know**
- For 4.7: readiness already reads `overspend_ack_at`; build only the acknowledgment action, its notices and S12 (see the From 4.6 line). `close.db.test.ts` shows how to set the guard amount (upsert of the `settings` row) and restore it.
- For 4.8: a reopened order is Open again and needs a new Close by Finance; clearing the acknowledgment makes an overspent order wait for the Head again.
- A purchase line whose price or extra differs from the plan needs a comment (07): the test helper `buy()` of `close.db.test.ts` adds one.

## 4.7 Overspend guard (17.10.2026, pull request #87)

**Built**
- Migration `0031_overspend_ack`: `ACKNOWLEDGE_OVERSPEND` (order actions and events).
- Domain (`money-ledger.ts`): `orderOverspend()` and `overspendNeedsAck()`; `readyToClose()` calls the latter.
- `acknowledgeOverspend` (`src/features/money/actions/`): Head, Waiting for settlement, above the guard and not acknowledged, one comment (5 to 500) for all ticked orders, all or nothing; writes `overspend_ack_*`; `OVERSPEND_ACKNOWLEDGED` to the branch's active Finance. Page export `acknowledgeOverspendAction`.
- `sendToSettlementOrders` also sends `OVERSPEND_ABOVE_GUARD` to the active Heads, counting only the orders above the guard.
- `canAcknowledgeOverspend` on `tickedSummary()` and `getOrderPage()`; the button through `MoveButton` (kind `ACKNOWLEDGE_OVERSPEND`, label "Comment") on the list bar and the order page; `overspend` per order on `getSettlement()` and its line on the settlement screen.

**Left out, and the task that brings it**
- The Head's home list "overspends to acknowledge": Phase 6. Reopen, which clears the acknowledgment: 4.8.

**What the next sessions must know**
- For 4.8: Reopen clears `overspend_ack_*` with the confirmations (copy the update of `send-back-for-correction.ts`); the acknowledge test's "Send back for correction clears" case shows how to prove the Head is needed again.
- A guard settings change sends no notice (decided item 5, Look first, waits for the owner on issue #9).
- `acknowledge-overspend.db.test.ts` has `withGuard()`, which sets and restores both guard settings.
- `overspend.spec.ts` signs in the shared `e2e_head` and finds labels in any language, leaving his locale alone.

## 4.8 Reopen (17.10.2026, pull request #88)

**Built**
- `reopenOrders` (`REOPEN`, `src/features/orders/actions/reopen.ts`): the Head reopens ticked Closed orders with one reason, all or nothing; status Open, progress kept, `closed_at` cleared, `order_settlements` confirmations, note and acknowledgment cleared (event payload `settlementCleared`); `REQUEST_REOPENED` to owners, active Heads and the branch's active Finance. Page export `reopenOrdersAction`.
- The Reopen button through `MoveButton` on the list bar and the order page (`LIST_MOVES`, `PAGE_MOVES`), with a reason.

**Left out, and the task that brings it**
- Faulty goods returned after closing (a write-off "Returned to supplier"): Phase 5. Home lists of reopened orders: Phase 6.

**What the next sessions must know**
- A reopened order goes through the Open rows again: a cancel of a record or a money action, then Send to settlement or Close (exact match), then Finance's Close. `reopen.db.test.ts` walks the whole path with real actions and `withGuard()`.
- Purchases recorded on another payment type or without the planned extra need a comment (07): the test helper `buy()` of `reopen.db.test.ts` always sends one.
- `describeTickedWall` needs `owned`; a Head-only move uses `owned: false`.

## 4.9 Money with managers (17.10.2026, pull request #89)

**Built**
- Permission `money.managers` (Head all, Finance own; not a row of 03, Look first).
- Domain (`money-ledger.ts`): `cashSince()` (an order's first live cash movement) and `managerBalances()` (groups by owner, sums through `managerCashBalance()`, drops count 0, oldest first).
- `datedMoneyRowsOf()` and `datedCashRecordsOf()` beside `moneyRowsOf()`/`cashRecordsOf()`, which now map from them (one SQL each).
- `getMoneyWithManagers(userId, branchId)` (`src/features/money/queries/`): branch wall in SQL, a chosen branch authorized first; `/money` (`MoneyWithManagers`), one block per owner with Holds, Owed, Since, opening to its orders.
- Seed: two Open CHL orders of `seed_manager` with cash given 3 and 12 days back, one Closed (cash returned, Not bought, settled, closed by Finance); `daysAgo`, `cash`, `money`, `finish` on seed moves.

**Left out, and the task that brings it**
- Finance's and the Head's home lists of money with managers, the Cash analytics by age, the report: Phase 6 and 7.

**What the next sessions must know**
- For 4.10: a Manager's balance per branch is `getMoneyWithManagers()`; the move's "cash count is 0" check is `orderCashCount()` per order, not this page.
- For 6.x: the home list and the age buckets read `getMoneyWithManagers()` and `cashSince()`; do not date money a second way.
- `tests/seed.db.test.ts` checks every seeded status move with `checkMoves()`; a new seeded move needs an actor and facts that allow it.
- `insertMoneyAction()` of `tests/helpers/money.ts` takes `occurredOn`.

## 4.10 Move orders to another Manager (17.10.2026, pull request #90)

**Built**
- Migration `0032_move_owner`: `MOVE_OWNER` (order actions and events). Permission `request.move_owner` (Head only).
- Domain: `ownerMoveAllows()` (`order-moves.ts`): Waiting for Head to Waiting for settlement, Sent back included; no Draft, Closed, Rejected, Cancelled.
- `moveOrdersToManager` (`src/features/orders/actions/move-owner.ts`): the Head, ticked orders, all or nothing; the chosen user an active Manager of every order's branch, each order's `orderCashCount()` exactly 0 and another owner; writes `owner_id`, event payload `{ owner: { from, to } }`. Page exports `moveOrdersToManagerAction`, `moveOwnerChoicesAction`.
- `moveOwnerChoices()` (queries): the active Managers of every ticked order's branch. `tickedSummary().canMoveOwner`; `MoveOwnerButton` on the list bar; the history line "From A to B".
- `movedSince()` (`src/features/orders/moved-since.ts`): Cancel money and the cash purchase/trip cancels are refused (`errors.field.movedSince`) after a move of one of their orders (Look first, spec change proposed).

**Left out, and the task that brings it**
- Analytics "by Manager" of a moved order: Phase 7. A warning on deactivating a user who still owns orders: not planned.

**What the next sessions must know**
- An owner change is only this action; a cancel of anything that changes a cash count asks `movedSince()` first.
- `cashRecordsByIds()` beside `datedCashRecordsOf()` reads one record's cash effect; use it, not a second SQL.
- Tests that write after a move advance the clock: `movedSince()` counts a write at the same moment as before the move.

## 5.1 Stock documents schema (17.10.2026, pull request #91)

**Built**
- Migration `0033_stock_documents`: `stock_documents` (enums type, status, reason; number and client_key unique; CHECKs of number prefix, transfer branch, department, reason by type, decided pair, `reversed_*` iff REVERSED; department of its branch by composite key), `stock_document_lines` (one per subtype), `stock_movements` key (`document_line_id`, `variant_id`) and a unique `reverses_movement_id`.
- Domain `stock-documents.ts`: `documentNumber()` (prefix + `orderNumber()`), `lineMovement()`, `reversalOf()` (opposite quantity at its own cost), `REVERSIBLE_STATUSES`.
- `takeNumbers()` (`src/server/number-counters.ts`), the one writer of `number_counters`; submit's `numbersOf()` calls it.
- `src/server/stock-documents.ts`: `createDocument()`, `lockDocument()`, `postLines()` (locks, reads type and branch, posts once), `reverseDocument()`.

**Left out, and the task that brings it**
- Every form, action and permission: 5.4, 5.6, 5.7, 5.8, 5.11, 7.x. The movement of a count line and of a transfer's receipt: 7.4, 7.2 (they add a case to `lineMovement()`).
- A database link between a movement's branch and its document's branches: not planned; the helpers set it from the locked document.

**What the next sessions must know**
- For 5.4 to 7.4: the who-may-do-what of each type is the header of `stock-documents.ts`; a reverse action calls `lockDocument()`, authorizes on its row ("Not found" for another branch), then `reverseDocument()` in the same transaction.
- For 5.11 and 7.4: approval sets status POSTED with `decided_by`/`decided_at` first, then `postLines()`; a second post is `wrong_status`.
- For 5.4 and 7.2: a document made inside another action still needs a `client_key` (NOT NULL UNIQUE); derive it from that action.
- Numbers use the Tashkent year of the creating moment, not `doc_date`.
- A test that reverses a movement twice now hits `stock_movements_reverses_movement_id_key`.

## 5.2 Stock on hand (17.10.2026, pull request #92)

**Built**
- `stockValue(qty, avgCost)` and `STOCK_PAGE_SIZE` in `src/domain/stock.ts`.
- `listStockOnHand()` and `stockCategoryChoices()` (`src/features/warehouse/queries/stock-on-hand.ts`): `data.view`, `branchFilter` in the SQL, services left out, count and rows in one `readSnapshot()`.
- `/warehouse/stock` with `loading.tsx`; texts under `warehouse.stock`. S7's stock part in `tests/e2e/branch-wall.spec.ts`.

**Left out, and the task that brings it**
- Minimum column, "Low" and "Low stock only": 5.10. Row link to the item card: 5.3. Stock report and its downloads: 6.x.

**What the next sessions must know**
- For 5.3: link each row of `/warehouse/stock` to the card; the card's address of another branch is the "Not found" page of S7's stock part.
- For 5.10: add the minimum to `StockRow` and the switch to the page's GET form; rows at 0 are already listed.
- For 6.x: a stock row's value is `stockValue()`; never multiply in SQL.
- `quantity` comes back as stored ("2.500"); `format.quantity` drops the zeros.

## 5.3 Item card (18.10.2026, pull request #93)

**Built**
- `getItemCard()` (`src/features/warehouse/queries/item-card.ts`): `data.view` on the asked branch ("Not found" for another), the header, count and one page of movements newest first by `seq` in one `readSnapshot()`; the running balance is the stored `balance_after`; a purchase's order behind the draft wall in the SQL (the row stays, without the number).
- `/warehouse/items/[id]?branch=` with `loading.tsx`; texts under `warehouse.item` (a label per movement type); Stock on hand's product names link to it. `ITEM_CARD_PAGE_SIZE` (50) in `src/domain/stock.ts`.

**Left out, and the task that brings it**
- The document number as a link: 5.12 (its "From 5.3" line). The minimum on the card: 5.10.

**What the next sessions must know**
- For 5.4 to 7.4: a document's movement shows its number on the card through `stock_movements.document_line_id`; a movement without line or purchase shows "—".
- For 5.8: the "Direct entry" label exists (`warehouse.item.types.DIRECT_ENTRY`); S15 reads it from the card.
- For 5.10: the minimum goes into the card's header beside "On hand".
- For 5.12: link the card's document number (`item-card.ts` already returns `documentNumber`; add the id).
- An e2e that needs a receipt writes the purchase, the movement and the balance straight into the tables (`tests/e2e/item-card.spec.ts`).

## 5.4 Issue to a department and the issue note PDF (18.10.2026, pull request #94)

**Built**
- `issueStock` (`src/features/warehouse/actions/issue.ts`): `stock.issue` on the input's branch; branch active, date up to today, department active of the branch, active goods subtypes (products then subtypes FOR SHARE in id order), then `createDocument()` POSTED. A short line: `invalid_input`, `lines.<i>.qty: errors.field.stockShort` and `available` (new optional part of `ActionFailure`, `ActionError`'s third argument `stockLeft`).
- "Give straight to requester": `giveToRequester` per line of `recordPurchase`; goods only, `stock.issue` too; one ISSUE per ticked record after the receipts, `client_key` = the record's id, receiver = requester name, else the department's responsible person; event payload `issue: { documentId, number }`, shown on the History tab with the note's link.
- Queries `issueBranchChoices`, `issueFormChoices`, `searchIssueItems` (issue-form.ts), `getIssueNote` (issue-note.ts). `/warehouse/documents/new?type=ISSUE` (three phone steps), `GET /warehouse/documents/[id]/note` (A4 portrait PDF). "New issue" on Stock on hand.
- `src/server/pdf.tsx`: fonts, logo, colours, `Letterhead`, shared by both PDFs. `BranchSelect` asks first while a form has unsaved changes.

**Left out, and the task that brings it**
- Reverse of an issue: 5.7. Return: 5.6. Documents list and the card's number as a link: 5.12. Manager home's "Issue from stock": 6.1.

**What the next sessions must know**
- For 5.6, 5.8, 5.11 and 7.2: copy `issue.ts`'s shape (create, `repeat` on `stock_documents.client_key`, refusals before `createDocument()`, `StockShortError` turned into the line's field with `stockLeft`).
- For 5.6 to 7.2: `/warehouse/documents/new` answers only `type=ISSUE`; add each type there. The note route reads ISSUE only; a transfer note (7.2) reuses `src/server/pdf.tsx`.
- For 5.7: the note already prints "Reversed" for a REVERSED issue.
- For 5.10: an issue is where "Item reached its minimum stock" will be sent.
- The texts say "department", never "requester" (`tests/notification-texts.test.ts` refuses "request").

## 5.6 Return from a department (18.10.2026, pull request #95)

**Built**
- `returnStock` (`src/features/warehouse/actions/return.ts`): `stock.return_reverse` on the input's branch; the issue's shape, with the department FOR UPDATE; an over-return without a comment is `invalid_input` with `lines.<i>.qty: errors.field.overReturn` (+ `available` = received) and `comment: errors.field.overReturnComment`.
- `departmentReceived()` and `departmentIssueCost()` (`src/server/department-received.ts`): the one reader of a department's net received amount and its newest unreversed issue cost.
- `StockMovement.emptyCost` (`src/domain/stock.ts`): a RETURN into a stock of 0 comes in at it; a RETURN line's `unit_cost` holds it. `overReturn()`, `departmentHolds()`, `DOCUMENT_LINES_MAX` in `src/domain/stock-documents.ts`.
- Queries `returnBranchChoices`, `returnFormChoices`, `searchReturnItems` (return-form.ts); `/warehouse/documents/new?type=RETURN`; "New return" on Stock on hand. `document-steps.ts` (was issue-steps) and `tests/helpers/held-while.ts` are shared.

**Left out, and the task that brings it**
- Reverse of a return: 5.7. Documents list: 5.12. A return note: not in the spec.

**What the next sessions must know**
- For 5.7: a reverse of an ISSUE or a RETURN takes the department FOR SHARE before `lockDocument()`, so a return's received count cannot miss an issue being reversed (plan of 5.6, decided item 3).
- For 5.7: reversing a return writes its REVERSAL on the return's line; `departmentReceived()` then nets it to 0 with no status filter.
- For 6.x: a RETURN line's `unit_cost` is the empty-stock cost, not what it entered at; read the movement's `unit_cost`.
- For 5.8, 5.11 and 7.2: `/warehouse/documents/new` reads `type=ISSUE|RETURN` through `BRANCHES` in its page; add each type there.
- A textarea inside `Field` needs `useFieldControl()` for its label (`CommentBox` in return-form.tsx); the issue form's comment is not tied to its label yet.

## 5.7 Reverse a document (18.10.2026, pull request #96)

**Built**
- `reverseStockDocument` (`src/features/warehouse/actions/reverse.ts`): `stock.return_reverse` on the document's branch, department FOR SHARE then `lockDocument()`, `reverseAllows()` (creator or Head; ISSUE and RETURN only) else `forbidden`, POSTED else `wrong_status`, reason 5 to 500, then `reverseDocument()`. Short stock: `invalid_input` on `lines.<lineId>.qty` with `errors.field.reverseStockShort` and `available`.
- `reverseAllows()` in `src/domain/stock-documents.ts`; `getReversePreview()` (`queries/reverse-preview.ts`): number, department, lines, `held` on an issue line over what the department holds.
- Item card: `documentId`, `documentStatus`, `canReverse` per movement; `ReversedLabel` (`src/components/status-label.tsx`); `ReverseDocumentButton`; page actions in `src/app/(app)/warehouse/items/[id]/actions.ts`.
- `tests/helpers/stock-documents.ts`: `receive()` and `postDocument()` for warehouse scenes.

**Left out, and the task that brings it**
- Reverse of a direct entry, a write-off, a transfer, a count: 5.8, 5.11, 7.2, 7.4. The button on the document's own address: 5.12.

**What the next sessions must know**
- For 5.8, 5.11, 7.2 and 7.4: add your type to `reverseAllows()` (the Head only, question 19) with a test; the action, the preview and the card's button follow. 7.2 checks `reverseDocument()` for a transfer's two branches first.
- For 5.12: put `ReverseDocumentButton` on the document's address; it needs only `documentId` and `number`, and `canReverse` as the card computes it.
- Reversing an issue more than the department holds is allowed (review of the plan, correction 1); `departmentReceived()` can then go below 0.
- "Bekor qilish" is Uzbek for Cancel: never use it for another button in the same dialog.

## 5.8 Direct entry by the Head (18.10.2026, pull request #97)

**Built**
- `enterStockDirectly` (`src/features/warehouse/actions/direct-entry.ts`): `stock.enter_direct` (the Head, any active branch); the return's shape without a department; reason EXISTING_STOCK|GIFT|OTHER, "Other" needs a comment (`directEntryCommentRefusal()`); each line's cost typed as whole so'm, 0 or more; ENT number, DIRECT_ENTRY movements at the line's cost; audit row `direct_entry.create`.
- Queries `directEntryBranchChoices`, `searchDirectEntryItems` (stock and reference price per subtype); `/warehouse/documents/new?type=DIRECT_ENTRY`; "Direct entry" on Stock on hand for the Head.
- `reverseAllows()`: DIRECT_ENTRY for the Head only; the reverse action writes `direct_entry.reverse` for it.

**Left out, and the task that brings it**
- Direct entry from Excel: 5.9. The stock value report's own line for direct entries: 6.x. The document's own page: 5.12.

**What the next sessions must know**
- For 5.9: call `enterStockDirectly`'s checks (or the action itself per document) so the file follows the same rules; the cost is a typed text read by `parseSomOrZero()`, an empty one is `required`.
- For 5.11, 7.2 and 7.4: a Head-only type in `reverseAllows()` is one line like DIRECT_ENTRY; test the item card's `canReverse` and `getReversePreview` too (permission review of 5.8).
- For 5.12: the seed's direct entry can call `enterStockDirectly` as the Head.

## 5.9 Direct entry from Excel (18.10.2026, pull request #98)

**Built**
- Import kind `stock` on the 1.10 framework: `/catalog/import/stock` with a branch picker, its template (product, subtype, quantity, cost), the same preview and all-or-nothing save; "Import from Excel" on Stock on hand for the Head.
- `importStock` (`src/features/warehouse/actions/import-stock.ts`): `stock.enter_direct` on the chosen branch; `checkStockImport()` (`features/warehouse/imports/check.ts`) finds and locks products, then subtypes, FOR SHARE in id order; documents of up to 100 lines in subtype-id order, EXISTING_STOCK, today; `direct_entry.create` per document.
- Migration `0034_import_stock`: `STOCK` in `import_kind`, `catalog_imports.branch_id` (STOCK only), `stock_documents.import_id` (DIRECT_ENTRY only), each with its index.
- `readStockRows()`, `cellQuantity()`, `cellCost()` (domain imports); `directEntryLineRefusal()` (domain stock-documents), shared by the form and the import; `lockDirectEntryBranch()`, `recordDirectEntry()` exported from `direct-entry.ts`; `authorizeImportKind()` (`features/catalog/imports/permission.ts`) for the page of any kind; the template route asks `authorize()`/`authorizeList()` itself (permission registry).

**Left out, and the task that brings it**
- Other reasons, dates and comments for an imported entry: the form of 5.8. The documents list and a document's page: 5.12. The stock value report's line for direct entries: 6.x.

**What the next sessions must know**
- For 5.12: a direct entry made by an import has `import_id`; the list can show it, and the seed may import through `importStock`.
- A branch-scoped import kind passes `branchId` in the form; `upload()` of the page actions authorizes it before reading the file, and `previewImport()` takes it as its fourth argument.
- A new enum value used in a CHECK of the same migration is compared as text (`kind::text = 'X'`): pending migrations apply in one transaction.

## 5.10 Minimum stock and low stock (18.10.2026, pull request #99)

**Built**
- `stock_minimums` (migration `0035_stock_minimums`): `min_qty` > 0 or null (none), `low_notified_at`; `isLow()`, `minimumStep()` in `src/domain/stock.ts`.
- `checkMinimum()` (`src/server/stock-minimums.ts`), called by `postMovement()` after its balance update: sends MINIMUM_STOCK_REACHED to the branch's active Managers once until restocked; `holdBalance()` exported from `stock-ledger.ts`.
- `setStockMinimum` (`features/warehouse/actions/minimum.ts`, `stock.set_minimums`), audit `stock_minimum.set`; `MINIMUM_USES` in `product-uses.ts`.
- Stock on hand: Minimum column with its pencil, `LowLabel`, "Low stock only" (`low=1`), "Add to draft"; the item card's header the same. `MinimumButton`, `AddToDraftButton` (reuses `createDraftAction`, `listDraftChoicesAction`).

**Left out, and the task that brings it**
- The Manager's home list of low items: 6.1. The low-stock report and stock planning: 6.x.

**What the next sessions must know**
- For 5.11, 7.2 and 7.4: nothing to add for the notice; every movement through `postMovement()` checks the minimum.
- For 6.1: a Low item is `stock_minimums.min_qty is not null and stock_balances.qty <= min_qty`; read `minimum` and `low` from `listStockOnHand()` or keep the same SQL beside `isLow()`.
- For 6.x: the minimum lives in `stock_minimums`; null is none, never 0.
- A notice about an item's state is sent with `notify({ tx, userId: null })`, so the actor is told too.
- Confirm dialogs are `role="alertdialog"` in Playwright.

## 5.11 Write-off (18.10.2026, pull request #100)

**Built**
- `askWriteOff` (`features/warehouse/actions/write-off.ts`, `stock.ask_write_off`): the issue's shape; reason of WRITE_OFF_REASONS, comment required (`writeOffCommentRefusal()`), quantity not above the stock; a Manager's is PENDING_APPROVAL and tells every active Head (STOCK_CHANGE_ASKED); the Head's is POSTED at once with `decided_by`.
- `decideWriteOff` (`write-off-decision.ts`, `stock.approve_write_off`): `lockDocument()`, `writeOffDecisionMove()` (domain), status and `decided_*`, then `postLines()` by the Head; short stock refuses all on `lines.<lineId>.qty`; STOCK_CHANGE_DECIDED to the asker.
- `getWriteOff` (`queries/write-off.ts`); `/warehouse/documents/[id]` for write-offs, with Approve and Refuse; `/warehouse/documents/new?type=WRITE_OFF` (`WriteOffForm`); "Write-off" on Stock on hand; `WriteOffStatusLabel`.
- `reverseAllows()`: WRITE_OFF for the Head only; the reverse dialog's sentence for it.

**Left out, and the task that brings it**
- The Head's home list of write-offs to approve: 6.2. The documents list and the page for the other types: 5.12. "Lost in transfer" from a short transfer: 7.2. Corrections: 7.4.

**What the next sessions must know**
- For 7.2: a shortage is `createDocument()` WRITE_OFF, PENDING_APPROVAL, reason LOST_IN_TRANSFER, on the sending branch, with a client key from the receipt; send STOCK_CHANGE_ASKED as `askWriteOff`'s notify step does; `decideWriteOff` then decides it unchanged.
- For 7.4: add your kind to `StockChangeKind` and a word to both notices' `select`; reuse `writeOffDecisionMove()`'s shape for a count.
- For 5.12: `/warehouse/documents/[id]` answers WRITE_OFF only (`getWriteOff`); widen it, add Reverse there, and fix the reverse dialog's sentence for a direct entry (decisions 5.11, build).
- For 6.2: the waiting ones are `type = 'WRITE_OFF' and status = 'PENDING_APPROVAL'`.

## 5.12 Warehouse documents list and closing a branch (18.10.2026, pull request #101)

**Built**
- `/warehouse/documents` (`listStockDocuments`, `documentDepartmentChoices` in `features/warehouse/queries/documents.ts`, `data.view`): every type, newest first, filters type, from/to, department; `WarehouseTabs`, `NewDocumentButtons` shared with Stock on hand.
- `/warehouse/documents/[id]` for every type (`getStockDocument`, `queries/document.ts`): header by type, lines, Approve/Refuse, Reverse, issue note; `DocumentStatusLabel`. The item card's number links there.
- `setBranchActive` refuses a deactivation while the branch has unfinished orders (not a never-submitted draft) or stock above 0: fields `orders`, `stock`, counts in `available`; `FINISHED_REQUEST_STATUSES` in `domain/request-status.ts`.
- Seed: a direct entry and an issue of CHL (`scripts/seed-stock.mjs`); "From 5.12" lines on 7.1 to 7.4.

**Left out, and the task that brings it**
- Transfers in the list and `?type=TRANSFER`: 7.1; the receiving branch's view: 7.2; counts: 7.3, 7.4. Search for numbers: its own task.

**What the next sessions must know**
- For 7.1 and 7.2: `listStockDocuments()` and `getStockDocument()` filter by `branch_id` only; add `to_branch_id` for the receiver, and the type's fields to the page's header.
- For 7.3 and 7.4: the page shows `qty` only; a count's `counted_qty` needs its column; `canDecide` is write-off only.
- For 6.2: the Head's waiting write-offs open at `/warehouse/documents/[id]`.
- A seed table counted by the seed tests (the audit total) grows when the seed writes a new row kind.

## 6.1 Home: Manager and Principal (18.10.2026, pull request #102)

**Built**
- `/` for the Manager: New order (drafts grid), Record purchase (my Open orders), Issue from stock, "Suggest a product"; Sent back to me, My drafts, My open orders with progress, Ordered every stage, Cash I hold, Low stock, Orders due soon. For the Principal: waiting cards with Approve, Send back, Reject on the whole group row; the waiting total; orders by status; spending this month. Head and Finance keep the empty state.
- `getManagerHome()`, `getPrincipalHome()` (`features/home/queries/`), `branchSpending()` (`features/home/spending.ts`), one snapshot each; `listOrderGroups()` takes the caller's snapshot as a 4th argument; `orderTotalsOnFilter()`, `countOrdersByStatus()`; the list filter `due=soon` with its chip.
- Domain: `isDueSoon()`, `dueSoonUntil()`, `STILL_DUE_STATUSES` (order-steps), `businessMonth()`, `REQUESTED_STATUSES`/`requestedBySubtype()`, `receivedTogether()`, `mayInSomeBranch()`. `ListOrder` carries `ownerId`, `plannedTotal`, `progress`, `received`.

**Left out, and the task that brings it**
- The Head's and Finance's homes: 6.2. The price prompts on the Head's home (handed to 6.1 by 3.10): 6.2.

**What the next sessions must know**
- For 6.2: spending per branch reads `branchSpending(executor, actor, branch, month)`; status counts `countOrdersByStatus()`; waiting totals `orderTotalsOnFilter()`; read them with `listOrderGroups(…, db)` inside one `readSnapshot()`. The Head's price prompts read `getPricePrompts()` (progress 3.10).
- For 6.2: `HomeBlock` and `GroupLines` (`features/home/components/`) are the panels and group rows of a home list; `WaitingCards` is the Principal's; Finance's cards can reuse it with its own moves.
- A query exported from `features/*/queries/` must be in the registry with a matrix test; a reader meant for another query's snapshot takes an optional `executor` instead of being exported bare.
- A home section is labelled by its title: an e2e `getByLabel("Filial")` matched "Filialim …"; use `exact: true`.
- `documents.db.test.ts` froze the clock and tied two `created_at`; a test that orders by time moves the clock between the rows.

## 6.2 Home: Head and Finance (18.10.2026, pull request #103)

**Built**
- `/` for the Head: waiting for my approval by branch (lines and group rows), overspends to acknowledge, write-offs to approve, product suggestions, price prompts, orders stuck over `escalation_hours`, counts by status and spending this month per branch (inactive ones marked). For Finance: approvals and settlements, one entry per owner and branch with cash to give or the net to receive or pay, each linking to `/orders?status=…&owner=…&branch=…`; money with managers.
- `getHeadHome()`, `getFinanceHome()` (`features/home/queries/`); `ordersOnFilter()` (every order of a filter with its plan, `order-list.ts`); the list filter `stuck=1` with its chip; `OwnerEntries`.
- Domain: `STUCK_STATUSES`, `stuckBefore()` (`order-steps.ts`).
- Seed: two Settlement orders of CHL (Receive 60 000; a service bought for 250 000 against 100 000, Pay 150 000 and above the overspend guard), a pending write-off, a pending suggestion, the Waiting for Principal order three days old.

**Left out, and the task that brings it**
- Corrections in the write-off list: 7.4. Escalation notices: 8.1. Drill-down: 6.3 to 6.5.

**What the next sessions must know**
- For 8.1: "waiting more than N hours" is `stuckBefore(now(), hours)` over the newest event into the current status (`to_status = status and from_status <> to_status`), the statuses `STUCK_STATUSES`; the list's `stuck=1` SQL in `listWhere()` is the reading to share. Add `isStuck()` there.
- For 7.4: the Head's write-off list is the select in `getHeadHome()` (`type = 'WRITE_OFF'`); add COUNT there.
- `listWhere()` takes the setting the `stuck` filter needs; callers go through `whereOf()`, which reads it in their snapshot.
- The seed now holds purchases: a seed test that counts purchases, trips, money rows or audit rows counts these too (`purchase` move of `seed-orders.mjs`).

## 6.3 Analytics foundations (18.10.2026, pull request #104)

**Built**
- `analytics_spending` (migration 0036): one row per record not cancelled, its amount `actualTotal()` of the record; rewritten every 5 minutes by the job `analytics_refresh` (`src/server/jobs/analytics-refresh.ts`, `refreshAnalytics()`).
- Domain `src/domain/analytics.ts`: `periodOf()`, `periodBefore()`, `periodChoices()`, `monthsOf()`, `monthInside()`, `monthBefore()`, `changeAgainst()`.
- `features/analytics`: `period-params.ts` (Zod parser and `analyticsSearch()`), `spendingWhere()`, `resolvePeriod()`; queries `getAnalyticsFilters()`, `getSpending()`, `getSpendingRecords()`; `/analytics`, `/analytics/records`, `GET /analytics/download?block=months|categories|records`.
- `src/components/charts/`: `BarChartBlock`, `LineChartBlock`, `ChartPoint`.

**Left out, and the task that brings it**
- The role blocks: 6.4, 6.5, 6.6. The page PDF: 6.7. Payment type in the summary (each extra has its own): the task that splits by payment type.

**What the next sessions must know**
- For 6.4 to 6.6: a new summary table is filled in `refreshAnalytics()` (same transaction, amounts from `src/domain/`), read with a WHERE builder like `spendingWhere()` shared by the number, its drill-down and its export; extend `DrillKey` and `EXPORT_BLOCKS` in `period-params.ts`.
- For 6.4 to 6.6: every number carries `changeAgainst(now, before)`; write it with `changeText()`; each chart has its table under it (`ChartCard` in `spending-block.tsx`).
- For 6.7: the page's data is `getSpending()` with the parsed address; the sheets of `download/sheets.ts` already hold the heading lines.
- Tests: `tests/helpers/analytics.ts` (`spendingScene()`, `bought()`, `refreshNow()`); the summary holds every branch of the test file's database, so read your own branch. A browser test calls `refreshAnalytics()` itself (see `tests/e2e/analytics.spec.ts`).

## 6.4a Analytics: Head, Spending and Plan vs actual (18.10.2026, pull request #105)

**Built**
- 6.4 split into 6.4a, 6.4b, 6.4c in `docs/build-plan.md` (phase 6 now 12 tasks, total 103).
- Migration 0037: `analytics_spending_payments` (each record's parts by payment type, `paymentParts()`) and `analytics_outcomes` (each order whose buying ended Done or Done short, `orderOutcome()`), both rewritten by `refreshAnalytics()`.
- Domain: `paymentParts()` (purchases.ts), `orderOutcome()` (colours.ts), `shareOf()`, `shareChange()` (analytics.ts).
- Queries `getHeadSpending()`, `getPlanVsActual()`, `getOutcomeOrders()`; `outcomesWhere()`; the drill key `payment:<type>` on `/analytics/records`; `/analytics/orders`; eight new download blocks; `OutcomeLabel` in status-label.tsx.

**Left out, and the task that brings it**
- Prices and Approval speed: 6.4b. Managers and Warehouse: 6.4c.

**What the next sessions must know**
- For 6.4b, 6.4c: add a block as 6.4a did: a summary table filled in `refreshAnalytics()` (its lock statement lists every summary table), one WHERE builder, a drill-down page or key, a sheet in `sheets.ts`, a case in the route's `switch`, a matrix case in `analytics-matrix.db.test.ts` and in the route test's 6.4a matrix.
- For 6.6: Finance's Plan vs actual can call `getPlanVsActual()`; "purchases without a receipt" is not in it.
- Breakdowns by branch, department, supplier or Manager drill down by setting that filter, not by a new key (`ChartRow.href`).
- Tests: `bought()` takes `progress`, `paymentType`, typed extras and the plan; `recordOn()` adds a record to an order; `buyingEvent()` writes the event an outcome's day is read from.
- An Excel total names its column when the money column is not the last plain money one (`total.column`); an empty table keeps its label.

## 6.4b Analytics: Head, Prices and Approval speed (18.10.2026, pull request #106)

**Built**
- Migration 0038: `analytics_spending` gains `variant_id` (the subtype bought), `qty`, `unit_price`, `goods` (`actualGoods()` of the record) and `created_at`; `analytics_steps`, one row per stay at an approval step (decided or open), both rewritten by `refreshAnalytics()`. The migration clears the derived rows and the job's `last_finished_at`.
- Domain: `unitPriceOf()` (purchases.ts, shared with `actualUnitPrice()`), `approvalStays()` (approval-stays.ts), `averageHours()`, `WAITING_GROUPS`/`waitingGroup()`, `reasonKey()`, `priceRiseSince()` (analytics.ts).
- Queries `getPrices()`, `getPriceChoices()`, `getApprovalSpeed()`, `getApprovalOrders()`; `stepsWhere()` with the branch and draft walls; the price key on `/analytics/records`; `/analytics/approvals`; eight download blocks; the Prices and Approval speed blocks on the Head's page.

**Left out, and the task that brings it**
- Managers and Warehouse: 6.4c. The Principal's "my average time to decide" and the Manager's "share sent back, with reasons": 6.5. Page PDF: 6.7.

**What the next sessions must know**
- For 6.5: "My approvals" and "share sent back, with reasons" read `analytics_steps` under `stepsWhere()` (decisions by `decision`, reasons by `reason_key`); averages are `averageHours()` of a set's own Σ seconds and count, never a mean of means.
- For 6.4c and 6.5: a price is `unitPriceOf(Σ goods, Σ qty)` of `analytics_spending` rows with `unit_price > 0`; SQL adds, the domain divides.
- `spendingWhere()` and `stepsWhere()` always return SQL (`true` when nothing filters); `spendingWhere(actor, null, …)` leaves the dates to the caller.
- Tests: `decided()` and `movesOf()` in `tests/helpers/analytics.ts` write an order's approval history as the actions do.
- The quantity formatter writes 2.0 as "2": hours read "2 soat", "2,3 soat".

## 6.4c Analytics: Head, Managers (18.10.2026, pull request #107)

**Built**
- 6.4c split into 6.4c (Managers) and 6.4d (Warehouse) in `docs/build-plan.md` (phase 6 now 13 tasks, total 104).
- Migration 0039: `analytics_cancelled` (each cancelled record, its cancel day and its total as entered) and `analytics_cash` (each order's `orderCashCount()` and `cashSince()`, not Draft, not Closed), both rewritten by `refreshAnalytics()`.
- Domain: `averageSom()` (analytics.ts). Queries `getManagers()`, `getCancelledRecords()`, `getCashOrders()`; `cancelledWhere()`, `cashWhere()`; `/analytics/cancelled`, `/analytics/cash`; download blocks `managers`, `cancelled`, `cash`; `amountChangeText()`.

**Left out, and the task that brings it**
- Warehouse block and the phase 6 check by hand on the whole Head page: 6.4d. The Manager's "My cash": 6.5. Finance's money with managers by age: 6.6. Page PDF: 6.7.

**What the next sessions must know**
- For 6.4d: add the block as 6.4c did (summary tables in `refreshAnalytics()` and its lock statement, one WHERE builder per table, a list page, sheets, route cases, matrix and route-matrix cases, a migration that clears the job's `last_tick`/`last_finished_at`). Stock value per line is `stockValue()` of src/domain/stock.ts.
- For 6.5 and 6.6: cash per order is `analytics_cash` under `cashWhere()` (held only, `cash_count > 0`); owed rows are in the table too (negative counts). Days held: `daysOf({ first: since, last: today }) − 1`. The test "matches Money with managers" in analytics-refresh.db.test.ts keeps the job's reader equal to the 4.9 page's.
- A signed money average changes in so'm only (`amountChangeText()`); `changeAgainst()`'s percent reads backwards on a negative base.
- `src/server` does not import `src/features`: the job reads its own rows. `tsconfig.tsbuildinfo` can hold a stale message type after the JSON files change: delete it when typecheck flags keys that exist.
- Tests: `moneyOn()` in tests/helpers/analytics.ts writes a money action of one row (cancelled when asked); `bought()` takes `cancelledAt`.

## 6.4d Analytics: Head, Warehouse (18.10.2026, pull request #108)

**Built**
- Migration 0040: `analytics_stock` (each stock line of a product: `stockValue()`, `isLow()`, the Tashkent day of its newest movement) and `analytics_stock_moves` (each issue, return and approved write-off of a document not Reversed, on the document's date, its `stockValue()` at the cost it moved at), both rewritten by `refreshAnalytics()`; a unique `(id, branch_id)` on `stock_documents` for the moves' branch key.
- Domain: `priceRiseSince()` became `ninetyDaysSince()` (one 90-day function for Prices and Warehouse); `useChange()`.
- Queries `getWarehouse()`, `getStockLines()`, `getStockMoves()`; `stockWhere()`, `movesWhere()`; drill keys `stock:value|low|still` and `moves:use|writeoff`; `/analytics/stock`, `/analytics/moves`; download blocks `warehouse`, `departmentUse`, `stock`, `moves`; the Warehouse block on the Head's page.

**Left out, and the task that brings it**
- The Principal's Warehouse block: 6.5, on these queries. The stock value report with direct entries as their own line: 6.9. Page PDF: 6.7.

**What the next sessions must know**
- For 6.5: the Principal's "stock value; low stock; what each department used" is `getWarehouse()` under the Principal's branch (`branches[0]`, `departments`); "runs out in" reads issues from `analytics_stock_moves` (type ISSUE, net of returns as use is) or a new summary, not raw movements.
- For 6.9: "use by department" is issued − returned at each movement's own cost, a reversed document left out with its reversal (plan of 6.4d, decided item 4); the report should read the same rows so screen and report agree.
- For 7.1 to 7.4: transfers and count corrections are not counted by this block (types TRANSFER_OUT/IN, CORRECTION); a "lost in transfer" write-off counts as a write-off once approved.
- Stock numbers are of now: no change against the period before (decided item 2, Look first).
- Tests: `stocked()`, `stockDocument()` and `reverseNow()` in tests/helpers/analytics.ts make stock lines, issues, returns, write-offs and reversals at the clock's moment.
- A browser run in a cold cloud session times out at sign-in: start the e2e dev server first (as `playwright.config.ts` does) and warm `/login`, or run with `--workers=1`.

## 6.5a Analytics: Principal (18.10.2026, pull request #109)

**Built**
- 6.5 split into 6.5a, 6.5b, 6.5c in `docs/build-plan.md` (phase 6 now 15 tasks, total 106).
- Migration 0041: `analytics_orders` (each order not Draft: status, progress, Tashkent first-submit day, needed-by) and `analytics_steps.decided_by` (the actor who ended a decided stay), both written by `refreshAnalytics()`.
- Domain: `isComingUp()` (order-steps.ts); stays carry `decidedBy`.
- Queries `getTopProducts()`, `getOrderStatuses()`, `getStatusOrders()`, `getMyApprovals()`; `ordersWhere()`; drill keys `product:<id>`, `status:<STATUS>`, `due:soon|overdue`, `mine`; `/analytics/order-status`; download blocks `products`, `orderStatuses`, `statusOrders`, `myApprovals`; the Principal's four blocks on `/analytics` (`principal-blocks.tsx`, `WarehouseView principal`).

**Left out, and the task that brings it**
- The Manager's My orders, My estimates, My cash: 6.5b. Stock planning, "runs out in" and the suggested quantity (open question 15): 6.5c. Finance: 6.6. Page PDF: 6.7.

**What the next sessions must know**
- For 6.5b: "by status" of my orders can read `analytics_orders` under `ordersWhere()` with the Manager filter set to the user; "average time to full approval" needs a new number (Submit to Open), not `analytics_steps` sums of one step; "share sent back, with reasons" reads `analytics_steps` decisions as 6.4b does.
- For 6.5b: My estimates compares the plan's price with `unitPriceOf(Σ goods, Σ qty)` of `analytics_spending` per product; My cash is `analytics_cash` under `cashWhere()`.
- For 6.5c: "runs out in" reads issues from `analytics_stock_moves` (ISSUE net of RETURN) and stock from `analytics_stock`; the domain function and its unit test are the Done-when.
- The page picks blocks by `user.role` in `src/app/(app)/analytics/page.tsx`: add a `role === "MANAGER"` tuple as the Principal's.
- Tests: `decided()` takes `neededBy`, `submittedAt`, `progress`; a `Move` takes `actorId`. A test that runs `setClock()` in `beforeAll` sets it again in `beforeEach`: the setup puts the clock back before each test.
- Never run two db test commands at once: the second's global setup drops the shared template database and the first fails all over.

## 6.5b Analytics: Manager, My orders, My estimates, My cash (18.10.2026, pull request #110)

**Built**
- Migration 0042: `analytics_orders.opened_at`, `opened_on`, `approval_seconds` (first entry into Open, first submit to Open), written by `refreshAnalytics()`.
- Domain: `estimateGap()` (analytics.ts), `secondsBetween()` (approval-stays.ts, now also behind `approvalStays()`).
- Queries `getMyOrders()`, `getMyEstimates()`, `getMyCash()`; helpers `status-counts.ts`, `top-reasons.ts` (shared with 6.5a's and 6.4b's queries), `mine.ts`; drill keys `approved`, `priced:<product|all>`; `cashWhere(…, owed)`; download blocks `myOrders`, `myReasons`, `myEstimates`, `myCash`; the Manager's three blocks on `/analytics` (`manager-blocks.tsx`), no Spending block and no Manager filter there.

**Left out, and the task that brings it**
- Stock planning, "runs out in", suggested quantity (open question 15): 6.5c. Finance: 6.6. Page PDF: 6.7.

**What the next sessions must know**
- For 6.5c: add the block to the `role === "MANAGER"` tuple of `src/app/(app)/analytics/page.tsx` and to `manager-blocks.tsx`; read the user's own scope with `mineOf()`/`withoutManager()` only if the block is "my" (stock is the branch's, not the Manager's).
- For 6.5c: messages of the Manager's page are under `analytics.my` (`analytics.manager` is the filter's label).
- A list page that takes `manager=` checks the id is a Manager (`authorizeAnalytics()`): a non-Manager cannot open the "my" drill-downs with themself as the filter, so the matrix runs those lists for MANAGER only.
- An Excel sheet name may not hold `* ? : \ / [ ]` (ExcelJS throws); the route test catches it.
- The seed needs the four seed passwords in the local `.env`; a cloud session has none, so CI runs it.

## 6.5c Analytics: Manager, Stock planning (18.10.2026, pull request #112)

**Built**
- Domain: `runsOutIn()`, `suggestedQuantity()`, `qtyChange()`, `RATE_DAYS`, `COVER_DAYS` (analytics.ts).
- Query `getStockPlanning()` (stock-planning.ts): one row per stock line of `analytics_stock` that holds stock, is Low or moved; use per month (`to_char` of `analytics_stock_moves.moved_on`), period, period before, the month before the first month, and the 90-day rate of every department.
- `movesWhere(…, variant)`, `SIGNED_QTY`; `getStockMoves(…, variant)` with `quantity` (Σ issue − return) when a subtype is given; `/analytics/moves` honours `variant=`.
- Download block `stockPlanning`; the Stock planning block on the Manager's `/analytics` (`StockPlanningView` in manager-blocks.tsx), 10 lines shown (`TOP_PLANNING`).

**Left out, and the task that brings it**
- Finance: 6.6. Page PDF: 6.7. Transfers are not use; no transfer exists until 7.1, so no test has one yet.

**What the next sessions must know**
- For 6.7: the Manager's page now has four blocks; Stock planning's month columns grow with the period (up to 12).
- For 7.1: `TRANSFER_OUT` never enters `analytics_stock_moves` (its CHECK refuses it), so a transfer never counts as use in Stock planning or Warehouse.
- A use is signed numeric text (`-?\d+(\.\d{1,3})?`), not `quantityOf()` (which refuses 0 and below).
- A Head's `getStockPlanning()` without a branch filter covers every branch: compare its Low count with `getStockLines("low")`, not with a fixed number.

## 6.6a Analytics: Finance, Cash and Cash needed soon (19.10.2026, pull request #113)

**Built**
- 6.6 split into 6.6a and 6.6b in `docs/build-plan.md` (phase 6 now 16 tasks, total 107).
- Migration 0043: `analytics_money` (each Cash given, Cash returned and Paid back row of an action not cancelled, on the action's date and Manager) and `analytics_orders.planned_cash`, `cash_handed`, `cash_needed`, all written by `refreshAnalytics()`.
- Domain: `cashAgeBand()`, `CASH_AGE_BANDS` (analytics.ts); `cashHanded()`, `cashNeeded()`, `APPROVAL_STATUSES` (money-ledger.ts).
- Queries `getFinanceCash()`, `getCashNeeded()`, `getMoneyRows()`, `getNeededOrders()`; `getCashOrders(…, age)`; `moneyWhere()`, `neededWhere()`, `daysOut()`; keys `money:<kind>[:<month>]`, `needed:<stage>[:<step>]`, `age:<band>:<side>`; `/analytics/money`, `/analytics/cash-needed`; download blocks `financeCash`, `cashAges`, `cashNeeded`, `moneyRows`, `neededOrders`; Finance's two blocks on `/analytics` (`finance-blocks.tsx`), under the shared Spending block.

**Left out, and the task that brings it**
- Payments, Plan vs actual with purchases without a receipt, Settlement speed, Finance's branch-wall test and the read of the page on the seed: 6.6b. Page PDF: 6.7.

**What the next sessions must know**
- For 6.6b: add Finance's blocks to the `role === "FINANCE"` tuple of `src/app/(app)/analytics/page.tsx` and to `finance-blocks.tsx`; 6.6b decides whether the shared Spending block leaves Finance's page (6.6a decided item 9).
- For 6.6b: "spending by payment type" is `analytics_spending_payments` as the Head's block reads it (`getHeadSpending()`); bank transfer money rows are not in `analytics_money` (its CHECK holds the three cash kinds).
- For 6.7: Finance's page now has three blocks; Cash's month table grows with the period.
- `daysOut()` (features/analytics/days-out.ts) is the one "days since" of cash held and of the age bands; a query file may export only queries (the permission registry lists every export).
- Every new Analytics query is in the matrix three ways (.claude/rules/tests.md): branch filter, the wall in the SQL with its totals asserted, a department or Manager id of the branch.
- Russian texts say «заказ», never «заявка» (tests/notification-texts.test.ts).

## 6.6b Analytics: Finance, Payments, Plan vs actual and Settlement speed (19.10.2026, pull request #114)

**Built**
- Migration 0044: `analytics_spending.has_receipt` (the trip has a receipt file) and `analytics_settlements` (one row per settlement that ended in Closed: first send, close, seconds, Tashkent close date), both written by `refreshAnalytics()`.
- Domain: `settlementStays()` (approval-stays.ts), `averageDays()` (analytics.ts, one rounding with `averageHours()`).
- Queries `getFinanceSpending()` (payment types, transfers by supplier, records without a receipt), `getSettlementSpeed()`, `getSettlements()`; `paymentTotals()` shared with `getHeadSpending()`; `settlementsWhere()`; keys `noreceipt`, `settled`, `payment:<TYPE>:nosupplier`; `/analytics/settlements`; download blocks `transfers`, `overspendBranches`, `overspendManagers`, `settlementBranches`, `settlements`.
- Finance's `/analytics`: Cash, Cash needed soon, Payments, Plan vs actual, Settlement speed; no Spending block.

**Left out, and the task that brings it**
- Page PDF: 6.7. Purchase register and Planned vs actual reports: 6.8, 6.9.

**What the next sessions must know**
- For 6.7: Finance's page has five blocks; the Head's, Principal's and Finance's Plan vs actual all read `getPlanVsActual()`.
- For 6.8 and 6.9: "no receipt" is `analytics_spending.has_receipt = false`, the settlement screen's reading; "by payment type" is `paymentTotals()`.
- A settlement test order needs an approval event and a `submittedAt` before it, or `writeOrders()` meets a send back for correction as its first entry into Open and throws on negative approval seconds.
- `db.execute` returns timestamptz as text like `2031-05-05 20:00:00+00`, which `new Date()` cannot be trusted with: select `to_json(<col>)#>>'{}'`.
- The seed's trips are Cash with no supplier and no receipt; its one settled order closes last month at its send's moment (0 days).

## 6.7 Analytics as a PDF (19.10.2026, pull request #115)

**Built**
- `GET /analytics/report?<the page's address>`: the user's own Analytics page as a PDF (A4 landscape, letterhead, period, summary time, filters, who and when on every page, page n of m; no signature lines), in the user's language.
- `readAnalyticsPage()` in `src/features/analytics/page-data.ts`, read by the page and the route; `analyticsReport()` (`download/page-report.ts`) builds the sections: title, notes, headline numbers, and every table as its Excel sheet; `writeAnalyticsPdf()` (`download/pdf.tsx`) draws them.
- The "Download PDF" link at the top of `/analytics`, from the parsed address.

**Left out, and the task that brings it**
- The drill-down lists in the PDF: not built (decided item 3). Reports: 6.8, 6.9. The react-pdf defect after a Russian PDF: the fix task proposed after 3.5.

**What the next sessions must know**
- A new Analytics block goes into `readAnalyticsPage()`, the page, and a section of `analyticsReport()`; its tables are its Excel sheets.
- `sheets.ts` exports `translators()` and `heading()`; a table's captions are its heading lines minus the file's.
- A route test passes the branch cookie with `request.cookies.set(BRANCH_COOKIE, …)` on `downloadRequest()`.
- Locally the browser tests failed at sign-in on `main`'s tests too (6.5a), with a throwaway `BETTER_AUTH_SECRET`; CI's `e2e` is the gate.
- Never run two vitest runs at once: they share the test database and fail across the board.

## 6.5a-2 The Orders total of the Principal's page opens its list (19.10.2026, pull request #116)

**Built**
- The drill key `status:all` (`{ kind: "status", status: null }`): `getStatusOrders()` lists every order first submitted in the period under the total's `ordersWhere()`; `/analytics/order-status` names it "All orders"; the `statusOrders` export takes it.
- The "All orders" total of the Principal's Orders block and of the Manager's My orders block links to it.

**Left out, and the task that brings it**
- Nothing of this task. Reports: 6.8.

**What the next sessions must know**
- A key's "every value" is written `<kind>:all` and parsed to `null` (`step`, `waiting`, `priced`, now `status`); the key pattern of `period-params.ts` lists `all` beside the values.
- `principalIn()` of the analytics matrix test returns its `scene` too.

## 6.8 Reports: orders and spending (19.10.2026, pull request #117)

**Built**
- `/reports` for every role: Order register, Purchase register, Planned vs actual, Spending as tabs; filters branch, From, To, category (`report-params.ts`, `parseReportParams()`, `reportSearch()`); Download Excel.
- Queries `getPurchaseRegister()` (live tables, domain functions per record, cancelled marked), `getPlanVsActualReport()` (`analytics_outcomes`), `getSpendingReport()` (`analytics_spending`); the Order register is `orderTotalsOnFilter()` on screen and `/orders/download/excel` as its file (`orderListFilters()`, `orderListSearch()`).
- `GET /reports/download?report=purchases|plan|spending`: one workbook per report (`download/sheets.ts`, `writeAnalyticsWorkbook()`); a `quantity` cell kind.
- S7's reports part in `tests/e2e/branch-wall.spec.ts`; `tests/e2e/reports.spec.ts`; `tests/e2e/report-records.ts` seeds records in June 2019.

**Left out, and the task that brings it**
- Price history, Stock on hand, Stock movements, Use by department, Money with managers, Approval speed: 6.9. A PDF of a report: not asked.

**What the next sessions must know**
- For 6.9: add a report to `REPORTS` of `report-params.ts`, a tab text under `reports.tabs` and `reports.notes`, a case in `page.tsx` and in `/reports/download`, and its matrix tests in `reports-matrix.db.test.ts` and the route test.
- For 6.9: the report pages read the filters branch and category only; `authorizeAnalytics()` checks the branch.
- An e2e run with several workers signs in the same Principal at once and fails at sign-in locally; `--workers=1` passes.

## 6.9a Reports: Stock on hand, Stock movements and Use by department (19.10.2026, pull request #118)

**Built**
- Three tabs on `/reports`: Stock on hand (`getStockReport()`: live `stock_balances` lines, `stockValue()` per line, per branch the value now and the Purchases and Direct entries that came in during the dates), Stock movements (`getStockMovementsReport()`: every movement of the dates, signed, the undone ones marked), Use by department (`getDepartmentUseReport()`: `analytics_stock_moves` under `movesWhere(…, "use")`, per department and subtype).
- `src/features/reports/movement-date.ts`: `MOVEMENT_DATE` (a reversal its own Tashkent day, a receipt its record's date bought, a document's movement the document's date), `MOVEMENT_SOURCES`, `UNDONE`; read by both live stock reports.
- `/reports/download?report=stock|movements|use`; the Excel `quantity` cell takes a signed quantity; `tests/helpers/reports.ts` (`boughtIn()`, `directEntry()`).

**Left out, and the task that brings it**
- Price history, Money with managers, Approval speed: 6.9b.

**What the next sessions must know**
- For 6.9b: the steps of a new report are those of 6.8's note; the tab row has seven tabs and wraps.
- For 7.1 to 7.4: Stock movements already lists TRANSFER_OUT, TRANSFER_IN and CORRECTION rows (a transfer's on its document's date); Use by department and the two in-lines do not count them.
- For 7.2: a TRANSFER_IN movement sits in the receiving branch but its document in the sender's; Stock movements and the item card join the document with no branch check, so the receiver would see the sender's document number and a link the document page answers Not found. Join it only when the document is of the movement's branch or its `to_branch_id`, and decide who may open a transfer document (permission review of 6.9a, Should fix 1).
- Stock movements, the two in-lines and Use by department agree for the same dates and filters (`stock-movements-report.db.test.ts`); a change to how a movement is dated changes `MOVEMENT_DATE` and `analytics_stock_moves.moved_on` together.
- `stocked()` writes a RECEIPT with no purchase: the Stock on hand report counts it under Purchases on the clock's day, so a test that wants no in-line sets the clock before the dates first.

## 6.9b Reports: Price history, Money with managers and Approval speed (19.10.2026, pull request #119)

**Built**
- Three tabs on `/reports` (ten in all): Price history (`getPriceHistoryReport()`: one subtype, `variant=` or the most bought in the dates inside the wall; a line chart with a point per priced record of `analytics_spending`, the records 25 a page, the `HEAD` reference prices in force on the first day and set in the dates), Money with managers (`getMoneyWithManagersReport()`: `analytics_cash` under `cashWhere(…, owed)`, `managerBalances()` per owner, the three age bands, the orders), Approval speed (`getApprovalSpeedReport()`: `analytics_steps` decided in the dates, `averageHours()` per branch and step and for all, the stays).
- `/reports/download?report=prices|cash|speed`; `variant` in `ReportParams`; `heading()` of the report sheets takes `null` dates for a report of now; `tests/helpers/reports.ts` `headPrice()`.
- A report table's card has `min-w-0`, so at 375 px its table scrolls inside the box (the Spending grid could push the page sideways on `main` too).

**Left out, and the task that brings it**
- Nothing of this task. A PDF of a report: not asked. Search: 6.10.

**What the next sessions must know**
- Money with managers as a report is `data.view` (every role, own branches); the `/money` page stays `money.managers` (plan of 6.9b, decided item 1, Look first, waiting for the owner on issue #9).
- Every report but the Order register, Purchase register and the stock reports reads the summary and shows its time (`SUMMARY_REPORTS` of `page.tsx`).
- `PURCHASE` rows of `price_history` carry no branch and keep cancelled prices: a reader of prices by branch reads `analytics_spending` instead.

## 6.10 Search (19.10.2026, pull request #120)

**Built**
- Ctrl+K or Cmd+K on every signed-in page, and the search button of the top bar (a field with "Ctrl K" from 640 px, an icon below), open the search dialog (`src/components/shell/search.tsx`).
- `searchEverything()` (`src/features/search/queries/search.ts`): orders by number under `data.view` with `branchFilter()` and never a Draft; subtypes by product or subtype name and suppliers (`SUPPLIER`, `BOTH`) by name under `catalog.pick`; 8 per group. `searchAction` in `src/app/(app)/search-actions.ts` adds each result's address (`src/features/search/result-href.ts`).
- Texts under `search.*` in the three message files; `src/domain/search.ts` holds the limits.

**Left out, and the task that brings it**
- Nothing of this task. Searching users, departments, document numbers: not asked by 11 rule 9.

**What the next sessions must know**
- For 7.1 to 7.4: a transfer or count number is not searched; add a group to `searchEverything()` and `hitsOf()` of the dialog if a task asks for it.
- The dialog's results stand only for the text typed now (the answer keeps its text); keep that when the dialog changes.

## 7.1 Transfer: send (19.10.2026, pull request #121)

**Built**
- `sendTransfer` (`features/warehouse/actions/transfer.ts`, `stock.transfer`): TRF number of the sender, `IN_TRANSIT`, `to_branch_id`, `TRANSFER_OUT` at the sender's average at once; `TRANSFER_SENT` to the receiving branch's active Managers.
- `/warehouse/documents/new?type=TRANSFER` (`TransferForm`), the Transfer button (`NewDocumentButtons`), `transferBranchChoices`, `searchTransferItems` (`issue-form.ts`), `transferDestinationChoices` (`transfer-form.ts`).
- The transfer's page: From, To, Sent by, In transit; the transfer note PDF through the issue note's route (`queries/document-note.ts`, `download/document-note.tsx`, `getDocumentNote()`).
- `setBranchActive` refuses while a transfer from or to the branch is In transit (`transfers`, `errors.field.transfersInTransit`).

**Left out, and the task that brings it**
- Receiving, the receiver's view, `TRANSFER_IN`, "Lost in transfer" and Reverse of a received transfer: 7.2.

**Open for the owner**
- A PDF rendered after another in one server process can lose letters (a Russian note, then an English one): not this task's; see the report of #121.

**What the next sessions must know**
- For 7.2: `getStockDocument()`, `listStockDocuments()` and `getDocumentNote()` still filter by `branch_id` only; add `to_branch_id` for the receiver. The notice already links to `/warehouse/documents/<id>`.
- For 7.2: the `TRANSFER_OUT` movement of each line holds the sender's average in `unit_cost`; the line has none. `received_by_name` is the sender's optional text; decide whether the receipt fills or replaces it.
- For 7.2: a received transfer no longer blocks closing a branch (`status = 'IN_TRANSIT'` only); add `TRANSFER` to `reverseAllows()` for the Head.

## 7.2 Transfer: receive (19.10.2026, pull request #122)

**Built**
- `receiveTransfer` (`features/warehouse/actions/receive-transfer.ts`, new permission `stock.receive_transfer` on the receiving branch, no Manager right): RECEIVED with `received_qty` per line, "Received by" and `decided_by`/`decided_at`; `TRANSFER_IN` at the receiver at the line's `TRANSFER_OUT` cost; the short quantity `TRANSFER_IN` back at the sender and a WRITE_OFF LOST_IN_TRANSFER waiting on the sending branch (the Head's receipt posts it at once).
- Domain: `transferReceiveMove()`, `receivedQuantityRefusal()`, `transferShort()`, `transferReceipt()`; `reverseAllows()` + TRANSFER for the Head.
- `documentWall()` (`queries/documents.ts`): list, page and note open a transfer to its receiving branch; a transfer's lines read no stock (`inStock` null).
- The receive form on `/warehouse/documents/[id]` (`ReceiveTransferForm`), Sent/Received/Short columns, the list's "CHL → YNS", the note's Received column; `0045_transfer_receive`: `received_qty <= qty`.

**Left out, and the task that brings it**
- Counts and corrections: 7.3, 7.4.

**What the next sessions must know**
- For 7.3 and 7.4: a COUNT is seen by its own branch only; `documentWall()` opens TRANSFER only, keep it so.
- For 7.4: `reverseAllows()` now answers yes for DIRECT_ENTRY, WRITE_OFF and TRANSFER to the Head; add COUNT the same way.
- A shortage's write-off is made by the receiving user on the sending branch; `notify()` drops recipients outside the event's branch, so its decision notice reaches the receiver only when they are also of the sending branch.
- A TRANSFER line may carry two movements of type TRANSFER_IN (receiver's and the sender's return) besides its TRANSFER_OUT; a reader of "what arrived" reads `received_qty`, not the movements.

## 7.3 Stock count (19.10.2026, pull request #123)

**Built**
- `startCount` and `saveCountedQuantities` (`features/warehouse/actions/count.ts`, `stock.start_count`): a CNT count, PENDING_APPROVAL from its start, one line per balance row of the branch (or category) with `qty` = stock at start and `start_seq` = the item's newest movement `seq`, read after FOR SHARE locks of those balance rows; typing saves `counted_qty` of the lines sent.
- Domain: `countDifference()`, `countedQuantityRefusal()`, `countTypingAllowed()`. Migration `0046_stock_count`: `stock_document_lines.start_seq` (FK to `stock_movements.seq`).
- `/warehouse/counts` (Manager, Head: `seesStockCounts()` of `menu.ts`): list (`listCounts`, counted N of M) and the Start dialog (`CountStartButton`, `countBranchChoices`); a Counts tab beside Stock on hand | Documents.
- The count's page `/warehouse/documents/[id]`: Stock at start, Counted, Difference; `CountSheetForm` where `canCount`. The page's "In stock now" column is now a waiting write-off's only.

**Left out, and the task that brings it**
- Approval as corrections, re-count of moved items, "Write-off or correction asked", the Head's home list, Reverse of a count: 7.4.

**What the next sessions must know**
- For 7.4: an item moved after the start when a movement of that branch and subtype has `seq > start_seq` of its line (never compare `created_at`). The correction is `countDifference(qty, counted_qty)`; take the balance locks as `postMovements()` does.
- For 7.4: `countTypingAllowed()` is the one place that says when typing stops; decide what makes a count "asked" (all lines counted, or a Send step) and change it there.
- For 7.4: `reverseAllows()` still answers no for COUNT; the write-off decision and the Head home list filter on `WRITE_OFF`, so a waiting count shows in neither.
- A sticky bottom bar on a phone sits at `bottom-[calc(4rem+env(safe-area-inset-bottom))]`, above the tab bar; in a browser test the Next.js dev button covers the phone's Home tab, click another tab.

## 7.4 Count approval (19.10.2026, pull request #124)

**Built**
- `decideCount` (`features/warehouse/actions/count-decision.ts`, `stock.approve_write_off`, the Head): Refuse → REJECTED; Approve of a complete count → POSTED and one CORRECTION per non-zero line at the average (`postLines()` through `countCorrection()`); an item moved after its start sends the count back (lines reset, `recount = true`, outcome RECOUNT). Approve carries the counted quantities shown (`seen`); a change since is `conflict`.
- Domain: `countComplete()`, `countDecisionMove()`, `countLineMoved()`, `countCorrection()`, `countSeenMatches()`; `reverseAllows()` + COUNT for the Head. Migration `0047_count_approval`: `stock_document_lines.recount`.
- The save that completes a count sends STOCK_CHANGE_ASKED (kind COUNT) to the Heads; decisions send STOCK_CHANGE_DECIDED to the starter (approved, refused), and a send-back (recount) also to the branch's Managers with WRITE_OFF_COUNT.
- The count's page: `CountDecision`, the "Count again" mark, the waiting line; the Head's home block lists complete counts and links to `/warehouse/documents`; Reverse of an approved count (not offered when it moved nothing).

**Left out, and the task that brings it**
- Search for count numbers: no task asks (6.10's note).

**What the next sessions must know**
- A count is "asked" when every line is counted (`countComplete()`); typing stays open while it waits, so an approval must carry what the Head saw.
- `postLines()` returns only the lines that moved, each with its own id; a count line of difference 0 writes no movement.
- The approval takes, per line in subtype order, the product FOR SHARE and the balance FOR UPDATE before its moved-check; the save takes no balance lock.
- For 8.1: a waiting count is not escalated; only orders are.

## 8.1 Reminders and escalation (19.10.2026, pull request #125)

**Built**
- Job `reminders` (`src/server/jobs/reminders.ts`, daily at the 00:00 Tashkent tick): REQUEST_WAITING_24H to the approvers of each Waiting step (`waitingFor()`), count over their branches; REQUEST_WAITING_48H to every active Head, all branches; NEEDED_BY_NEAR to the owner, one per branch, for orders needed by today to today + 2 whose buying is not finished. Repeats daily while the orders wait.
- Domain: `waitingNotices()`, `nearNotices()`, `NEEDED_BY_NEAR_DAYS` (`src/domain/reminders.ts`). NEEDED_BY_NEAR params `{ count, branch }` and texts in uz, ru, en.
- `src/features/orders/order-sql.ts`: `enteredCurrentStatusAt` and `stillDueWhere()`, moved out of `listWhere()`.

**Left out, and the task that brings it**
- A time of day for the job: 8.2. A list filter "waiting more than `reminder_hours`": none asks.

**What the next sessions must know**
- "Entered its current status" and "still due" are the SQL of `order-sql.ts`; a new reader uses them, never a copy.
- For 8.2: when a time of day comes to `schedule.ts`, the reminders may move to it (decided item 5 of 8.1 names the delay).
- A database test of a job that counts every branch (the Head's) leaves its orders out of the counted statuses after each test (`afterEach` of `reminders.db.test.ts`): the tests of one file share a database.

## 8.2 Nightly check and weekly copy (19.10.2026, pull request #126)

**Built**
- `src/domain/schedule.ts`: `{ dailyAt: "HH:MM" }` and `{ weeklyOn: 1..7, dailyAt }` (ISO weekday, Tashkent time) beside `{ everyMinutes }`.
- Job `stock_check` (03:00 daily): one statement reads every balance and movement; `stockMismatch()` of `src/domain/stock-check.ts` replays each branch and subtype through `nextBalance()`; any mismatch sends one STOCK_CHECK_MISMATCH `{ count }` to every active Head (link `/warehouse/stock`) and logs `Stock check: branch …, subtype …` per item. Corrects nothing. Migration `0048_stock_check` (enum value).
- Job `database_copy` (Sunday 04:00), only where `copyRuns()` (production and `S3_BUCKET`): `databaseCopy()` of `scripts/db-copy.mjs` runs `pg_dump --format=custom` (PG* variables, CA as verify-full) and writes `backups/database-<Tashkent date>.dump` to the files bucket. `npm run db:copy`; `node scripts/db-copy.mjs` in the image's console.
- The image installs `postgresql-client-17` from apt.postgresql.org; the build stops unless `pg_dump` says 17. `docs/deploy.md`: "The weekly copy", restore with `pg_restore`.

**Left out, and the task that brings it**
- The restore drill: 9.6. Moving the reminders to a time of day: no task asks.

**Open for the owner**
- The by-hand check on the test copy: `backups/` in R2 holds last Sunday's file (report, "For the owner").

**What the next sessions must know**
- A stored movement is replayed by `replayedMovement()`: a new movement type or a new way of pricing one changes it there, or the nightly check reports every such item.
- A job that must not run everywhere is chosen in `jobsFor(env)` of `registry.ts`; the copy is last, as a dump delays what follows it in a round.
- `pg_dump` 17 is not on this machine or the CI runner (16 there); a local by-hand copy can run `postgres:17`'s `pg_dump` through a wrapper on `PATH` (`docker run --rm -i --network host -e PGHOST … postgres:17 pg_dump "$@"`).
- For 9.6: restore with `pg_restore --no-owner` 17 into an empty database; tried locally on 19.10.2026, all 49 migrations came back.

## 8.4 Translation pass (19.10.2026, pull request #127)

**Built**
- `npm run i18n:check` also compares the three languages value by value (`scripts/check-translations.mjs`: `readMessage()`, `uzbekApostrophes()`, `SCRIPT_EXEMPT`); the message files pass it.
- `npm run i18n:export [file]` and `npm run i18n:import <file>` (`scripts/translations-excel.mjs`): one workbook, sheet "Texts" (Key, English, Oʻzbekcha, Русский) and a very hidden sheet "Exported"; the import is all or nothing and never writes `en.json`.
- `docs/translations.xlsx`, the owner's file, exported at this task.

**Left out, and the task that brings it**
- A word-by-word style review of Uzbek and Russian: the owner, through the file (D12).

**Open for the owner**
- Correct `docs/translations.xlsx` and hand it back to a session, which runs `npm run i18n:import <file>` and opens a pull request.

**What the next sessions must know**
- A new Uzbek text writes oʻ/gʻ with U+02BB and the tutuq with U+02BC; a Russian plural names one, few, many and other (or `=1`/other for "it/they"); every language uses the same argument names. The check says which.
- An Uzbek value may drop the plural of a count, never the argument: write `{count, plural, other {# ta …}}`.
- `docs/translations.xlsx` is a snapshot; run `npm run i18n:export` for a fresh one before handing it to the owner.

## 9.1a Acceptance run: orders to approval (19.10.2026, pull request #128)

**Built**
- 9.1 split in four in `docs/build-plan.md`: 9.1a (this), 9.1b money and settlement, 9.1c purchasing and warehouse, 9.1d the accessibility pass.
- `tests/e2e/acceptance-orders.spec.ts`: S14, S17, S18 and S19 clicked through as each role, at 375 px and 1440 px.
- S5 (`send-back.spec.ts`) asserts the highlight and the restart at Head; S6 (`copy-as-new.spec.ts`) has the Principal press Reject with a reason. S7 (`branch-wall.spec.ts`) unchanged.

**Left out, and the task that brings it**
- S1, S2, S3, S9, S12, S13, S16, S20: 9.1b. S4, S8, S10, S11, S15: 9.1c. The accessibility pass: 9.1d.

**What the next sessions must know**
- For 9.1b, 9.1c: the fixtures of `acceptance-orders.spec.ts` (`newBranch()`, `newManager()`, `newProduct()`, `insertDraft()`) make fresh people, branches and products per attempt; a scenario that counts or groups needs them, as the e2e database is kept and CI retries twice.
- An order written straight into the table as submitted has no Submit event: the stepper and the download show no step names for it. Write a draft and submit it in the grid when a step's name or time is read.
- `browser.newContext()` does not take the project's viewport: pass `info.project.use.viewport`.

## 9.1b Acceptance run: money and settlement (19.10.2026, pull request #130)

**Built**
- `tests/e2e/acceptance-money.spec.ts`: S1, S2, S3, S9, S12, S13, S16 and S20 clicked through from complete drafts (Submit, three approvals, purchases, closes, settlement), at 375 px and 1440 px.
- `tests/e2e/acceptance-fixtures.ts`: the fixtures of 9.1a in one module, plus `newPerson(role, branch, locale)`, `newExtraCostType()`, planned extras and payment type on `insertDraft()`, `countOf()`, `statusOf()`, `stockOf()`, `withGuardLock()`, `setGuardAmount()`.
- `settings.spec.ts`: its guard-amount test runs inside `withGuardLock()`.

**Left out, and the task that brings it**
- S4, S8, S10, S11, S15: 9.1c. The accessibility pass and S1 with the keyboard only: 9.1d.

**What the next sessions must know**
- For 9.1c, 9.1d: import the fixtures from `acceptance-fixtures.ts`; each scenario makes its own branch and one person per role (`newScene()` in `acceptance-money.spec.ts` shows the pattern).
- A test that changes `overspend_guard_min_amount` runs inside `withGuardLock()`: it serialises with S12 and the settings test and puts the amount back.
- After a settlement save, wait for the refreshed count (`[data-cash-order] [data-fact="count"]` reads 0) or reload before Close: Close sends the versions the screen holds, and a stale one is refused "Changed a moment ago".
- 08's orange is `data-colour="amber"` on the labels.
- The 16 tests take about 5.5 minutes at two workers locally; run them at two workers, as CI does: four workers on this machine time out sign-ins.

## 9.1c Acceptance run: purchasing and warehouse (19.10.2026, pull request #131)

**Built**
- `tests/e2e/acceptance-warehouse.spec.ts`: S4, S8, S10 and S11 clicked through from complete drafts (Submit, approvals, purchases, issues, Cancel record), at 375 px and 1440 px.
- `tests/e2e/acceptance-fixtures.ts`: the flow helpers of 9.1b moved in (`newScene()`, `throughApprovals()`, `submitInGrid()`, `financeApproves()`, `recordPurchase()` with `subtype` and `progress`, `numberOf()`, `movementsOf()`, the 15-second `expect`), plus `newProductWithSubtypes()` and `stockIn()`.
- S15: the two tests of `direct-entry.spec.ts`; the first now reads the +200 in `stock_balances`.
- Every scenario has its browser test: S1, S2, S3, S9, S12, S13, S16, S20 `acceptance-money.spec.ts`; S4, S8, S10, S11 `acceptance-warehouse.spec.ts`; S5 `send-back.spec.ts`; S6 `copy-as-new.spec.ts`; S7 `branch-wall.spec.ts`; S14, S17, S18, S19 `acceptance-orders.spec.ts`; S15 `direct-entry.spec.ts`.

**Left out, and the task that brings it**
- The accessibility pass and S1 with the keyboard only: 9.1d.

**What the next sessions must know**
- For 9.1d: every acceptance helper is in `acceptance-fixtures.ts`; import `expect` from there for the 15-second wait.
- An issue form opened by `page.goto()` can lose a department chosen before it hydrates: choose it inside `expect(...).toPass()` until Received by is prefilled (`readyIssue()` in `acceptance-warehouse.spec.ts`).
- Name the step buttons with `exact: true`: the `next dev` tools button matches "Next".
- A refusal toast's text shows twice in the page; read it inside the region "Notifications".
- `OrderList` draws the list's empty page itself (`empty` prop), so a refusal it holds stays when the refresh empties the list.

## 9.1d Accessibility pass (20.10.2026, pull request #134)

**Built**
- `tests/e2e/accessibility.spec.ts`: every `page.tsx` of `src/app` (a test fails when one is missing from its list) at 375 px and 1440 px, light and dark: axe with no serious or critical finding, 44 × 44 targets at 375 px, a Tab walk. The records the detail screens open come from a per-worker fixture (`makeWorld()`).
- `tests/e2e/acceptance-keyboard.spec.ts`: S1 by keys only, axe at each dialog.
- Fixes: names that hold their visible text, plain links navy (`text-link`), 44 px links at phone width, scrolling tables reachable by Tab, labelled textareas and photo inputs.
- `@axe-core/playwright` (dev dependency).

**What the next sessions must know**
- A new screen goes into `SCREENS` of `accessibility.spec.ts` with the role that opens it; the test of the list fails otherwise.
- A control's `aria-label` contains the text it shows (axe `label-content-name-mismatch`); decoration inside a control is drawn by CSS from a `data-` attribute (`Avatar`, the search button).
- axe reads text without layout: adjacent spans need a space between them to read as two words.
- A plain link is `font-semibold text-link`; orange text is never a link.
- A wrapper with `overflow-x-auto` around content without links gets `tabIndex={0}` and the focus ring.
- The Head's Analytics holds thousands of links on the kept e2e database: a test that tabs through a page sizes its stop to the page.

## 9.2 Speed (20.10.2026, pull request #135)

**Built**
- `npm run speed`: `next build` and `next start` against `procurement_speed` (36 000 invented orders over three school years, `tests/speed/fill.ts`), every screen of `tests/e2e/screens.ts` and the large lists at first, last and filtered pages; writes `docs/speed.md`. `npm run speed:fill` builds the database alone.
- Migration `0049_speed_indexes.sql`; `tests/indexes.db.test.ts` (every foreign key, every filter column); `tests/analytics-summary-reads.test.ts`; `tests/image-small-first.test.ts`; `tests/placeholders.test.ts`.
- Fixes: Analytics drill-downs 25 a page; eight Analytics totals read only their periods' rows; JIT off on the app's connections; a `loading.tsx` for Profile.

**Left out, and the task that brings it**
- The speed of the live app on DigitalOcean: the owner's check during the trial (after 9.4).
- Monitoring: 9.3.

**Open for the owner**
- Rule 8 against the 50-row pages left (item card movements, change history), and the sections without placeholders because of their 404 status: decisions 9.2.

**What the next sessions must know**
- A new screen goes into `SCREENS` of `tests/e2e/screens.ts` (both runs read it); `ScreenIds` names the records its address needs.
- A new filter column goes into `FILTER_COLUMNS` of `tests/indexes.db.test.ts` with its own index or the index of the key it is read through.
- A `loading.tsx` above a page that calls `notFound()` for another role turns its 404 into a 200: the browser tests of the 404 fail.
- An Analytics total with `filter (where …)` also gets `where (now) or (then)`, or it reads the whole summary table.
- `SPEED_SKIP_FILL=1 SPEED_ONLY=<text> npm run speed` measures a few addresses without writing the table; `alter database procurement_speed set log_min_duration_statement = 100` shows the slow statements in `docker compose logs postgres` (reset it before a full run: the long statements it logs push the run's marks out of the log it reads).
- For 9.4: whether the managed database's pooler passes `-c jit=off` and `-c timezone=UTC` on.

## 9.3 Monitoring (20.10.2026, pull request #136)

**Built**
- `src/server/error-report.ts`: an error-reporting client with no dependency (Sentry's envelope format over `fetch`), off until `ERROR_REPORT_DSN` is set. Called by `onRequestError` in `src/instrumentation.ts`, the two action wrappers, the scheduler, the jobs and the nightly stock check's mismatch.
- `describeForLog()` moved to `src/server/log-error.ts` (still exported by `action.ts`).
- `/health?forced-error` throws only with `FORCED_ERROR=on`. `docs/monitoring.md`: the owner's Sentry, UptimeRobot and trial-check steps.

**Left out, and the task that brings it**
- Browser errors: no task. The image job's check of a built app: a later task if the owner wants it (decisions 9.3, item 1).

**Open for the owner**
- After 9.4: the three steps of `docs/monitoring.md` (optional).

**What the next sessions must know**
- A new place that catches an unexpected error and logs it also calls `void reportError(error, "<where>")`; its test uses `catchErrorReports()` of `tests/helpers/error-reports.ts`.
- Never pass a request's path, query, headers or a `cause` to `reportError()`; the `where` is a route pattern or a name.
- For 9.4: keep the names `SEED_DEMO_DATA` (the environment tag reads it) and `ERROR_REPORT_DSN`; add `ERROR_REPORT_DSN` to `docs/deploy.md`'s list of typed values.

## 4.10b Money corrections from issue #9 (20.10.2026, pull request #138)

**Built**
- `cashNotYetGiven()` (`src/domain/money-ledger.ts`): `moneyPrefill()` and `cashNeeded()` share it; the Money tab's Cash given row prefills the planned cash less `cashHanded()` and shows "already given".
- `movedSince()` (`src/features/orders/moved-since.ts`) answers the orders whose owner now is not the owner at a moment, with that owner's name; cancelMoney, cancelPurchase and cancelTrip refuse with `values.manager` and allow once the order is back. Every purchase record is checked, Transfer and Card too.
- `storedFields()` (record money, settlement) refuses a date after today in Tashkent.
- `receiptNeeded()` (`src/domain/purchases.ts`): a cash extra cost needs a receipt with the setting on; the action and the purchase form ask it.
- `OrderFailure.values`, carried by the orders wrapper with `fields`; dropped for an order also refused `forbidden`.

**Left out, and the task that brings it**
- The other D55 items: 7.4b, 7.4c, 2.3b, 8.2b.

**Open for the owner**
- None.

**What the next sessions must know**
- A refusal whose message names a value puts it in `values` beside `fields`; the screen passes it to `tAll(field, values)`.
- Tests that cancel after a move advance the clock between every write and move: a move at the write's exact moment counts as after it.

## 7.4b Inactive stock, counts into 0, a direct entry's cost (20.10.2026, pull request #140)

**Built**
- Issue, write-off and transfer take an inactive product or subtype up to the stock held (the ledger's stock check is the limit); a return takes one when the department's net received amount is above 0. Direct entry and the stock import still refuse inactive entries; ordering and buying unchanged.
- The issue, write-off, transfer and return pickers list such items with `inactive: true`, shown with `warehouse.documents.inactiveOption`; the return picker only for a department that holds them (`departmentHoldsSql()`, `src/server/department-received.ts`, one SQL with `departmentReceived()`).
- `lastCost()` and `replayedMovement()` live in `src/domain/stock.ts` (the nightly check imports them); a CORRECTION up may carry `emptyCost`; `countCorrection(stockAtStart, counted, lastCost?)`; `postLines()` reads the movements of count lines at 0 in one statement and posts them at the last cost.
- `getStockDocument()` lines carry `unitCost`, a direct entry's cost for `stock.enter_direct` (the Head) only, chosen in the SQL; the page shows a "Cost per unit" column.

**Left out, and the task that brings it**
- Cancel a transfer, a refusal's reason: 7.4c.

**Open for the owner**
- None.

**What the next sessions must know**
- A movement type that comes in "at a cost only into an empty stock" uses `emptyCost`, and `replayedMovement()` must replay it the same way, or the nightly check reports a mismatch.
- `postLines()` for a COUNT relies on the caller holding the balance locks and having checked that nothing moved (decideCount's lock step).

## 7.4c Cancel a transfer, a reason for a refusal (20.10.2026, pull request #141)

**Built**
- Migration 0050: `CANCELLED` status, `TRANSFER_CANCELLED` notice type, `stock_documents.decision_reason` with `stock_documents_decision_reason_check` (NOT VALID).
- `cancelTransfer` (`stock.transfer` on the sending branch): `transferCancelMove()`, then `cancelTransferDocument()` writes one REVERSAL per TRANSFER_OUT at its cost; the receiving branch's active Managers are told.
- `decideWriteOff` and `decideCount` refuse a Refuse without a reason of 5 to 500 and store it in `decision_reason`.
- The document page: Cancel transfer with its dialog, "Cancelled by" and the reasons; the note says "Cancelled"; `ReasonField` shared by every warehouse reason dialog.

**Left out, and the task that brings it**
- The other D55 items: 2.3b, 8.2b.

**Open for the owner**
- None.

**What the next sessions must know**
- `reverseMovements()` (`src/server/stock-documents.ts`) is the one writer of a document's REVERSALs; Reverse and the cancel call it.
- A check that names an enum value added in the same migration compares `status::text`: all pending migrations run in one transaction.
- Every test or fixture that refuses a write-off or a count gives `reason`.


## 2.3b Orders, notices and report access from issue #9 (20.10.2026, pull request #142)

**Built**
- `ORDER_MOVES`: DRAFT → CANCELLED (owner or Head, reason, `numbered`); Submit again by the owner or the Head. `OrderState.numbered` is required; every builder sets it from `orders.number`.
- `cancelOrders`: `cancelPlanGaps()` refuses a numbered Draft with an empty plan cell (`not_ready`); `REQUEST_CANCELLED` per owner and branch (`noticePerOwner()`, `notices.ts`).
- `moveOrdersToManager`: `REQUEST_MOVED_IN` to the new owner, `REQUEST_MOVED_OUT` to each old owner, per branch.
- Migration 0051: `notifications.branch_id` (written by `insertNotifications()`), three notice types, `notifications_guard` holds `branch_id`. The bell reads through `visibleToItsUser`.
- Money with managers report under `money.managers`; Price history's notes and setter only when `decideList("money.managers")` allows (`showsNotes`). The tab hides by `seesManagersCash`.
- The drafts grid links a numbered row's number to its order page.
- The analytics Managers block and `getCashOrders()` ask `money.managers` after the filters; a Manager reads only their own cash (`manager` = themselves, no other owners).

**Left out, and the task that brings it**
- The other D55 items: 8.2b.

**Open for the owner**
- None.

**What the next sessions must know**
- A new notice of a branch passes `branchId`: the bell shows it only to readers of that branch.
- A numbered Draft in a test is `insertOrder({ status: "DRAFT", number: inventedNumber() })`; it gets a submit time.

## 8.2b Backups, a Head's lost password, receipt photos, running periods, the report branch (20.10.2026, pull request #143)

**Built**
- Job `database_copy` daily at 04:00: `copyDue()` (`src/domain/database-copy.ts`) copies on a Sunday, the night after a failure, when nothing was recorded, and when the last good copy is 7 days old. One `database_copies` row per attempt (migration 0052, also DATABASE_COPY_FAILED). A failure does not throw: its row, one notice to every active Head (`/settings`, no branch) and an alert. `databaseCopy()` returns `{ ok, key, size, line }` and writes to `BACKUP_S3_*` (`backupStorageConfigOf()`, endpoint and region of `S3_*`). `/settings` shows `getLastDatabaseCopy()`.
- `npm run user:renew-head` (`scripts/renew-head.mjs`, core `renewHeadPassword()` in `scripts/head-password.mjs`, prompt `scripts/ask-hidden.mjs`), copied into the image.
- `document` uploads keep a 2 500 px `large.jpg` (`versionSide()`, `shrinkSideOf()`).
- `periodBefore(period, schoolYearStart, today)`, `isRunning()`, `sameDaysBefore()`, `runningMonthBefore()`; `ResolvedPeriod` carries `running` and `today`; the page and PDF say "against the same days"; the month holding today in Spending, Finance's cash, stock planning and prices compares with the same days.
- Reports: `withSwitcherBranch()` on the page and `/reports/download`; `ReportParams.branchGiven`; `reportSearch()` writes `branch=all`.

**Left out, and the task that brings it**
- The restore drill from the backup bucket: 9.6. The R2 bucket and token of the copies: the owner, at 9.4.

**Open for the owner**
- None.

**What the next sessions must know**
- A test whose "period before" data sits after today's day of the month before now falls out of a running month: put it in the same days, or use last month.
- The test storage env has `BACKUP_S3_*` (`<bucket>-backups`); the Vitest setup makes `procurement-test-backups`.
- A module of a page must not import `@/server/db/client` at the top: `next build` has no DATABASE_URL.

## 5.4b "Give straight to requester": stored, and its cancel (20.10.2026, pull request #144)

**Built**
- `recordPurchase` writes `purchases.give_to_requester` from the line's tick.
- `cancelPurchase` / `cancelTrip`: `givenIssues()` in the inspect step refuses a record whose ISSUE (`client_key` = record id, same branch) is POSTED: `not_ready`, `fields.stock` = `errors.field.givenIssuePosted`, `values.number` = the issue number; whatever the stock. The cancel dialog shows it.

**Left out, and the task that brings it**
- A guard on 5.7's reverse of an issue after an unreversed Return of the same items: none yet; on issue #9.

**Open for the owner**
- The `/spec-change` of 07 Fixing a mistake 2 (decisions 5.4b item 2).

**What the next sessions must know**
- A purchase record's issue is found by `stock_documents.client_key = purchases.id`; `give_to_requester` is false on records saved before 5.4b.

## 5.7b Reversing an issue after a return (20.10.2026, pull request #146)

**Built**
- `reverseStockDocument`: the department FOR NO KEY UPDATE (was FOR SHARE), then `lockDocument()`; in `check`, for an ISSUE, `refuseOverHeld()` reads `departmentReceived()` and refuses every line over it (`overReturn()`): `invalid_input`, `lines.<lineId>.qty` = `errors.field.reverseOverHeld`, `available` = what is held. A return reverses as before.
- The Reverse dialog: such a line in red, "reverse the return first", Reverse disabled; the server's refusal as a toast (`warehouse.reverse.overHeld`, `overHeldShort`; the old `held` warning is gone).

**Left out, and the task that brings it**
- `returnStock` takes the department FOR UPDATE and can deadlock (40P01) with a "Give straight to requester" purchase of the same department and item: no task; on issue #9.

**Open for the owner**
- None.

**What the next sessions must know**
- A department lock that a foreign-key insert can meet under a balance lock is FOR NO KEY UPDATE, never FOR UPDATE: a "Give straight" purchase locks the balance, then inserts an ISSUE pointing at the department (FOR KEY SHARE).
- A reverse of an issue after a return: reverse the return first (09 Issue 3). Test scenes that reverse an issue after an unreversed return now get `reverseOverHeld`.

## 9.4 The live app, in trial (20.10.2026, pull request #148)

**Built**
- `.do/app.yaml`: the live app `ombor` at `ombor.sodiqschool.uz`, 1 GiB, the managed cluster `ombor-db` (`production: true`, `defaultdb` / `doadmin`), buckets `ombor-files` and `ombor-copies`, `SEED_DEMO_DATA` `yes` (trial). `docs/deploy.md` rewritten: the owner's steps, the alerts required, "The end of the trial".
- `npm run trial:reset` (`scripts/trial-reset.mjs`, core `endTrial()` in `scripts/trial-end.mjs`): the database's name as the confirmation; under the session lock `FIRST_HEAD_LOCK` drops `public` and `drizzle`, migrates from zero, writes the one row of `trial_end` (migration 0053). Refuses a wrong name and any run once the row exists.
- `seed()` refuses once `trial_end` holds a row (`trialHasEnded()`), whatever `SEED_DEMO_DATA` says.
- The image carries `trial-end.mjs`, `trial-reset.mjs` and `create-first-head.mjs`.

**Left out, and the task that brings it**
- `SEED_DEMO_DATA` removed, the reset run, the two Heads, the real data: 9.5. The restore drill: 9.6.

**Open for the owner**
- Every step of `docs/deploy.md` (accounts, $25 a month, DNS, R2, typed values, Sentry, UptimeRobot), and the two live Done-when checks: the four demo users sign in at the live address; the cluster's Backups tab shows a daily backup.

**What the next sessions must know**
- For 9.5: remove `SEED_DEMO_DATA` from `.do/app.yaml` and change the `"yes"` assertion and the key list of `tests/app-spec.test.ts`; the error reports' environment then reads `production`.
- For 9.5: the reset runs in the console only after the deploy without `SEED_DEMO_DATA` is done and no deploy is in progress (`docs/deploy.md`, "The end of the trial").
- For 9.6: the app connects straight to the cluster as `doadmin`; a restore goes into a new, empty database, never `defaultdb`.
- A new console script the owner runs in the image goes into `ENTRY_POINTS` of `tests/image-files.test.ts` and the Dockerfile's COPY line.
- `endTrial()` holds `pg_advisory_lock(FIRST_HEAD_LOCK, 0)` for its whole run; a new writer that must never meet a half-reset database takes that lock first.

## 9.6 Restore drill (20.10.2026, pull request #149)

**Built**
- `docs/restore.md`: the drill (A: yesterday's daily backup into a new cluster `ombor-db-drill`; B: the newest weekly copy into a new database `drill_<date>`), "When the two lines differ", the drill's record table, "When it is real".
- `npm run db:restore -- <new database> [<copy key>]` (`scripts/db-restore.mjs`, core `restoreCopy()` in `scripts/restore-copy.mjs`): newest copy of `BACKUP_S3_BUCKET`, `create database`, `pg_restore` 17, then the counts. Refuses an existing database, the app's own, `defaultdb`, `postgres`, `template0/1`.
- `npm run db:counts [-- --database <name> | --ask [--own-ca]] [--until <ISO moment>]` (`scripts/db-counts.mjs`, core `countAt()` / `readCounts()` in `scripts/restore-counts.mjs`): orders, users, stock lines (from movements), movements, newest row, as of a moment.
- An owner gate line before 9.5 in `docs/build-plan.md`.

**Left out, and the task that brings it**
- The real run of the drill: the owner (production, money), before the gate line goes.

**Open for the owner**
- `docs/restore.md` parts A and B on the live app; the four lines on issue #9; then delete the gate line before 9.5.

**What the next sessions must know**
- For 9.5: copy the four lines of the drill from issue #9 into the record table of `docs/restore.md`.
- A copy's counts are compared with the live side by `db:counts -- --until <the copy's newest row>`; a deleted draft lowers only the live `orders`.
- `restoreCopy()` takes `{ restore }` in place of `pg_restore`, as `databaseCopy()` takes `dump`.
- A test never makes a new bucket: the local SeaweedFS runs out of volumes (HTTP 500 everywhere). Use `TEST_BUCKET` / `TEST_BACKUP_BUCKET`.

## 4.10c The Finance step switch (25.10.2026, pull request #162)

**Built**
- Migration 0054: `orders.skipped_finance`, CHECK `orders_skipped_finance_status_check`, trigger `money_rows_not_skipped`, `settings_finance_step_check`, enum value `CLOSE_SKIPPED`.
- `switchFinanceStep` (Head, own confirmation, audit row) on /settings with the waiting orders listed; refused while any order waits for Finance or settlement, under `SETTINGS_LOCK`, which the Principal's approval takes shared (`src/server/settings.ts`).
- State machine: the Principal's Approve goes to Open with the step off (`toWhenFinanceOff`, `skipsFinance`); `CLOSE_SKIPPED` (`request.close_skipped`); Close (exact match) and Send to settlement refuse a skipped order.
- Skipped orders: no money rows, left out of every cash reader, Cash needed soon 0; moved whatever was bought in cash; overspend notice at their Close; stepper, History, Excel and PDF read "Skipped"; no Money tab.
- No Finance vacancy warning or notice while the step is off.

**Left out, and the task that brings it**
- Nothing of the Build line.

**Open for the owner**
- Decided items 2 and 5 (Look first) on issue #9.

**What the next sessions must know**
- A move that reads a setting: read it in the action's `facts` step under the setting's lock and carry it in `MoveInput` (`LockedOrder.financeStep`).
- A browser test that changes a school-wide setting other tests read runs as the teardown project `finance-step` of `start` (playwright.config.ts); add such a spec to that project, never to the two widths.
- Tests that need a skipped order: `tests/helpers/finance-step.ts` (`openedSkipped()`, `setFinanceStep()`).

## 1.12b Managers add products and subtypes while ordering (25.10.2026, pull request #165)

**Built**
- Migration 0055: enum value `ADD_PRODUCTS`; `added_by`, `checked_at` on `products` and `product_variants` with CHECK `*_checked_at_check` and FK indexes.
- Permission `catalog.add` (global, Head and Manager, right `ADD_PRODUCTS`); a global rule may carry a `right`, read by `decide()`/`decideList()`; `actorMay()` for screens.
- `addProductWhileOrdering`, `addSubtypeWhileOrdering` (`addSubtypeFromSearch()` in subtypes.ts: the default renamed to the existing items' name, the new name a new row holding the client key), `markAddedChecked`; query `listUncheckedAdded`; `findTaken()` of the catalog factory.
- The product search's Add line and `AddCatalogEntryDialog`; the Head's home block "Added by Managers"; the tenth switch; `suggestProduct`, `/suggestions/new` and the Manager's link removed.
- Build (6), D64: the Head's first subtype on the catalog page names the existing items too (`createSubtype` takes `existingName`); `listAddChoices()` with no cap.

**Left out, and the task that brings it**
- Nothing of the Build line.

**Open for the owner**
- Decided items 1 to 4 (Look first) on issue #9; item 1 includes the permission review's question whether a Manager with `CREATE_REQUESTS` off may still add.

**What the next sessions must know**
- Tests that need a pending suggestion: `insertSuggestion()` of `tests/helpers/suggestions.ts` (no action writes one any more).
- A name the catalog already holds is answered with `findTaken()` under the table's lock, never a JavaScript comparison.
- A browser test that turns a Manager's right off makes its own Manager (`newScene()`).

## 1.12c The Head's first subtype names the existing items; adding needs both rights (26.10.2026, pull request #168)

**Built**
- Part (1) was on `main` already (1.12b Build 6): nothing rebuilt. The 04 rule 1 database test now also holds the photo, the price rows and "black" with no stock.
- `alsoRight` on global permission rules, read in `decideGlobal()`; `catalog.add` needs `ADD_PRODUCTS` and `CREATE_REQUESTS` (D66). The oracle `tests/permission-matrix-expected.ts` carries it; `describePermissionMatrix` writes a switched-off case per right.
- The `ADD_PRODUCTS` "off" text says it works only while "Add and submit orders" is on, in uz, ru and en.

**Left out, and the task that brings it**
- Nothing of the Build line.

**Open for the owner**
- Decided items 1 and 2 (Look first) on issue #9.

**What the next sessions must know**
- A permission guarded by two Manager rights: `right` and `alsoRight`, in `permissions.ts` and in the oracle both; every test reading rights reads both.

## 2.5c The order sheet (26.10.2026, pull request #169)

**Built**
- The drafts grid is the order sheet: six cells (product with type and stock under it, department, quantity with measure, price, needed-by, total), the branch only for several branches, the rest under "More" (`tr[data-more-of]`); no word "Draft".
- The add row copies branch, department and needed-by date of the last row (`copiedFromAbove()`), and has a needed-by field.
- `submitReadyDrafts` / `submitReadyDraftsAction`: Submit with nothing ticked sends the ready own drafts of the submit set (`listDrafts().submitSet`), the first 200; the rest stay, marked live and listed on top. `submitSelection()`, `shownFacts()`, `isReady()` in `src/domain/submit-checks.ts`.
- The order-action wrapper's `leave` and `leftOnRepeat` steps; `ordersInput(shape, { max })`; the machine's check in chunks of 200.

**Left out, and the task that brings it**
- The simpler order page: task 2.9b.

**Open for the owner**
- Decided items 1, 2, 3, 7 and 11 (Look first) on issue #9.

**What the next sessions must know**
- An action that sends part of what it was given uses the wrapper's `leave` step; its repeat answer needs `leftOnRepeat`.
- Fields under "More" are reached in browser tests through `[data-more]` and `tr[data-more-of="<id>"]` (`openMore()` in `tests/e2e/drafts.spec.ts`).
- A modal dialog hides the page from role queries: wait for it to close before counting rows.

## 2.9b A simpler order page (26.10.2026, pull request #170)

**Built**
- The top line `[data-top-line]` for every reader: who acts next and since when (`orders.page.top.*`), from `OrderPage.waitingFor` and `waitingSince` (the SQL `enteredCurrentStatusAt`, the stuck filter's own).
- `waitingFor(status, open?)`: a finished Open order that skipped Finance, whose owner may not close alone, waits for the Head; without `open` the 06 Statuses column as before (reminders unchanged).
- `mainAction()` in `src/domain/main-action.ts`: the one primary button of the bar; the rest under "More" (`[data-bar-more]`, a disclosure); no action, no bar.
- `PlanActualBlock` (`plan-actual-block.tsx`): the labels beside its title from Open on, the planned total until something counted is bought, then the table; the totals strip is gone.
- The stepper `[data-stepper]` heads the History tab; Details leaves out empty fields and a service's stock lines.

**Left out, and the task that brings it**
- Nothing of the Build line.

**Open for the owner**
- Decided items 1 to 6 (Look first) on issue #9; item 5 carries a proposed `/spec-change` of 11 Order page layout 2.

**What the next sessions must know**
- A browser test reaches a page-bar action through `barAction()` / `openMore()` of `tests/e2e/order-bar.ts`: only the main action is visible until "More" opens.
- The stepper is read on `?tab=history`.
- A new page action is added to `PageAction` and, if it may come first, to `MAIN_FIRST` of `main-action.ts`, with its row in `main-action.test.ts`.

## 2.5d-a Fields the Head sets: every field but the price (26.10.2026, pull request #173)

**Built**
- `order_fields` (`src/domain/order-fields.ts`): ten fields, how each is asked and where it stands; defaults of 05's table; CHECK of migration 0056; the "Order fields" block on /settings (`order-fields-form.tsx`), saved by `saveSettings` with its audit row.
- `submitRefusals(facts, today, fields)`: required-ness from the setting; a never-numbered draft's hidden field is not checked. Submit reads the setting under `SETTINGS_LOCK_SHARED` (`readSubmitSettings`) and writes hidden values (`withHiddenValues`); a numbered order keeps what it holds.
- The sheet's cells follow the setting: `sheetColumns`, `rowFields`, `moreFields`, `SHEET_COLUMN_OF` (`grid-rules.ts`); `fields` in the grid context; the add row hides or relaxes department and needed-by.
- Drafts without a department (create and update), merged as one trio (`orders_one_draft_no_department_key`); Give straight to requester refused without a department (`errors.field.noDepartment`).
- Lists, downloads, home, reminders, analytics and reports read an empty department or date; the analytics tables take them.

**Left out, and the task that brings it**
- The price optional or hidden, unpriced orders everywhere, the counts of unpriced orders, the Finance switch refusals, S24: task 2.5d-b.
- "No department" in analytics and reports by department (D68, merged during this task's finish) with its drill-down filter: task 2.5d-b.

**Open for the owner**
- Decided items 1 to 5 (Look first) on issue #9.

**What the next sessions must know**
- For 2.5d-b: `PRICE_ASK_CHOICES_NOW` (`order-fields.ts`) holds the price at Required; widen it and the server check of `saveSettings` together. `writePlan` already leaves `planned_total` empty when the price is; `withHiddenValues` has no price yet.
- Tests set the setting with `setOrderFields()` of `tests/helpers/order-fields.ts`; `insertOrder` takes `departmentId: null` and `neededBy: null`.
- The Playwright project `order-fields` runs after `finance-step` (its teardown): a browser test that changes a school-wide setting goes there.

## 2.5d-b Fields the Head sets: the price (26.10.2026, pull request #174)

**Built**
- Price optional or hidden on /settings only while the Finance step is off (`priceAskAllowed()`, `saveSettings` check); the switch on refused while the price is not required or an unpriced order waits for Head or Principal (`financeStepBlockers()`), the orders listed on /settings.
- A hidden price stores `suggestedPrice()` at submit (`withHiddenValues(..., suggested)`); Cancel without a price.
- An order without a planned price everywhere it is worked on: `orderTotal()`/`plannedCash()` null, `ordersTotals().unpriced`, colours "unpriced", `planVsActual()` nulls, no overspend; lists, order page, home, approve dialog, purchase form, download (Excel and PDF) show "No planned price" or "N without a price".
- Migration 0057: `analytics_orders.planned_cash` nullable; the refresh writes no outcome and no planned cash for an unpriced order. S24 as a database and a browser test.

**Left out, and the task that brings it**
- "No department" in analytics and reports, and "N without a price" beside their sums: task 2.5d-c.

**Open for the owner**
- Decided items 1 to 7 and 9 (Look first) on issue #9. A submitted order without a department cannot be copied as new (`trioOf()` of `copy-as-new.ts`, from 2.5d-a): named in the report.

**What the next sessions must know**
- For 2.5d-c: `ordersTotals().unpriced` and `analytics_orders.planned_cash IS NULL` count the unpriced orders; `usePlannedSum()` / `getPlannedSum()` word a sum with its count.
- A planned price is `bigint | null` from the database on: never `price!`; a known-priced plan is a `PricedPlan`.
- Tests: `insertOrder({ plannedPrice: null })`, `atPrincipal(s, { price: null })`, `bought(scene, { plannedPrice: null })`.


## 2.5d-c Fields the Head sets: analytics and reports (27.10.2026, pull request #175)

**Built**
- `department=none` (`NO_DEPARTMENT`, `departmentWhere()` in every `*-where.ts`); "No department" in Spending by department (Head, Principal), the Spending report, the filter bar, the Excel and PDF filter line.
- `orderEnd()` (`colours.ts`); `analytics_unpriced` (migration 0058) written by the refresh; `outcomesWhere(…, table)`.
- `cashNeeded()` null for an order the cash sum leaves out for lack of a price; `analytics_orders.cash_needed` nullable (migration 0059).
- "N without a price" with its change and its list: Plan vs actual (Head, Finance; whole, branch, Manager), the Managers block (orders count both), the Planned vs actual report, the Order register, Cash needed soon, My estimates; in Excel and the PDF.
- Drill keys `unpriced`, `needed:…:unpriced`, `priced:…:unpriced`.

**Left out, and the task that brings it**
- A "No department" choice in the order list's own filter (`/orders`): no task names it.

**Open for the owner**
- Decided items 1 to 7, 16 and 17 (Look first) on issue #9.

**What the next sessions must know**
- A new analytics condition reads the department through `departmentWhere()`, never `eq(…, filters.department)`: `none` is not a uuid.
- A planned sum of analytics says its count with `unpricedLine()` (Excel) and `orders.unpriced.count` (screen).
- Tests: `decided(scene, status, moves, { departmentId: null, plannedPrice: null })`.

The next task is 9.5.
