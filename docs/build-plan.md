# Build plan

The whole project as ordered tasks. One task is one Claude Code session and one pull request. Work top to bottom, in the order of this file; a task may start only when every task above it is ticked. The loop of `docs/cloud-loop.md` builds them: the start routine takes the first unticked task.

## How to read a task

- **Read**: the spec files to read first, with the headings that matter, all under `docs/spec/`. Every task also reads `edge-cases/00-definitions.md` and `open-questions.md`. A task with a migration also reads `edge-cases/developer-rules.md` and `14-data-model.md`.
- **Build**: what exists when the task is finished. Nothing outside it is built.
- **Done when**: a test, or a thing the owner can try by hand. A scenario named S1 to S18 is in `15-quality-and-acceptance.md`.
- A task that turns out too large is split by the builder into a, b, c in this file, in the task's own pull request; the first part is planned and built, and the split is flagged **Look first** on issue #9. Nothing waits for a confirmation.
- A task that names an open question uses the owner's answer under "Decided ahead" in `docs/decisions.md`. Where no answer came, the builder takes the most reasonable reading and flags it **Look first** (D20, D26). The owner's reviewer prepares each phase's questions while the phase before it runs.
- A fix task `<id>b` (for example `1.3b`) is added by the owner when a decision made without the owner is changed on issue #9 and code must change. It is placed first among the open tasks, so the start routine takes it next; its Read line names the decision it changes.
- One owner gate stands before task 9.4, where the live system, real data and secrets start: a quoted line that begins with the words "Owner gate." in bold. The start routine starts nothing after it until the owner deletes that line.
- A second, temporary owner gate stands before task 2.1 (D42): the owner is redesigning requests as items in a branch order list, and Phases 2 to 4 are rewritten by a `/spec-change` before they are built. The owner deletes it with that change.
- Tick a task only in `/finish-task`.

## Phases

| Phase | Tasks | What works afterwards |
| --- | --- | --- |
| 0. Foundations | 17 | Nothing a user can use yet. |
| 1. Catalogs and admin | 13 | Everything the Head sets up before the first request can be written. |
| 2. Requests to approval | 15 | From an empty draft to a fully approved request, with its number, its history and its PDF. |
| 3. Purchasing | 9 | The Manager records what was really bought. |
| 4. Money and settlement | 11 | Cash given, cash spent, the difference, and the close. |
| 5. Warehouse | 13 | Stock screens and every document that moves stock inside one branch. |
| 6. Home, analytics, reports | 10 | What each role sees first, and the numbers behind the work. |
| 7. Transfers and counts | 4 | Stock moving between branches, and stock checked against the shelf. |
| 8. Jobs and polish | 4 | The scheduled work, and a pass over every screen. |
| 9. Before go-live | 6 | Proof that it works, then the real environment and the real data. |
| **Total** | **102** | |

## Phase 0: Foundations

Nothing a user can use yet. These tasks build the places where the rules live: the test helpers, the constraint style, the permission guard, the action wrapper. No product task starts before 0.15 is ticked.

- [x] **0.1 Repository skeleton**
  - **Read:** `13-technology.md` (Stack); `01-summary.md` (Quality bar); `16-build-order.md` (phase 0 row); `17-later-ideas.md` (whole file: what must not be built); `sources.md` (versions checked).
  - **Build:** A Next.js 16 App Router project in TypeScript strict mode with ESLint, Prettier, Tailwind CSS and shadcn/ui; the folder layout from `CLAUDE.md`; the npm scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`; `.env.example` with names only; Vitest and Playwright with one sample test each; `README.md` filled in (what the project is, how to run it).
  - **Done when:** `npm run dev` shows a start page; `npm run lint`, `npm run typecheck` and `npm test` pass on a clean clone.

- [x] **0.2 Database and migrations**
  - **Read:** `13-technology.md` (Database; Database access); `edge-cases/developer-rules.md` (rules 5, 6, 10, 11); `14-data-model.md` (first paragraph; System: settings).
  - **Build:** `docker-compose.yml` with PostgreSQL 17; Drizzle ORM with SQL migrations in `drizzle/`; `npm run db:migrate`; the database client; the test-database helper (a real PostgreSQL, clean state for every test file); the constraint style written once in `docs/decisions.md` (UUID ids, `created_at`, PostgreSQL enums, `bigint` money, `numeric(14,3)` quantities, UTC timestamps); the first migration creates the `settings` table.
  - **Done when:** `docker compose up -d` then `npm run db:migrate` works on an empty database; a database test writes and reads a settings row; the helper leaves no rows behind.

- [x] **0.3 CI**
  - **Read:** `15-quality-and-acceptance.md` (Test layers; Done-check for every phase); `edge-cases/developer-rules.md` (rule 14); `docs/decisions.md` (Decided ahead: task 0.3); `docs/cloud-loop.md` (The loop; section 7).
  - **Build:** A GitHub Actions workflow, `.github/workflows/ci.yml`, on every pull request and on `main`, with two jobs named `checks` and `e2e`: install, the audit of the production dependencies, lint, typecheck, unit tests, database tests against the PostgreSQL of `docker-compose.yml`, migrate on an empty database, the check that the schema files and the migrations agree, the check that no merged migration was edited, and the Playwright smoke test. The two guards against a migration skipped in silence: a test that the time stamps of the migration journal ascend, and the count check in `scripts/apply-migrations.mjs`. The seed step is switched on in 0.14 and the translation check in 0.5.
  - **Done when:** The pull request of this task shows both checks green. The report links one run where a deliberately failing test turned the check red; that test is gone from the final diff. The owner merges this pull request by hand, then makes the two checks required (`docs/cloud-loop.md`, section 7).

- [x] **0.16 Test copy: the app online at the test address**
  - **Read:** `18-hosting-and-costs.md` (whole file); `13-technology.md` (Running it); `02-assumptions.md` (A12); `sources.md` (hosting pages); `docs/decisions.md` (D22; Decided ahead: task 0.16).
  - **Build:** Moved forward from 0.15 (D22). A Dockerfile for the app; a health route that answers only when the database answers and names the commit it runs; the DigitalOcean App Platform spec for the test copy, kept in the repository (1 GiB container, development database, Frankfurt, a new version on every push to `main`, migrations run before the new version starts, the address `ombor-test.sodiqschool.uz`); a CI step that builds the image, starts it against the CI database and calls the health route; `docs/deploy.md`: the owner's steps in the DigitalOcean and DNS dashboards, one by one, and every environment variable by name with the place where the owner types it. No secret enters the repository, a pull request or a chat.
  - **Done when:** CI builds the image and the health route answers there. After the owner's steps of `docs/deploy.md`: a merged pull request reaches `https://ombor-test.sodiqschool.uz` without manual steps, and the start page opens there.

- [x] **0.4 Clock, ids and test helpers**
  - **Read:** `edge-cases/developer-rules.md` (rules 8, 10); `15-quality-and-acceptance.md` (Test layers); `edge-cases/requests-and-approval.md` ("The year changes").
  - **Build:** One clock provider used everywhere (`now()`), with business-date helpers for `Asia/Tashkent`; the browser-side `client_key` generator; test helpers to set the clock, to make invented users and branches, and to run two actions at the same moment; a check that fails when `new Date()` or `Date.now()` is called outside the clock module.
  - **Done when:** Unit tests: 20:30 UTC on 31 December is 1 January as a Tashkent business date; a test sets the clock and reads it back; the forbidden-call check fails on a sample file and passes on the codebase.

