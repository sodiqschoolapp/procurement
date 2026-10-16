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

The next task is 2.6.