- [x] **0.5 Languages and formats**
  - **Read:** `02-assumptions.md` (A2); `13-technology.md` (Languages); `11-screens-and-ux.md` (Rules for a smooth feel: 10, 14); `15-quality-and-acceptance.md` (Done-check for every phase).
  - **Build:** next-intl with `uz`, `ru` and `en` message files; the user's `locale` decides the language and Uzbek is the default; no language in the address; formatters for money (`1 250 000 so'm`), dates (`08.10.2026`), 24-hour Tashkent time and quantities without trailing zeros; a script that fails when a key is missing in any of the three files, run in CI; a lint rule against literal text in screens.
  - **Done when:** Unit tests of the four formatters; removing one key from `ru` turns CI red; the start page shows in all three languages.

- [x] **0.6 Sign-in and sessions**
  - **Read:** `02-assumptions.md` (A8); `13-technology.md` (Login); `edge-cases/developer-rules.md` (rule 13); `11-screens-and-ux.md` (Screens: Login); `edge-cases/system.md` ("The session ends in the middle of a form").
  - **Build:** Better Auth with its username plugin, a placeholder email, public sign-up off and sessions in the database; the extra `users` columns (`full_name`, `phone`, `role`, `locale`, `is_active`, `last_login_at`); the `/login` page and sign out; a session ends 24 hours after sign-in and several devices can be signed in at once; 5 tries per 15 minutes; httpOnly, secure, sameSite cookies; after sign-in the user lands on the page they asked for; an inactive user cannot sign in; users have no change-password screen; there are no password rules, so any password that is not empty is accepted and the library's default minimum length is switched off; a script that creates the first Head with a password typed at the prompt.
  - **Done when:** Tests: the right password signs in; the 6th wrong try inside 15 minutes is refused; with the clock moved 24 hours and 1 minute the session is refused; an inactive user is refused; a one-character password signs in; two devices stay signed in together. By hand: open a deep link signed out, sign in, land on that page. The login page shows in all three languages.

- [x] **0.7 Permissions and the branch wall**
  - **Read:** `03-roles-and-permissions.md` (whole file); `edge-cases/developer-rules.md` (rule 4); `14-data-model.md` (branches, user_branches, manager_rights); `15-quality-and-acceptance.md` (Test layers: Database); `edge-cases/requests-and-approval.md` ("The branch's Principal changes while requests wait").
  - **Build:** The tables `branches`, `user_branches` and `manager_rights` with their constraints (no rows for the Head, exactly one for a Principal, a partial unique index for one active Principal per branch); the single `authorize()` function with the permission matrix as data, including the Manager-right check; the branch filter helper for SQL lists; "Not found" for another branch; the permission-matrix test generator (action × role × own branch and other branch) that every later task adds its actions to.
  - **Done when:** Database tests: a second active Principal in one branch is refused by the database; `authorize()` gives the matrix answer for one sample action per role; a Manager with a right switched off is refused; the list helper returns only own-branch rows.

- [x] **0.8 Server-action foundations**
  - **Read:** `edge-cases/developer-rules.md` (rules 3, 8, 9, 13, 15); `11-screens-and-ux.md` (Rules for a smooth feel: 4, 6, 7); `edge-cases/requests-and-approval.md` ("Submit is clicked twice"; "Two approvers click at the same moment").
  - **Build:** The wrapper every write uses: the Zod input check first; then, inside one transaction, the fixed order of rule 3: check permission with `authorize()`, lock the rows, check status and version, write, add the history event, add notifications; safe repeats by `client_key`; typed errors that carry a plain-words message key; the client helper for loading, success and error states. There is no REST API.
  - **Done when:** Database tests with a sample action: a step that throws leaves nothing saved; the same `client_key` twice writes once and returns the first result; an old version is refused with its message; invalid input never reaches the handler.

- [x] **0.9 Audit log**
  - **Read:** `14-data-model.md` (System: audit_log); `edge-cases/developer-rules.md` (rule 13); `03-roles-and-permissions.md` (Manager rights: third bullet); `04-catalogs.md` (Rules: 9).
  - **Build:** The `audit_log` table; an `audit()` helper that writes actor, action, entity, before and after inside the caller's transaction; a reusable change-history component that lists the audit rows of one entity.
  - **Done when:** Database tests: a change and its audit row commit together and roll back together; before and after hold the old and the new values.

- [x] **0.10a Design system and shared parts** (split from 0.10 in pull request #20)
  - **Read:** `11-screens-and-ux.md` (Screens; Interface per role; Rules for a smooth feel: 1, 4, 5, 11, 12, 13, 15); `10-notifications-analytics-reports.md` (Home page per role); `edge-cases/00-definitions.md` (People and places); `docs/design-system.md` (all of it); `docs/decisions.md` (D23, D25).
  - **Build:** the tokens of the light and dark themes in `src/app/globals.css` with `tests/contrast.test.ts`; the theme following the device, a chosen theme kept in the browser; Golos Text and Bitter from the app's own files; Material Symbols Rounded icons; the button sizes and kinds; fields, the select and the segmented control; the status-label component; skeleton placeholders; the empty-state component (brand moment); toasts; the confirm dialog; the unsaved-changes guard; the sign-in page as a brand moment with the theme button; the browser and home-screen icons of `public/brand/`.
  - **Done when:** `tests/contrast.test.ts` passes for every pair of both themes; Playwright at 375 px and 1440 px: the sign-in page in its brand look (navy panel only on desktop), Bitter on its title and Golos Text on its fields, the theme following the device and the theme button's choice kept after a reload; Bitter draws every letter of "Oʻgʻil, Ўзбекистон, Қашқадарё, Ғулом, Ҳамид" (browser check); unit tests of the button (with its loading state), the fields, the segmented control, the status label, the empty state, the confirm dialog, the toasts and the generated icon file.

- [x] **0.10b App shell, menu per role and profile** (split from 0.10 in pull request #20)
  - **Read:** `11-screens-and-ux.md` (Screens; Interface per role; Rules for a smooth feel: 1, 4, 5, 11, 12, 13, 15); `10-notifications-analytics-reports.md` (Home page per role); `edge-cases/00-definitions.md` (People and places); `docs/design-system.md` (all of it); `docs/decisions.md` (D23, D25).
  - **Build:** the layout with the navy sidebar (on-dark logo, collapsible to the rail) on desktop and the bottom tab bar on phones; the top bar with the branch switcher ("All my branches") and the space for search and the bell; the menu per role from one config, with pages a role cannot use absent; `/profile` with the language choice and the theme switch; an empty home page per role at `/`; the CI container step that reads the commit from `/` moves with it; the small button and the small icon button 44 high at phone width (`docs/design-system.md`, Buttons, changed on 14.10.2026 after 0.10a was built).
  - **Done when:** Playwright at 375 px and 1440 px: each of the four roles sees exactly its menu items in the spec's order; the Principal has no Admin and no Money; changing the language on `/profile` changes the menu at once; in the collapsed rail the current item is its icon on the solid orange fill. Unit test: a small button is 44 high at phone width and 32 from the `sm` width up.

- [x] **0.11 Notifications**
  - **Read:** `10-notifications-analytics-reports.md` (Notifications); `14-data-model.md` (System: notifications); `11-screens-and-ux.md` (Screens: Notifications, profile).
  - **Build:** The `notifications` table; a `notify()` helper that writes type, params and link inside the caller's transaction; the bell with its unread count; the `/notifications` list; mark as read; texts come from the translation files by type.
  - **Done when:** Database test: a rolled-back action leaves no notification. By hand: a development-only script gives the first Head one notification; the bell shows 1, opening it follows the link and the count falls to 0.

- [x] **0.12 File storage**
  - **Read:** `13-technology.md` (Files); `04-catalogs.md` (Rules: 6); `07-purchasing.md` (Purchase record: Receipt); `edge-cases/developer-rules.md` (rule 13); `14-data-model.md` (files); `edge-cases/system.md` ("A phone photo is very large").
  - **Build:** The storage service in `docker-compose.yml` (moved from 0.2); the `files` table; an S3 client for MinIO locally and R2 in the cloud; a private bucket; the upload route: JPG, PNG, WebP or HEIC up to 10 MB, PDF where a task allows it, checked by content and not by name; sharp makes the 160 px and 1200 px versions; the browser shrinks a large photo before upload; a download route that refuses a signed-out visitor and calls `authorize()` for the record the file belongs to; each later task that attaches files adds its check.
  - **Done when:** Tests: a text file renamed `.jpg` is refused; an 11 MB file is refused; one upload produces both sizes; a signed-out request for a file address is refused.

- [x] **0.13 Scheduler**
  - **Read:** `13-technology.md` (Scheduled jobs); `edge-cases/developer-rules.md` (rule 10).
  - **Build:** The scheduler inside the app; every job takes a database lock so it never runs twice at once; a job registry with name, schedule and last run; it uses the injected clock; one heartbeat job.
  - **Done when:** Database test: two scheduler instances started together run the heartbeat once per tick; the last run is recorded.

- [x] **0.14 Seed data**
  - **Read:** `edge-cases/developer-rules.md` (rule 14); `15-quality-and-acceptance.md` (Done-check for every phase); `16-build-order.md` (phase 0 row).
  - **Build:** `npm run db:seed`: 2 branches with invented names (one has the code `CHL`), one user per role with invented names, passwords read from the local `.env`; safe to run twice; CI runs migrate and seed on an empty database. Later tasks extend the seed.
  - **Done when:** The CI step is green. By hand: sign in as each of the four seed users and see a different empty home page.

- [x] **0.15 Test copy: file storage and seed users**
  - **Read:** `18-hosting-and-costs.md` (whole file); `13-technology.md` (Files; Running it); `02-assumptions.md` (A12); `docs/deploy.md`; `docs/decisions.md` (D22).
  - **Build:** What the test copy of 0.16 still lacks, now that file storage (0.12) and the seed (0.14) exist: the R2 bucket of the test copy and its variables, and the seed users on the test copy; `docs/deploy.md` gains the owner's steps for both and the new variable names. The owner types every secret in the provider dashboards; no secret enters the repository or the chat.
  - **Done when:** After the owner's steps: the four seed users can sign in at the test address, and a photo uploaded there is shown again.


## Phase 1: Catalogs and admin

Everything the Head sets up before the first request can be written.

- [x] **1.1 Settings**
  - **Read:** `14-data-model.md` (System: settings; Notes for the build: settings keys); `11-screens-and-ux.md` (Screens: Settings; Rules for a smooth feel: 15); `08-money-and-settlement.md` (Overspend guard); `10-notifications-analytics-reports.md` (Analytics page per role: 1).
  - **Build:** A typed settings accessor with the keys and defaults the spec lists: `default_payment_type` (Cash), `price_hint_percent` (20), `overspend_guard_percent` (10; 0 and off), `reminder_hours` (24), `escalation_hours` (48), `receipt_required_for_cash` (false), `school_name`, `school_year_start` (no default); the `/settings` screen for the Head; every change audited.
  - **Done when:** Database tests: the defaults come back on an empty table; only the Head can write; a change writes an audit row. By hand: set the school name and see it in the shell.

- [x] **1.2 Branches**
  - **Read:** `04-catalogs.md` (Catalogs table: Branches; Rules: 2, 3, 9); `14-data-model.md` (branches).
  - **Build:** `/branches` for the Head: name, code (2 to 4 Latin capital letters, unique), address, active; deactivate instead of delete; change history. The code lock after the first request is wired in 2.7; the block on closing a branch is 5.13.
  - **Done when:** Tests: a lower-case code and a 5-letter code are refused; a duplicate code is refused by the database; a Manager cannot open the screen.

- [x] **1.3 Users**
  - **Read:** `03-roles-and-permissions.md` (Roles table; Rules: 2, 3, 4, 5); `02-assumptions.md` (A3, A5, A8); `04-catalogs.md` (Catalogs table: Users); `10-notifications-analytics-reports.md` (Notifications: "Branch has no active user for a role"); `edge-cases/requests-and-approval.md` ("An approver is on holiday"; "A user is deactivated with work waiting"; "The branch's Principal changes while requests wait"); `13-technology.md` (Login).
  - **Build:** `/users` for the Head: create a user with full name, username, phone, role, branches, language and a password that the Head types or has generated; renew any user's password the same way; a renewal signs that user out on every device at once; a new password is shown to the Head at that moment only; edit the other fields; deactivate; one role per account; a Principal has exactly one branch; replacing a branch's Principal with an acting Principal in one action; the last active Head cannot be deactivated; a warning and a notification when a branch has no active Manager, Principal or Finance user; every change audited and shown as change history.
  - **Done when:** Database tests: the last Head cannot be deactivated; a second active Principal is refused unless it is a replacement; deactivating the only Finance user of a branch creates the notification; only the Head can renew a password, and a user has no way to change their own; after a renewal the old password is refused, the new one signs in, and a session opened before the renewal is refused; the audit row of a renewal holds no password; a generated password signs in.

- [x] **1.4 Manager rights**
  - **Read:** `03-roles-and-permissions.md` (Manager rights the Head can switch); `02-assumptions.md` (A13); `10-notifications-analytics-reports.md` (Notifications: "A Manager's right is switched on or off"); `edge-cases/requests-and-approval.md` ("A Manager's right is switched off in the middle of a task").
  - **Build:** The nine switches on a Manager's user page, all on by default; every change audited and the Manager notified; the permission-matrix test gains the "right off" cases.
  - **Done when:** A database test for each of the nine codes: off means `authorize()` refuses that action for that Manager in every branch and still allows the Head. By hand: switch one off and the Manager gets a bell notice.

- [x] **1.5 Measures, categories, extra cost types, companies**
  - **Read:** `04-catalogs.md` (Catalogs table: Measures, Categories, Extra cost types, Companies and brands; Rules: 2, 3, 9); `14-data-model.md` (units, categories, companies, extra_cost_types).
  - **Build:** Four catalog screens under `/catalog/...` built on one shared catalog component: list with search, add, edit, deactivate; names unique ignoring capital letters and extra spaces; inactive entries leave the pickers and stay in old records; change history.
  - **Done when:** Tests: " Paper " and "paper" clash; a deactivated entry is absent from the picker query and present in the list; only the Head can write.

- [x] **1.6 Departments**
  - **Read:** `04-catalogs.md` (Catalogs table: Departments; Rules: 3); `02-assumptions.md` (A6); `14-data-model.md` (departments).
  - **Build:** Departments per branch with the responsible person's name and phone as plain text; the name is unique inside a branch; deactivate; change history.
  - **Done when:** Tests: the same name in two branches is allowed; twice in one branch is refused.

- [x] **1.7 Products and services**
  - **Read:** `04-catalogs.md` (Catalogs table: Products and services; Rules: 1, 2, 3, 6); `02-assumptions.md` (A7); `14-data-model.md` (products); `edge-cases/00-definitions.md` (Catalog).
  - **Build:** `/catalog/products`: name, type (product by default, or service), category, measure, photo, default brand or company, reference price, description, active; type and measure lock after first use (the lock is wired in 2.5 and 5.8); change history; the list has search, category and type filters and 25 rows per page.
  - **Done when:** Tests: a new item is a product unless service is chosen; a duplicate name is refused. By hand: add a product with a photo and see the small version in the list.

- [x] **1.8 Subtypes**
  - **Read:** `04-catalogs.md` (Catalogs table: Subtypes; Rules: 1, 3); `14-data-model.md` (product_variants); `open-questions.md` (question 18).
  - **Build:** Subtypes inside a product: name, own photo, own reference price, active; the hidden "default" subtype of a product without subtypes; adding real subtypes to such a product, as answered in open question 18; change history; names unique inside a product.
  - **Done when:** Database tests: every product has at least one subtype at all times; a product without subtypes shows none on screen and has one row. By hand: the spec's phase 1 check, add a product with subtypes and a photo.

- [x] **1.9 Prices and price history**
  - **Read:** `04-catalogs.md` (Rules: 4); `02-assumptions.md` (A14); `14-data-model.md` (price_history); `03-roles-and-permissions.md` (Permission matrix: "Add a new price for a product").
  - **Build:** The Head adds a new reference price for a subtype with a short note; `price_history` gets a row with source HEAD; a price-history view per subtype; under Admin, a Prices list of every subtype with its current price. The `purchase_id` column gets its foreign key in 3.2.
  - **Done when:** Database test: a new price keeps the old one in the history with who and when; only the Head can add one.

- [x] **1.10 Excel import: products, subtypes, departments**
  - **Read:** `04-catalogs.md` (Rules: 7); `13-technology.md` (Excel and PDF); `16-build-order.md` (phase 1 row).
  - **Build:** The import framework on ExcelJS: template download, upload, a preview with errors per row, saving only when every row is valid, in one transaction; imports for products with subtypes and for departments.
  - **Done when:** Tests: a file with one bad row saves nothing and names the row and the reason; a valid file of 30 products creates 30 products. By hand: the spec's phase 1 check, import 30 products from Excel.

- [x] **1.11 Excel import: prices**
  - **Read:** `04-catalogs.md` (Rules: 4, 7).
  - **Build:** Loading new prices for many subtypes at once through the same framework; each new price is a `price_history` row.
  - **Done when:** Test: 3 prices in one file give 3 history rows and 3 current prices; one unknown product fails the whole file.

- [x] **1.12 Product suggestions**
  - **Read:** `04-catalogs.md` (Rules: 8); `14-data-model.md` (catalog_suggestions); `10-notifications-analytics-reports.md` (Notifications: "Product suggested"); `03-roles-and-permissions.md` (Permission matrix: "Suggest a new product for the catalog"); `edge-cases/requests-and-approval.md` ("The needed item is not in the catalog").
  - **Build:** A Manager sends a suggestion with name, measure as text, photo and note; the Head adds it to the catalog, edited if needed, or declines with a reason; each side is notified.
  - **Done when:** Database tests for both outcomes and their notifications; a Principal cannot suggest.

- [x] **1.13 Seed: catalogs**
  - **Read:** `edge-cases/developer-rules.md` (rule 14).
  - **Build:** The seed gains measures, categories, extra cost types, companies, departments for both branches, and 30 products with subtypes and prices. All names are invented.
  - **Done when:** The seed runs on an empty database in CI. By hand on the test copy: the Head sees 30 products.


## Phase 2: Requests to approval

From an empty draft to a fully approved request, with its number, its history and its PDF.

> **Owner gate.** The start routine stops here until the owner deletes this line. Requests are being redesigned as items in a branch order list (D42); the `/spec-change` that rewrites Phases 2 to 4 deletes this line.

- [ ] **2.1 Domain: request totals**
  - **Read:** `05-order-request-form.md` (Line: fields 9 to 14 and the footer); `08-money-and-settlement.md` (Numbers the system calculates: Planned total; first paragraph on rounding); `edge-cases/developer-rules.md` (rules 1, 6); `13-technology.md` (Numbers).
  - **Build:** Pure functions in `src/domain/`: line total, goods total, extra-cost total, grand total, the split by payment type, and the price-hint percent. decimal.js inside, whole so'm out, rounding half up.
  - **Done when:** Unit tests that name the spec rule each checks, including 100 × 5 000 + 20 000 = 520 000, a 3-decimal quantity that rounds half up, and "+35% vs catalog price".

- [ ] **2.2 Domain: the state machine**
  - **Read:** `06-approval-workflow.md` (Statuses; Allowed moves; Rules: 1 to 7); `edge-cases/developer-rules.md` (rule 2); `03-roles-and-permissions.md` (Rules: 6); `open-questions.md` (questions 5, 6).
  - **Build:** One file that lists every status move, who may make it and what it needs; `allowedActions()` for the screen and `assertMove()` for the server.
  - **Done when:** Unit tests: every row of the allowed-moves table passes; every other combination of from, to and role is refused (generated).

- [ ] **2.3 Requests schema**
  - **Read:** `14-data-model.md` (Requests; Notes for the build); `edge-cases/developer-rules.md` (rules 5, 6, 9); `05-order-request-form.md` (Order number).
  - **Build:** Migrations for `number_counters`, `orfs`, `orf_lines`, `orf_line_extras`, `orf_revisions`, `orf_events` and `orf_return_notes` with enums, checks, foreign keys and indexes; `orfs.version`; the empty `stock_balances` table, so the "In stock" column has its source.
  - **Done when:** Database tests try each forbidden write directly: a duplicate number, an unknown status, an extra cost of 0, a negative stock quantity.

- [ ] **2.4 Draft: header and autosave**
  - **Read:** `05-order-request-form.md` (Header; Helpers: Autosave); `06-approval-workflow.md` (Statuses: Draft); `11-screens-and-ux.md` (Screens: Request editor); `edge-cases/developer-rules.md` (rule 11); `03-roles-and-permissions.md` (Manager rights: CREATE_REQUESTS).
  - **Build:** A draft is created at `/requests/new`; the header fields (branch prefilled for a Manager with one branch and locked once lines exist; date; created by; priority with a reason for Urgent; note up to 1000 characters); autosave after each change with "Saved"; the owner deletes a draft that was never submitted; a draft is visible to its owner and the Head only.
  - **Done when:** Database tests: another Manager of the same branch cannot read the draft; Urgent without a reason is refused; a request that has a number cannot be deleted; a Manager with `CREATE_REQUESTS` off cannot create one.

- [ ] **2.5 Draft: lines**
  - **Read:** `05-order-request-form.md` (Line: all 14 fields; Helpers: Price hint); `04-catalogs.md` (Rules: 4); `02-assumptions.md` (A7); `edge-cases/requests-and-approval.md` ("The same item is needed by two departments"; "A delivery fee covers the whole order"); `edge-cases/warehouse.md` ("Half a piece is typed for an item counted in pieces").
  - **Build:** The lines grid on desktop: the product picker (search by name; shows photo, category, type and stock), subtype, in stock (a dash for services), photo, brand or company, requested by (department and optional person), needed by with "apply to all", measure, quantity (decimals follow the measure), the price suggestion (reference price, else last purchase price, else empty), extra-cost rows, payment type (default from settings), comment, line total; the footer totals from 2.1; the price-hint label; one extra reference photo per line. A product used on a line locks its type and measure.
  - **Done when:** Tests: a quantity of 0.5 for an item counted in pieces is refused; the suggested price is the reference price when both prices exist. By hand: add five lines and read the footer split by payment type.

- [ ] **2.6 Draft: keyboard and phone**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 2, 7, 13).
  - **Build:** Tab and Enter move between cells and Enter on the last row adds a row; the totals footer stays visible; on a phone each line is a card; what was typed survives a dropped connection and is retried.
  - **Done when:** Playwright: a three-line draft is built with the keyboard only at 1440 px; the same draft shows as cards at 375 px.

- [ ] **2.7 Submit and the order number**
  - **Read:** `05-order-request-form.md` (Order number; Checks at submit); `06-approval-workflow.md` (Allowed moves: Draft row); `03-roles-and-permissions.md` (Rules: 6); `04-catalogs.md` (Catalogs table: Branches); `10-notifications-analytics-reports.md` (Notifications: "Request submitted or submitted again"); `15-quality-and-acceptance.md` (S14); `edge-cases/requests-and-approval.md` ("Submit is clicked twice"; "A product is deactivated while it sits in a draft"; "The year changes"); `open-questions.md` (question 6).
  - **Build:** The submit action: every check, with errors on the exact cell and a short list on top; the number made inside the transaction with a lock on the counter row (per branch, per calendar year in Tashkent time, growing past 9999); `stock_at_submit` copied; a full snapshot in `orf_revisions`; the event; the notification to the Head; a request created by the Head goes to Waiting for Principal and is logged "Created by Head"; the branch code locks after the first request.
  - **Done when:** Tests: S14; 201 lines refused; the same subtype for the same department twice refused; a past needed-by date refused; with the clock on 1 January the counter restarts at 0001; a double click submits once.

- [ ] **2.8 Requests list**
  - **Read:** `11-screens-and-ux.md` (Screens: Requests list; Rules for a smooth feel: 8); `06-approval-workflow.md` (Statuses); `05-order-request-form.md` (Header: Priority); `03-roles-and-permissions.md` (Permission matrix: "See requests, stock and reports").
  - **Build:** `/requests`: 25 rows per page from the server; filters by status, branch, owner and date, and sorting, kept in the address; status labels; Urgent pinned on top for approvers; the branch filter is inside the SQL.
  - **Done when:** Database test: each role sees only its branches' requests and nobody else's drafts. By hand: a filtered link reopens the same view.

- [ ] **2.9 Request page**
  - **Read:** `11-screens-and-ux.md` (Request page layout; Rules for a smooth feel: 6); `06-approval-workflow.md` (Rules: 10); `edge-cases/00-definitions.md` (Requests); `05-order-request-form.md` (Helpers: Price hint).
  - **Build:** `/requests/[id]`: the top block, the stepper with the name and time of each finished step, the tabs Items and History (Purchases and Money arrive in 3.4 and 4.3), the price hint on each line for the owner and every approver, the action bar that reads the state machine (its buttons are wired in 2.10 and 2.11), and the line that says who the request is waiting for.
  - **Done when:** Playwright: on a submitted request the stepper stands at Head, History shows the submit with name and time, and a Finance user sees the waiting line.

- [ ] **2.10 Approvals**
  - **Read:** `06-approval-workflow.md` (Allowed moves: the three Approve rows; Rules: 1, 7, 9); `03-roles-and-permissions.md` (Rules: 2, 3); `10-notifications-analytics-reports.md` (Notifications: "Head approved"; "Principal approved"; "Finance approved"); `15-quality-and-acceptance.md` (S8); `edge-cases/requests-and-approval.md` ("Two approvers click at the same moment"; "Stock changes between submit and approval"; "The branch's Principal changes while requests wait").
  - **Build:** Approve at the Head, Principal and Finance steps; each move checks the status inside the transaction; the slower user sees "Already approved by ... at ..."; each line shows stock at submit and stock now; Finance may change a line's payment type while approving; the next step is notified. The cash field of the Finance dialog arrives in 4.2. When a branch's Principal is replaced, waiting requests pass to the new Principal and past approvals keep the old name.
  - **Done when:** Tests: the first half of S8 (two Head users approve together: one success, one clear message); a Principal of another branch is refused; after Finance approves the status is Open. A request waiting for a replaced Principal is approved by the new one, and History keeps the old name on past steps.

- [ ] **2.11 Send back, reject, cancel, take back**
  - **Read:** `06-approval-workflow.md` (Allowed moves; Rules: 2, 3, 4); `02-assumptions.md` (A4); `10-notifications-analytics-reports.md` (Notifications: "Sent back, rejected"); `14-data-model.md` (orf_return_notes); `open-questions.md` (question 5).
  - **Build:** Send back with a reason and optional notes on ticked lines; the returned request is editable by its owner; submitting again raises the revision and returns to the Head; earlier approvals stay in History and no longer count; reject with a reason; cancel by the owner or the Head from any Waiting step or from Sent back; take back before the Head decides; every reason has at least 5 characters; the owner and the Head are notified of a send-back and of a reject.
  - **Done when:** Tests: a 4-character reason is refused; a re-submitted request is at Waiting for Head with revision 2 and the same number; a rejected request refuses every write. Playwright: the owner of a submitted request sees Take back and no Approve; the Head sees Approve, Send back and Reject.

- [ ] **2.12 What changed**
  - **Read:** `06-approval-workflow.md` (Rules: 5); `14-data-model.md` (orf_revisions); `15-quality-and-acceptance.md` (S5).
  - **Build:** On a re-submitted request the approvers see added, removed and changed lines highlighted, with old and new values side by side, computed from the revision snapshots by a domain function.
  - **Done when:** S5 as a Playwright test: the Head sees "100 → 80" highlighted, the same number and "rev 2".

- [ ] **2.13 Copy as new and stale drafts**
  - **Read:** `05-order-request-form.md` (Helpers: Copy as new); `15-quality-and-acceptance.md` (S6, S18); `edge-cases/requests-and-approval.md` ("The catalog price changes after the draft was written"; "A product is deactivated while it sits in a draft"; "The needed-by date passes while the request waits").
  - **Build:** Any request, a rejected one included, is copied into a new draft; a draft keeps its typed price when the catalog price changes and shows the new suggestion as a hint; a line with a deactivated entry is marked; a waiting line past its needed-by date shows "Overdue" and nothing is blocked.
  - **Done when:** S6 and S18 as tests.

- [ ] **2.14 Formal PDF**
  - **Read:** `05-order-request-form.md` (Formal PDF: whole section); `13-technology.md` (Excel and PDF); `15-quality-and-acceptance.md` (S17); `11-screens-and-ux.md` (Request page layout: 4).
  - **Build:** "Download PDF" at every status with @react-pdf/renderer: A4 landscape, fonts for Uzbek and Russian built in, the top block, the lines table, the totals, the approval block with "Waiting" for steps not reached, order number, page count and downloader on every page, the QR code, the grey word on Draft, Rejected and Cancelled, the file name `CHL-26-0142_rev2.pdf`, the language of the downloader, no product photos. Every number comes from the domain functions. The browser's Print button on the request page still gives a quick copy. The actual columns arrive in 4.11.
  - **Done when:** S17 as a test that reads the text of the PDF; a product name in Cyrillic is readable in the file. By hand: print one.

- [ ] **2.15 Requests: branch wall and matrix**
  - **Read:** `03-roles-and-permissions.md` (Permission matrix; Rules: 1); `15-quality-and-acceptance.md` (Test layers: Database; S7).
  - **Build:** Every request action and query is in the permission-matrix test; S7 is a Playwright test; whatever the matrix finds is fixed. The seed gains a few requests in different approval statuses.
  - **Done when:** The matrix covers each request action × each role × own branch and other branch and is green; S7 is green for requests; its stock and report parts are added in 5.2 and 6.8.


## Phase 3: Purchasing

The Manager records what was really bought. Products enter stock at once; services count as used.

- [ ] **3.1 Stock ledger**
  - **Read:** `09-warehouse.md` (first paragraph; Movement types; Stock value); `14-data-model.md` (Warehouse: stock_balances, stock_movements; Notes for the build: first bullet); `edge-cases/developer-rules.md` (rules 5, 7).
  - **Build:** `stock_movements` (append-only) and the full `stock_balances`; one `postMovement()` used by everything that changes stock: it locks the balance row, writes the movement with `balance_after`, and updates quantity and average cost in the same transaction; the moving-average domain function. The foreign keys from movements to purchases and to document lines are added in 3.2 and 5.1.
  - **Done when:** Unit tests of the average formula on a receipt and of the reset at 0. Database tests: a movement that would go below zero is refused by the code and by the CHECK; two movements at the same moment both land with the right `balance_after`.

- [ ] **3.2 Purchases schema and domain**
  - **Read:** `14-data-model.md` (Purchasing and money: purchases, purchase_extras, purchase_files); `08-money-and-settlement.md` (Numbers the system calculates); `07-purchasing.md` (Line progress); `edge-cases/developer-rules.md` (rules 1, 7); `open-questions.md` (question 3).
  - **Build:** Migrations for the three tables, with the foreign keys from `stock_movements` and `price_history` to `purchases`; domain functions for actual quantity, actual goods, actual extra, actual total, difference and line progress.
  - **Done when:** Unit tests with the four cases of the worked example; cancelled records are left out of every sum.

- [ ] **3.3 Record a purchase**
  - **Read:** `07-purchasing.md` (Purchase record; What saving a record does); `02-assumptions.md` (A7); `04-catalogs.md` (Rules: 4); `03-roles-and-permissions.md` (Permission matrix: "Record purchases"; Manager rights: RECORD_PURCHASES); `edge-cases/purchasing-and-money.md` ("The item was free"; "Planned by card, paid in cash"; "Delivery for a bank-transfer item was paid in cash"; "No receipt photo"); `14-data-model.md` (Notes for the build: settings keys).
  - **Build:** The purchase form with every field and rule of the table; "Same as planned"; saving in one transaction: the record, the stock receipt for a product, the last purchase price and a `price_history` row with source PURCHASE, the line progress, the cached `actual_total`, the history event; a service changes no stock and its line shows Used. When `receipt_required_for_cash` is on, a cash purchase needs a receipt. "Give straight to requester" arrives in 5.4.
  - **Done when:** Database tests: a product purchase raises stock by its quantity; a service purchase raises nothing; a price of 0 without a comment is refused; a date before the Finance approval is refused; a failing last step leaves no record and no stock. With `receipt_required_for_cash` on, a cash purchase without a receipt is refused.

- [ ] **3.4 Purchases tab and line progress**
  - **Read:** `07-purchasing.md` (Line progress; Finishing); `11-screens-and-ux.md` (Request page layout: 3); `15-quality-and-acceptance.md` (S4); `edge-cases/purchasing-and-money.md` ("The shop has only part of the quantity"; "The item cannot be found at all"; "More was bought than approved").
  - **Build:** The Purchases tab; the four progress states; "Finish line" and "Not bought" with reasons; reopening a finished line while the request is Open; buying more than planned needs a comment.
  - **Done when:** S4 without the issue: 60 notebooks, then 40; stock 60, then 100; the request stays Open until the second record.

- [ ] **3.5 Substitution**
  - **Read:** `07-purchasing.md` (Substitution); `15-quality-and-acceptance.md` (S10); `edge-cases/purchasing-and-money.md` ("A different colour or size was bought"; "A completely different product is needed").
  - **Build:** The Manager picks the subtype really bought, inside the same product; stock rises for that subtype; the line shows "Substituted"; the closing rules of 4.4 read this.
  - **Done when:** Tests: a subtype of another product is refused; S10 up to the stock check (stock rises for black pens, not for blue).

- [ ] **3.6 Cancel a purchase record**
  - **Read:** `07-purchasing.md` (Fixing a mistake); `09-warehouse.md` (Stock value: third bullet); `10-notifications-analytics-reports.md` (Notifications: "Purchase record cancelled"); `03-roles-and-permissions.md` (Manager rights: CANCEL_PURCHASES); `edge-cases/purchasing-and-money.md` ("A typo in a purchase record"; "A purchase record must be cancelled but the items were already issued"); `open-questions.md` (question 3).
  - **Build:** Cancel with a reason while the request is Open; stock goes down by the same quantity and the average is recalculated; the cancel is blocked when stock would go below zero, and the message names the two ways out; cancelled records stay visible, crossed out; the Head is notified; the request header counts the cancelled records.
  - **Done when:** Database tests: a cancel lowers stock; a cancel after stock was lowered by a test movement is blocked and nothing changes; a Manager with `CANCEL_PURCHASES` off is refused.

- [ ] **3.7 The three colours**
  - **Read:** `08-money-and-settlement.md` (The three colours; Worked example); `11-screens-and-ux.md` (Rules for a smooth feel: 11); `edge-cases/developer-rules.md` (rule 1).
  - **Build:** A domain function that returns Number, Price and Total for a line and for a request (grey while in progress; the worst colour wins); the label component with icon, word and amount; the labels on the lines and in the request header.
  - **Done when:** Unit tests of the four worked-example cases and of "red beats orange, orange beats green". By hand: the Cheaper case shows orange "Left 50 000".

- [ ] **3.8 Buying on a phone**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 3; Interface per role: Manager); `07-purchasing.md` (Purchase record: Receipt).
  - **Build:** The phone layout of the purchase form: one line at a time, large buttons, "Same as planned", and the camera opens directly for the receipt.
  - **Done when:** Playwright at 375 px records a purchase with a receipt file.

- [ ] **3.9 Price prompt for the Head**
  - **Read:** `04-catalogs.md` (Rules: 4); `10-notifications-analytics-reports.md` (Notifications: "Recent purchases differ from the reference price by more than 20%"); `open-questions.md` (question 8).
  - **Build:** When recent purchases differ from the reference price by more than 20%, the Head gets a notification and a prompt that updates the price in one click.
  - **Done when:** A database test written from the answer to open question 8; the one-click update writes a `price_history` row with source HEAD.


## Phase 4: Money and settlement

Cash given, cash spent, the difference, and the close. After this phase a request runs from draft to Closed.

- [ ] **4.1 Money schema and domain**
  - **Read:** `14-data-model.md` (Purchasing and money: money_entries, orf_settlements); `08-money-and-settlement.md` (Money ledger; Exact match; Overspend guard; Worked example); `edge-cases/developer-rules.md` (rules 1, 6, 7); `02-assumptions.md` (A10, A11).
  - **Build:** Migrations for both tables; domain functions for the Manager's cash balance, for the exact match of a line and of a request, and for the overspend percent and whether the guard applies.
  - **Done when:** Unit tests: the four worked-example balances (0, +50 000, −30 000, +50 000); 550 000 on 520 000 is 5.8% and under the guard; Bank transfer, Card top-up and Card money returned never change the balance.

- [ ] **4.2 Finance approval with cash**
  - **Read:** `08-money-and-settlement.md` (When Finance approves); `06-approval-workflow.md` (Allowed moves: Waiting for Finance row); `10-notifications-analytics-reports.md` (Notifications: "Cash given, cash returned, paid back").
  - **Build:** The Finance approval dialog shows the planned totals per payment type and the field "Cash given to the Manager now", prefilled with the planned cash total; the entry is written in the same transaction as the approval; 0 writes no entry.
  - **Done when:** Database tests: an approval with 520 000 creates one Cash given entry and the status Open; a failure rolls back both.

- [ ] **4.3 Money tab**
  - **Read:** `08-money-and-settlement.md` (Money ledger); `03-roles-and-permissions.md` (Permission matrix: "Record money given, returned, paid back"); `11-screens-and-ux.md` (Request page layout: 3; Interface per role: Finance); `edge-cases/purchasing-and-money.md` ("The Manager bought before cash was given"); `open-questions.md` (question 3).
  - **Build:** The Money tab: Finance adds entries of the six kinds with amount, date, optional document number, optional file and comment, and cancels a wrong one with a reason while the request is not Closed; the balance and its meaning are shown; the owner is notified.
  - **Done when:** Database tests: only Finance of the branch can add an entry; an amount of 0 is refused by the database; a cancelled entry leaves the balance as it was before.

- [ ] **4.4 Finish and close on an exact match**
  - **Read:** `07-purchasing.md` (Finishing); `08-money-and-settlement.md` (Closing: 1; Exact match); `06-approval-workflow.md` (Allowed moves: the two rows that start from Open); `03-roles-and-permissions.md` (Manager rights: CLOSE_ALONE; Permission matrix: "Close a request that matches exactly"); `15-quality-and-acceptance.md` (S1, S10, S16).
  - **Build:** "Finish purchasing" turns on when every line is Done, Done short or Not bought and shows the summary of differences; on an exact match the Manager sees "Close request" with the confirmation text; with `CLOSE_ALONE` off, or with a substitution, the request goes to Finance; Finance and the Head are notified.
  - **Done when:** S1 as a test; S16 and S10 as tests up to the point where the request goes to Finance.

- [ ] **4.5 Settlement screen**
  - **Read:** `08-money-and-settlement.md` (Closing: 2 with its table, 4, and the last paragraph); `06-approval-workflow.md` (Allowed moves: "Send to settlement" row; "Send back for correction" row); `02-assumptions.md` (A11); `10-notifications-analytics-reports.md` (Notifications: "Sent to settlement"); `edge-cases/purchasing-and-money.md` ("Cash was given but nothing was bought"; "No receipt photo"; "Finance finds an error during settlement").
  - **Build:** The Manager's "Send to settlement" for a request with any difference, with a notification to the Finance users of the branch; the Finance screen with a block for each payment type used: Cash (Receive from Manager or Pay Manager, prefilled, partial amounts allowed), Bank transfer (Confirmed; a note is required when transferred and received differ), Corporate card (Confirmed; a Card money returned entry when the Manager sends money back); the count of cancelled purchase records with a link to each; the "No receipt" label; Finance sends the request back to Open with a reason.
  - **Done when:** Database tests: lines whose differences cancel out still go to Finance; a transfer mismatch without a note cannot be confirmed.

- [ ] **4.6 Finance closes**
  - **Read:** `08-money-and-settlement.md` (Closing: 3); `15-quality-and-acceptance.md` (S2, S3, S9, S13); `10-notifications-analytics-reports.md` (Notifications: "Closed, reopened"); `03-roles-and-permissions.md` (Permission matrix: "Settle and close a request with differences"); `06-approval-workflow.md` (Allowed moves: Waiting for settlement, Close row).
  - **Build:** "Close request" for Finance turns on when the cash balance is 0, every block is confirmed and any required Head acknowledgment is given; the owner, the Head and Finance are notified.
  - **Done when:** S2, S3, S9 and S13 as tests, and the endings of S10 and S16.

- [ ] **4.7 Overspend guard**
  - **Read:** `08-money-and-settlement.md` (Overspend guard); `02-assumptions.md` (A10); `10-notifications-analytics-reports.md` (Notifications: "Overspend above the guard"; "Overspend acknowledged"); `15-quality-and-acceptance.md` (S12).
  - **Build:** Above the setting, the Head is notified and must click "Acknowledge overspend" with a comment before Finance can close; 0 means every overspend needs the Head; off means none does; Finance is notified when the Head acknowledges.
  - **Done when:** S12 as a test; with the guard off the same request closes without the Head.

- [ ] **4.8 Reopen**
  - **Read:** `06-approval-workflow.md` (Allowed moves: Closed row; Rules: 3); `03-roles-and-permissions.md` (Permission matrix: "Reopen a closed request"); `edge-cases/purchasing-and-money.md` ("An error is found after closing"; "Faulty goods go back to the supplier"); `10-notifications-analytics-reports.md` (Notifications: "Closed, reopened").
  - **Build:** The Head reopens a Closed request with a reason; the status is Open; balances are recalculated; earlier settlement confirmations are cleared; Finance settles again; the owner, the Head and Finance are notified.
  - **Done when:** Database test: reopen, cancel one record, and the request needs settlement again with the old confirmations gone.

- [ ] **4.9 Money with managers**
  - **Read:** `08-money-and-settlement.md` (Money with managers); `11-screens-and-ux.md` (Screens: Money with managers).
  - **Build:** `/money` for Finance (own branches) and the Head: every Manager's open cash balance across all requests, oldest first, with the date since when. The seed gains an Open request with cash given and a Closed one.
  - **Done when:** Database test: Finance of one branch sees no balance of another. By hand: the seed shows one Manager holding money.

- [ ] **4.10 Move a request to another Manager**
  - **Read:** `03-roles-and-permissions.md` (Rules: 7); `edge-cases/requests-and-approval.md` ("A Manager with cash in hand leaves the branch"; "A user is deactivated with work waiting").
  - **Build:** The Head moves a request to another Manager of the same branch, only when the owner's cash balance on it is 0; the move is written to the request's History.
  - **Done when:** Database tests: blocked at a balance of 50 000; allowed at 0; a Manager of another branch cannot be chosen.

- [ ] **4.11 Formal PDF: actual columns**
  - **Read:** `05-order-request-form.md` (Formal PDF: Actual columns; Totals).
  - **Build:** From status Open onward the PDF adds actual quantity, actual price, actual extra costs, actual total and difference, and the totals block adds planned total, actual total and difference.
  - **Done when:** A test reads the PDF of the Cheaper case and finds 470 000 and 50 000.


## Phase 5: Warehouse

Stock screens and every document that moves stock inside one branch.

- [ ] **5.1 Stock documents schema**
  - **Read:** `14-data-model.md` (Warehouse: stock_documents, stock_document_lines; Requests: number_counters); `09-warehouse.md` (Movement types); `edge-cases/developer-rules.md` (rules 5, 7).
  - **Build:** Migrations for both tables, with the foreign key from `stock_movements` to document lines; numbering for ISS, RET, TRF, WOF, CNT and ENT through `number_counters`; the document posting helper on top of `postMovement()`; the reverse helper.
  - **Done when:** Database tests: two documents posted at the same moment get different numbers; a reverse writes the opposite movement and marks the original Reversed.

- [ ] **5.2 Stock on hand**
  - **Read:** `09-warehouse.md` (Stock screens: Stock on hand); `11-screens-and-ux.md` (Screens: Stock on hand; Rules for a smooth feel: 8); `03-roles-and-permissions.md` (Permission matrix: "See requests, stock and reports"); `15-quality-and-acceptance.md` (S7).
  - **Build:** `/warehouse/stock`: product, subtype, photo, quantity, measure, value; search and category filter (the minimum column and the "Low stock only" switch arrive in 5.10); services are never listed; the branch wall.
  - **Done when:** Database test: a Principal sees only their branch's stock. By hand: the stock from phase 3 purchases is listed. The stock part of S7 is green.

- [ ] **5.3 Item card**
  - **Read:** `09-warehouse.md` (Stock screens: Item card); `11-screens-and-ux.md` (Screens: Item card).
  - **Build:** `/warehouse/items/[id]`: every movement of one subtype in one branch, newest first, with the running balance and a link to the source document or request.
  - **Done when:** A database test checks the order and the running balance. By hand: the card of a purchased item lists the receipt with a working link.

- [ ] **5.4 Issue to a department**
  - **Read:** `09-warehouse.md` (Issue to a department); `07-purchasing.md` (Purchase record: Give straight to requester; What saving a record does: 5); `03-roles-and-permissions.md` (Manager rights: ISSUE_STOCK; Permission matrix: "Issue, return, transfer stock"); `15-quality-and-acceptance.md` (S4, S8, S11); `edge-cases/warehouse.md` ("Two Managers issue the last items at the same moment"; "An item goes straight from the shop to a classroom"); `open-questions.md` (question 9); `11-screens-and-ux.md` (Interface per role: Manager).
  - **Build:** The issue form (branch, date, department, received by prefilled, lines with current stock beside each, comment); the server checks stock again under a lock and names the item and the available amount when it fails; the number `ISS-CHL-26-0031`; "Give straight to requester" on the purchase record creates an issue in the same transaction. The form has a phone layout.
  - **Done when:** S4 in full, S11 and the second half of S8 as tests.

- [ ] **5.5 Issue note PDF**
  - **Read:** `09-warehouse.md` (Issue to a department: 2); `05-order-request-form.md` (Formal PDF: 5); `16-build-order.md` (phase 5 row).
  - **Build:** The issue note in the formal style with "Given by" and "Received by" signature lines.
  - **Done when:** A test reads the number and both signature labels from the file. By hand: the spec's phase 5 check, download an issue note.

- [ ] **5.6 Return from a department**
  - **Read:** `09-warehouse.md` (Other documents: Return from a department; Movement types: Return row); `open-questions.md` (question 11).
  - **Build:** The return form: department, items and quantities; stock goes up; returning more than that department ever received shows a warning and needs a comment.
  - **Done when:** Database tests: a return raises stock; an over-return without a comment is refused.

- [ ] **5.7 Reverse a document**
  - **Read:** `09-warehouse.md` (Movement types: last paragraph; Issue to a department: 3); `03-roles-and-permissions.md` (Manager rights: RETURN_REVERSE); `edge-cases/warehouse.md` ("A wrong issue was posted"); `open-questions.md` (question 19).
  - **Build:** "Reverse" with a reason on a posted issue, by its creator or the Head; the opposite movement is written; the original is marked "Reversed". Who may reverse the other document types is answered in open question 19.
  - **Done when:** Database tests: reversing an issue brings the stock back and marks the issue Reversed; a reverse that would push stock below zero is refused; a Manager with `RETURN_REVERSE` off is refused.

- [ ] **5.8 Direct entry by the Head**
  - **Read:** `09-warehouse.md` (Direct entry by the Head); `03-roles-and-permissions.md` (Permission matrix: "Enter stock directly, without a request"); `15-quality-and-acceptance.md` (S15); `edge-cases/warehouse.md` ("The school already has stock on launch day"; "A gift or donation arrives without a request"); `open-questions.md` (question 12).
  - **Build:** The direct-entry form: branch, date, reason (stock we already had; gift or donation; other, with a comment), lines with product, subtype, quantity and a cost prefilled from the reference price; the number `ENT-CHL-26-0004`; an audit row; the item card marks the movement "Direct entry". A product's first direct entry locks its type and measure.
  - **Done when:** S15 as a test.

- [ ] **5.9 Direct entry from Excel**
  - **Read:** `09-warehouse.md` (Direct entry by the Head: 1); `04-catalogs.md` (Rules: 7).
  - **Build:** Existing stock is imported from an Excel template through the import framework, as direct-entry documents.
  - **Done when:** Tests: a file with one unknown product saves nothing; a valid file of 20 rows raises 20 balances.

- [ ] **5.10 Minimum stock and low stock**
  - **Read:** `09-warehouse.md` (Low stock); `04-catalogs.md` (Rules: 5); `14-data-model.md` (stock_minimums); `03-roles-and-permissions.md` (Manager rights: SET_MINIMUMS); `10-notifications-analytics-reports.md` (Notifications: "Item reached its minimum stock").
  - **Build:** The minimum is typed per subtype per branch on the item card or in the stock list, which gains its minimum column and the "Low stock only" switch; the "Low" label; the Managers of the branch are notified once per item until it is restocked; one button adds the item to a new or an existing draft of that branch.
  - **Done when:** Database tests: at the minimum the item is Low and one notification exists; a second issue sends none; after the item is restocked and falls to its minimum again, one more is sent; an item with no minimum is never Low.

- [ ] **5.11 Write-off**
  - **Read:** `09-warehouse.md` (Movement types: Write-off row; Other documents: Write-off); `03-roles-and-permissions.md` (Permission matrix: the two write-off rows; Manager rights: WRITE_OFF_COUNT); `10-notifications-analytics-reports.md` (Notifications: "Write-off or correction asked"); `edge-cases/purchasing-and-money.md` ("Faulty goods go back to the supplier"); `open-questions.md` (question 13).
  - **Build:** The Manager asks for a write-off with items, quantities, a reason from the fixed list and a comment; stock changes only when the Head approves; the Head approves or refuses; the decision goes back to the Manager.
  - **Done when:** Database tests: stock is unchanged while the request waits; approval lowers it; a refusal changes nothing.

- [ ] **5.12 Warehouse documents list**
  - **Read:** `09-warehouse.md` (Stock screens: Documents); `11-screens-and-ux.md` (Screens: Warehouse documents; New issue, return, transfer, write-off).
  - **Build:** `/warehouse/documents` with filters by type, date and department; `/warehouse/documents/new?type=` opens the right form. The seed gains an issue and a direct entry.
  - **Done when:** A database test for the branch wall. By hand: filter to the issues of one department.

- [ ] **5.13 Closing a branch**
  - **Read:** `04-catalogs.md` (Rules: 2); `edge-cases/requests-and-approval.md` ("The Head wants to close a branch").
  - **Build:** Deactivating a branch is blocked while it has unfinished requests or stock above 0, and the message says which.
  - **Done when:** Database tests for both blocks and for the free case.


## Phase 6: Home, analytics, reports

What each role sees first, and the numbers behind the work.

- [ ] **6.1 Home: Manager and Principal**
  - **Read:** `10-notifications-analytics-reports.md` (Home page per role); `11-screens-and-ux.md` (Interface per role: Manager, Principal).
  - **Build:** The Manager's home: three large buttons (New request, Record purchase, Issue from stock), then sent back to me, my drafts, my open requests with progress bars, cash I hold, low stock, lines due soon. The Principal's home: waiting requests as large cards with total, urgent label and price hints; approve, send back or reject in two taps on a phone; then the branch's requests by status and its spending this month.
  - **Done when:** Playwright at 375 px: the Principal approves a request from the home page in two taps.

- [ ] **6.2 Home: Head and Finance**
  - **Read:** `10-notifications-analytics-reports.md` (Home page per role); `11-screens-and-ux.md` (Interface per role: Head, Finance).
  - **Build:** The Head's home in the spec's order: waiting for my approval; overspends to acknowledge; write-offs to approve (corrections join in 7.4); product suggestions; requests stuck over 48 hours; counts by status per branch; spending this month per branch. The Finance home: approvals and settlements with the exact amount to give or receive, each opening on the request's Money tab; money with managers.
  - **Done when:** By hand with the seed: each list holds the right items, and a Finance item opens on the Money tab. A database test checks each list against the seed.

- [ ] **6.3 Analytics foundations**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: the five numbered points); `13-technology.md` (Scheduled jobs; Charts); `edge-cases/developer-rules.md` (rule 12); `14-data-model.md` (Notes for the build: third bullet); `open-questions.md` (question 14).
  - **Build:** Summary tables as materialized views, refreshed every 5 minutes by the scheduler; the period picker (this month, last month, this quarter, this school year hidden until it is set, custom dates) with the change against the period before; filters inside the user's branches; the drill-down list behind any number; Excel export of a chart or a table; the Recharts wrappers.
  - **Done when:** Database tests: a number equals the sum of the rows in its drill-down list; no filter returns rows of another branch; the school-year choice is hidden while the setting is empty.

- [ ] **6.4 Analytics: Head**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Head, all branches); `16-build-order.md` (phase 6 row).
  - **Build:** The six blocks: Spending, Plan vs actual, Prices, Approval speed, Managers, Warehouse.
  - **Done when:** A test checks one number of each block against the seed. By hand: the spec's phase 6 check, click a bar and see the requests behind it.

- [ ] **6.5 Analytics: Principal and Manager**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Principal, own branch; Manager, own branches; the "Runs out in" sentence); `open-questions.md` (question 15).
  - **Build:** The four Principal blocks and the four Manager blocks; "runs out in" is current stock divided by the average daily issues of the last 90 days.
  - **Done when:** A unit test of "runs out in"; a database test: the Principal's page holds only the Principal's branch.

- [ ] **6.6 Analytics: Finance**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Finance, own branches).
  - **Build:** The five blocks: Cash (with the age bands up to 7 days, 8 to 30 days, over 30 days), Cash needed soon, Payments, Plan vs actual (with purchases without a receipt), Settlement speed.
  - **Done when:** A test checks the age bands with the clock set. By hand: read the page on the seed.

- [ ] **6.7 Analytics as a PDF**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: 4); `05-order-request-form.md` (Formal PDF: first paragraph); `open-questions.md` (question 16).
  - **Build:** The whole analytics page downloads as a formal PDF report, built as answered in open question 16.
  - **Done when:** A test reads the period and one total from the file.

- [ ] **6.8 Reports: requests and spending**
  - **Read:** `10-notifications-analytics-reports.md` (Reports: first four rows); `11-screens-and-ux.md` (Screens: Reports); `03-roles-and-permissions.md` (Permission matrix: "Export to Excel, download PDF, print"); `15-quality-and-acceptance.md` (S7).
  - **Build:** `/reports` with Request register, Purchase register, Planned vs actual and Spending; filters by branch, date range and category; Excel export with real numbers and dates.
  - **Done when:** A database test for the branch wall on each report. By hand: export the spending report and sum a column in Excel. The reports part of S7 is green.

- [ ] **6.9 Reports: prices, stock and money**
  - **Read:** `10-notifications-analytics-reports.md` (Reports: last six rows); `09-warehouse.md` (Direct entry by the Head: 5; Stock value).
  - **Build:** Price history (as a chart), Stock on hand (quantities and value, with direct entries as their own line), Stock movements, Use by department, Money with managers, Approval speed.
  - **Done when:** Database tests: stock value equals quantity × average cost; the branch wall on each report.

- [ ] **6.10 Search**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 9).
  - **Build:** Ctrl+K or Cmd+K opens a search for request numbers, products and suppliers, limited to what the user may see.
  - **Done when:** Database test: a request number of another branch gives no result. By hand: find a request by its number.


## Phase 7: Transfers and counts

Stock moving between branches, and stock checked against the shelf.

- [ ] **7.1 Transfer: send**
  - **Read:** `09-warehouse.md` (Movement types: Transfer row; Other documents: Transfer); `03-roles-and-permissions.md` (Manager rights: TRANSFER_STOCK); `10-notifications-analytics-reports.md` (Notifications: "Transfer sent"); `05-order-request-form.md` (Formal PDF: 5).
  - **Build:** The sender picks the other branch and the items; stock leaves the sender at once; the transfer shows "In transit"; the Managers of the receiving branch are notified; the transfer note as a formal PDF.
  - **Done when:** Database test: the sender's stock falls at once and the receiver's does not change yet.

- [ ] **7.2 Transfer: receive**
  - **Read:** `09-warehouse.md` (Other documents: Transfer; Stock value: second bullet); `16-build-order.md` (phase 7 row); `edge-cases/warehouse.md` ("A transfer arrives short").
  - **Build:** The receiving Manager enters what really arrived; stock rises there with the sender's average cost; a shortage becomes a write-off request "Lost in transfer" on the sending branch for the Head.
  - **Done when:** The spec's phase 7 check as a test: send 10, receive 8, and a write-off request for 2 exists.

- [ ] **7.3 Stock count**
  - **Read:** `09-warehouse.md` (Other documents: Stock count); `11-screens-and-ux.md` (Screens: Stock counts); `03-roles-and-permissions.md` (Manager rights: WRITE_OFF_COUNT).
  - **Build:** `/warehouse/counts`: the Manager starts a count for a branch or a category and types the counted quantities; the system shows the differences.
  - **Done when:** Database test: each difference equals the counted quantity minus the stock at the start.

- [ ] **7.4 Count approval**
  - **Read:** `09-warehouse.md` (Movement types: Correction row; Other documents: Stock count); `03-roles-and-permissions.md` (Permission matrix: "Approve a write-off or stock correction"); `10-notifications-analytics-reports.md` (Notifications: "Write-off or correction asked").
  - **Build:** The Head approves the differences as corrections; an item that moved between the start of the count and the approval goes back to the Manager to be counted again; the Head is notified when a correction is asked, the decision goes back to the Manager, and corrections join the Head's home list.
  - **Done when:** Database tests: approval writes Correction movements; an item issued during the count is not corrected and is flagged.


## Phase 8: Jobs and polish

The scheduled work, and a pass over every screen.

- [ ] **8.1 Reminders and escalation**
  - **Read:** `06-approval-workflow.md` (Rules: 8); `10-notifications-analytics-reports.md` (Notifications: "Waiting more than 24 hours"; "Waiting more than 48 hours"; "Needed-by date is 2 days away and the line is not finished"); `14-data-model.md` (Notes for the build: settings keys); `16-build-order.md` (phase 8 row); `open-questions.md` (question 7).
  - **Build:** Scheduled jobs: a request waiting longer than `reminder_hours` reminds the approvers of its step; longer than `escalation_hours` tells the Head; a line not finished 2 days before its needed-by date tells the owner.
  - **Done when:** Database tests with the clock: at 24 hours and 1 minute the approvers have a reminder (the spec's phase 8 check); at 48 hours and 1 minute the Head has one.

- [ ] **8.2 Nightly check and weekly copy**
  - **Read:** `14-data-model.md` (Notes for the build: first bullet); `13-technology.md` (Running it); `open-questions.md` (question 17).
  - **Build:** A nightly job recomputes `stock_balances` from the movements and reports any mismatch, as answered in open question 17; a weekly job saves a copy of the database to R2.
  - **Done when:** Database test: a balance changed directly in the database is reported. By hand on the test copy: the weekly file is in the bucket.

- [ ] **8.3 Accessibility pass**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 13); `01-summary.md` (Quality bar); `15-quality-and-acceptance.md` (Done-check for every phase).
  - **Build:** Every screen checked for keyboard use and WCAG AA contrast at 375 px and 1440 px, and for 44 px touch targets at 375 px, and fixed.
  - **Done when:** An automated accessibility check runs in Playwright on every screen with no serious finding; S1 passes with the keyboard only.

- [ ] **8.4 Translation pass**
  - **Read:** `02-assumptions.md` (A2); `11-screens-and-ux.md` (Rules for a smooth feel: 14).
  - **Build:** All three languages complete and consistent; a script exports every Uzbek and Russian text to one Excel file for the owner to correct, and reads the corrected file back.
  - **Done when:** The missing-key check is green; the owner has the file; a corrected file changes the message files and nothing else.


## Phase 9: Before go-live

Proof that it works, then the real environment and the real data.

- [ ] **9.1 Acceptance run**
  - **Read:** `15-quality-and-acceptance.md` (whole file); `16-build-order.md` (whole file).
  - **Build:** Every scenario S1 to S18 as a Playwright test at phone and desktop width; a scenario covered so far only by database tests gets its browser test.
  - **Done when:** All 18 are green in CI at both widths.

- [ ] **9.2 Speed**
  - **Read:** `01-summary.md` (Quality bar: Fast); `edge-cases/developer-rules.md` (rule 12); `11-screens-and-ux.md` (Rules for a smooth feel: 5, 8).
  - **Build:** A script fills a database with several years of invented requests, purchases and movements; every page is measured; missing indexes and queries inside loops are fixed.
  - **Done when:** A table in `docs/` shows every page under 1 second on the test copy with that volume.

- [ ] **9.3 Monitoring**
  - **Read:** `18-hosting-and-costs.md` (table row 8).
  - **Build:** If the owner wants it: error alerts and an uptime check on free plans, as section 18 names them.
  - **Done when:** A forced error on the test copy reaches the owner as an alert.

> **Owner gate.** The start routine stops here until the owner, after the go-live review of every Look first decision with the owner's reviewer, deletes this line. From here on the live system, real data and secrets start.

- [ ] **9.4 Production**
  - **Read:** `18-hosting-and-costs.md` (whole file); `13-technology.md` (Running it); `open-questions.md` (question 10).
  - **Build:** The production app (1 GiB container, Managed PostgreSQL with 1 GiB, Frankfurt), its R2 bucket, the address `ombor.sodiqschool.uz`, the first Head created by the script, and the path from the test copy to production as answered in open question 10.
  - **Done when:** The Head signs in at the production address; the database dashboard shows a daily backup.

- [ ] **9.5 Real data**
  - **Read:** `04-catalogs.md` (Rules: 7); `09-warehouse.md` (Direct entry by the Head); `edge-cases/warehouse.md` ("The school already has stock on launch day").
  - **Build:** With the owner: catalogs, departments and prices imported from the school's Excel files; users created by the Head; existing stock entered by direct entry. The files never enter the repository, a test, a log or a chat.
  - **Done when:** The Head confirms the counts of products, users and stock lines on production.

- [ ] **9.6 Restore drill**
  - **Read:** `13-technology.md` (Running it); `16-build-order.md` (phase 8 row); `18-hosting-and-costs.md` (table rows 2 and 7; Total).
  - **Build:** A written restore procedure in `docs/`, and one real run of it on the test copy. A page in `docs/` with the steps by which the owner switches the test copy off after go-live and on again when the app is changed later.
  - **Done when:** The test copy's database is restored to yesterday and the four seed users can sign in. The owner has the steps to switch the test copy off and on.
