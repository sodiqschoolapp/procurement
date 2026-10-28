# Build plan

The whole project as ordered tasks. One task is one Claude Code session and one pull request. Work top to bottom, in the order of this file; a task may start only when every task above it is ticked. The loop of `docs/cloud-loop.md` builds them: the start routine takes the first unticked task.

## How to read a task

- **Read**: the spec files to read first, with the headings that matter, all under `docs/spec/`. Every task also reads `edge-cases/00-definitions.md` and `open-questions.md`. A task with a migration also reads `edge-cases/developer-rules.md` and `14-data-model.md`.
- **Build**: what exists when the task is finished. Nothing outside it is built.
- **Done when**: a test, or a thing the owner can try by hand. A scenario named S1 to S25 is in `15-quality-and-acceptance.md`.
- A task that turns out too large is split by the builder into a, b, c in this file, in the task's own pull request; the first part is planned and built, and the split is flagged **Look first** on issue #9. Nothing waits for a confirmation.
- A task that names an open question uses the owner's answer under "Decided ahead" in `docs/decisions.md`. Where no answer came, the builder takes the most reasonable reading and flags it **Look first** (D20, D26). The owner's reviewer prepares each phase's questions while the phase before it runs.
- A fix task `<id>b` (for example `1.3b`) is added by the owner when a decision made without the owner is changed on issue #9, or an owner's audit finds a gap (D48), and code must change. It is placed first among the open tasks, so the start routine takes it next; its Read line names the decision it changes or comes from.
- One owner gate stood before task 9.4, where the live system, real data and secrets start: a quoted line that began with the words "Owner gate." in bold. The start routine started nothing after it until the owner deleted that line, which the owner did on 20.10.2026 (D58).
- Tick a task only in `/finish-task`.

## Phases

| Phase | Tasks | What works afterwards |
| --- | --- | --- |
| 0. Foundations | 17 | Nothing a user can use yet. |
| 1. Catalogs and admin | 13 | Everything the Head sets up before the first order can be written. |
| 2. Orders to approval | 17 | From a draft on the order list to fully approved orders, with their numbers, their history and the download. |
| 3. Purchasing | 10 | The Manager records what was really bought, one order or one whole shop visit at a time. |
| 4. Money and settlement | 10 | Cash given, cash spent, the difference, and the close, per order. |
| 5. Warehouse | 11 | Stock screens and every document that moves stock inside one branch. |
| 6. Home, analytics, reports | 17 | What each role sees first, and the numbers behind the work. |
| 7. Transfers and counts | 4 | Stock moving between branches, and stock checked against the shelf. |
| 8. Jobs and polish | 3 | The scheduled work, and the translation pass. |
| 9. Before go-live | 16 | Proof that it works, then the real environment and the real data. |
| **Total** | **118** | |

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
  - **Build:** `/branches` for the Head: name, code (2 to 4 Latin capital letters, unique), address, active; deactivate instead of delete; change history. The code lock after the first request is wired in 2.7; the block on closing a branch is 5.12.
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


## Phase 2: Orders to approval

From a draft on the branch's order list to fully approved orders, ticked and acted on many at once, with their numbers, their history and the download. Requests became orders on 15 October 2026 (`docs/spec-changes.md`).

- [x] **2.1 Orders: names and the built parts**
  - **Read:** `11-screens-and-ux.md` (Screens; Interface per role); `10-notifications-analytics-reports.md` (Notifications: the paragraph on grouping); `08-money-and-settlement.md` (Overspend guard); `14-data-model.md` (Notes for the build: settings keys); `05-order-request-form.md` (first paragraph).
  - **Build:** The menu word "Requests" becomes "Orders" in the three languages and the address `/requests` becomes `/orders`; the request notification types keep their internal names and carry a count, so each text says how many orders it covers ("15 orders submitted"); the setting `overspend_guard_min_amount` (100 000 so'm) on the Settings page beside the percent; every other built text that says "request" for this flow follows, and the feature folder `src/features/requests` becomes `src/features/orders`.
  - **Done when:** Tests: each role's menu shows Orders at `/orders`; a notification of type submitted with a count of 15 reads "15" in each language; the new setting saves with an audit row and refuses a negative amount.

- [x] **2.2 Domain: order totals**
  - **Read:** `05-order-request-form.md` (Order: fields 10 to 16, and the totals under the list); `08-money-and-settlement.md` (Numbers the system calculates: Planned total; the paragraph on rounding); `edge-cases/developer-rules.md` (rules 1, 6); `13-technology.md` (Numbers).
  - **Build:** Pure functions in `src/domain/`: an order's total, the goods, extra-cost and grand totals of a set of orders, the split by payment type, and the price-hint percent. decimal.js inside, whole so'm out, rounding half up.
  - **Done when:** Unit tests that name the spec rule each checks, including 100 × 5 000 + 20 000 = 520 000, a 3-decimal quantity that rounds half up, the totals of three orders of different payment types, and "+35% vs catalog price".

- [x] **2.3 Domain: the state machine**
  - **Read:** `06-approval-workflow.md` (Statuses; Allowed moves; Rules: 1 to 8); `edge-cases/developer-rules.md` (rule 2); `03-roles-and-permissions.md` (Rules: 6, 8); `open-questions.md` (questions 5, 6).
  - **Build:** One file that lists every status move of one order, who may make it and what it needs; `allowedActions()` for one order and for a set of ticked orders (only the actions allowed on every one of them); `assertMove()` for the server.
  - **Done when:** Unit tests: every row of the allowed-moves table passes; every other combination of from, to and role is refused (generated); for a set of orders in two different statuses only their common actions are offered.

- [x] **2.4 Orders schema and many orders in one action**
  - **Read:** `14-data-model.md` (Orders; Notes for the build); `edge-cases/developer-rules.md` (rules 3, 5, 6, 8, 9; Constraints the spec names); `05-order-request-form.md` (Order number; Drafts: 2); `06-approval-workflow.md` (Rules: 7, 8).
  - **Build:** Migrations for `number_counters`, `orders`, `order_extras`, `order_revisions`, `order_actions` and `order_events` with enums, checks, foreign keys and indexes; the partial unique index of one never-submitted draft (number empty) per owner, branch, subtype and department; `orders.version`; the empty `stock_balances` table, so the "In stock" column has its source. The action wrapper learns to take many orders: it locks them in one fixed order, checks the status and version of each, writes one `order_actions` row and one event per order, and saves all or nothing; at most 200 orders.
  - **Done when:** Database tests try each forbidden write directly: a duplicate number, an unknown status, an extra cost of 0, a negative stock quantity, a second never-submitted draft for the same owner, subtype and department; an order taken back to Draft beside such a draft is allowed. An action on three orders where one has an old version saves nothing; the same `client_key` twice returns the first result.

- [x] **2.5a Drafts: rules, actions and queries**
  - **Read:** `05-order-request-form.md` (Order: all fields; Drafts; Ticking and filters: Price hint); `04-catalogs.md` (Rules: 2, 4); `02-assumptions.md` (A7); `06-approval-workflow.md` (Statuses: Draft); `11-screens-and-ux.md` (Screens: Order list; Order list layout: 3; Rules for a smooth feel: 8); `03-roles-and-permissions.md` (Rules: 1, 7; Manager rights: CREATE_REQUESTS; Permission matrix); `edge-cases/developer-rules.md` (rules 3, 4, 8, 9, 11); `edge-cases/requests-and-approval.md` ("The same item is needed by two departments"; "The same item for the same department is added again while a draft for it exists"); `edge-cases/warehouse.md` ("Half a piece is typed for an item counted in pieces").
  - **Build:** The draft rules in `src/domain/` (quantity as the measure allows, the suggested price, the merge sum, the Urgent reason, the comment); the actions add a draft (the same branch, subtype and department of the owner's never-submitted draft raises its quantity, safe to repeat), save one draft's changed fields with its version (every field of the order table, extra-cost rows, the reference photo, payment type defaulting from settings), apply one needed-by date to ticked drafts all or nothing, and delete a never-submitted draft (owner only); the queries of the drafts grid (each draft with photo, measure, stock or a dash for a service, total and price hint), of the product picker (photo, category, type, stock, subtypes, suggested price) and of the grid's choices; drafts behind the draft wall; an order is a use of its product, so type and measure lock; the reference photo is a held file.
  - **Done when:** Tests: a quantity of 0.5 for an item counted in pieces is refused; the suggested price is the reference price when both prices exist; another Manager of the same branch cannot read a draft; Urgent without a reason is refused; a Manager with `CREATE_REQUESTS` off cannot add one; adding 10 to a draft of 10 for the same department leaves one draft of 20, for another department two drafts; the same add sent twice leaves 20; a product in a draft refuses a change of type or measure; every new action and query has its permission-matrix rows.

- [x] **2.5b Drafts grid on `/orders`**
  - **Read:** `05-order-request-form.md` (Order: all fields; Drafts; Ticking and filters: Price hint); `11-screens-and-ux.md` (Screens: Order list; Order list layout: 3; Rules for a smooth feel: 4, 5, 6, 10, 12, 14); `06-approval-workflow.md` (Statuses: Draft); `docs/design-system.md`.
  - **Build:** The drafts grid on `/orders` on the actions and queries of 2.5a: every field of the order table as a cell (product picker with photo, category, type and stock; subtype; in stock, a dash for services; photo and one extra reference photo; brand or company; requested by; needed by with "apply to all ticked"; measure; quantity; the suggested price; extra-cost rows; payment type; priority with a reason for Urgent; comment; order total); the totals of the ticked drafts; the price-hint label; autosave with "Saved"; "Added to your draft: now 20"; delete with a confirmation; the labels "Sent back" and "Taken back"; texts in uz, ru and en.
  - **Done when:** Playwright at 1440 px: a Manager adds a draft through the picker, sees "Saved", its total and "+35% vs catalog price"; adding the same subtype for the same department shows "Added to your draft: now 20" and one row; ticking two drafts shows their totals by payment type; deleting a draft removes its row. The page opens at 375 px with no horizontal page scroll (the cards come in 2.6).

- [x] **2.6 Drafts: keyboard and phone**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 2, 7, 13).
  - **Build:** Tab and Enter move between cells and Enter on the last row adds a draft; the totals of the ticked drafts stay visible; on a phone each draft is a card; what was typed survives a dropped connection and is retried.
  - **Done when:** Playwright: three drafts are added with the keyboard only at 1440 px; the same drafts show as cards at 375 px.

- [x] **2.7 Submit and the order numbers**
  - **Read:** `05-order-request-form.md` (Order number; Checks at submit; Drafts: 4); `06-approval-workflow.md` (Allowed moves: Draft row; Rules: 8); `03-roles-and-permissions.md` (Rules: 6); `04-catalogs.md` (Catalogs table: Branches); `10-notifications-analytics-reports.md` (Notifications: "Orders submitted or submitted again"); `15-quality-and-acceptance.md` (S14); `edge-cases/requests-and-approval.md` ("Submit is clicked twice"; "A product is deactivated while it sits in a draft"; "The year changes"); `open-questions.md` (question 6).
  - **Build:** Submit of ticked drafts: every check on every order, all or nothing, with errors on the exact cell of the exact order and a short list on top; one number per order made inside the transaction with a lock on the counter row, in the order the drafts were created (per branch, per calendar year in Tashkent time, growing past 9999); `stock_at_submit` copied; a snapshot in `order_revisions`; one event per order; one grouped notification to the Head; an order created by the Head goes to Waiting for Principal and is logged "Created by Head"; the branch code locks after the first order.
  - **Done when:** Tests: S14; 201 ticked drafts refused; one draft with a past needed-by date among five stops all five; with the clock on 1 January the counter restarts at 0001; a double click submits once.

- [x] **2.8 Order list: group rows, ticking and filters**
  - **Read:** `05-order-request-form.md` (Group rows; Ticking and filters); `11-screens-and-ux.md` (Screens: Order list; Order list layout; Rules for a smooth feel: 6, 8); `06-approval-workflow.md` (Statuses); `03-roles-and-permissions.md` (Permission matrix: "See orders, stock and reports"; Rules: 8); `15-quality-and-acceptance.md` (S19).
  - **Build:** `/orders`: one group row per branch, subtype and status with its total quantity, total amount, number of orders, earliest needed-by date, Urgent and price hint; opening a row shows its orders; tick boxes on rows and orders, "Select all on this filter" up to 200; the action bar with the count and totals of the ticked orders and only the actions allowed on all of them; 25 group rows per page from the server; every filter of section 5 and sorting kept in the address; Urgent pinned on top for approvers; the branch filter inside the SQL.
  - **Done when:** Database tests: each role sees only its branches' orders and nobody else's drafts; three submitted orders of one subtype make one group row with their summed quantity. By hand: a filtered link reopens the same view.

- [x] **2.9 Order page**
  - **Read:** `11-screens-and-ux.md` (Order page layout; Rules for a smooth feel: 6); `06-approval-workflow.md` (Rules: 11); `edge-cases/00-definitions.md` (Orders); `05-order-request-form.md` (Ticking and filters: Price hint).
  - **Build:** `/orders/[id]`: the top block, the stepper with the name and time of each finished step, the tabs Details and History (Purchases and Money arrive in 3.5 and 4.3), the price hint for the owner and every approver, the action bar that reads the state machine, the line that says who the order is waiting for, and in History "with 14 other orders" when a move was made in one action.
  - **Done when:** Playwright: on a submitted order the stepper stands at Head, History shows the submit with name and time, and a Finance user sees the waiting line.

- [x] **2.10 Approvals**
  - **Read:** `06-approval-workflow.md` (Allowed moves: the three Approve rows; Rules: 1, 7, 8, 10); `03-roles-and-permissions.md` (Rules: 2, 3, 8); `10-notifications-analytics-reports.md` (Notifications: "Head approved"; "Principal approved"; "Finance approved"); `15-quality-and-acceptance.md` (S8, S19); `edge-cases/requests-and-approval.md` ("Two approvers click at the same moment"; "One of many ticked orders changed a moment ago"; "Stock changes between submit and approval"; "The branch's Principal changes while orders wait").
  - **Build:** Approve ticked orders or group rows at the Head, Principal and Finance steps, all or nothing: one changed order refuses the action, names it and refreshes; the slower user sees "Already approved by ... at ..."; each order shows stock at submit and stock now; Finance may change an order's payment type while approving; one grouped notification to the next step. The cash table of the Finance dialog arrives in 4.2. When a branch's Principal is replaced, waiting orders pass to the new Principal and past approvals keep the old name.
  - **Done when:** Tests: the first half of S8 (two Head users approve the same ticked orders together: one success, one clear message, nothing half-saved); S19 up to the Principal; a Principal of another branch is refused, also when one such order hides among ticked orders of their own branch; after Finance approves the status is Open.

- [x] **2.11 Send back, reject, cancel, take back; what changed**
  - **Read:** `06-approval-workflow.md` (Allowed moves; Rules: 2, 3, 4, 8); `02-assumptions.md` (A4); `10-notifications-analytics-reports.md` (Notifications: "Sent back, rejected"); `14-data-model.md` (order_events); `open-questions.md` (question 5). From the former 2.12: `06-approval-workflow.md` (Rules: 5); `14-data-model.md` (order_revisions); `15-quality-and-acceptance.md` (S5).
  - **Build:** On ticked orders, with one reason of at least 5 characters for the action: send back, with an optional note per order; the returned orders are editable by their owner; submitting again raises each order's revision and returns it to the Head; earlier approvals stay in History and no longer count; reject; cancel by the owner or the Head from any Waiting step or from Sent back; take back before the Head decides; the owner and the Head get one grouped notification for a send-back or a reject. From the former 2.12 (What changed): On a re-submitted order the approvers see its changed fields highlighted, with old and new values side by side, computed from the revision snapshots by a domain function.
  - **Done when:** Tests: a 4-character reason is refused; a re-submitted order is at Waiting for Head with revision 2 and the same number; a rejected order refuses every write. Playwright: the owner of a submitted order sees Take back and no Approve; the Head sees Approve, Send back and Reject. S5 as a Playwright test: the Head sees "100 → 80" highlighted, the same number and "rev 2".
  - Merged with the former 2.12 by the owner on 17.10.2026 (D47).

- [x] **2.13 Copy as new and stale drafts**
  - **Read:** `05-order-request-form.md` (Ticking and filters: Copy as new); `15-quality-and-acceptance.md` (S6, S18); `edge-cases/requests-and-approval.md` ("The catalog price changes after the draft was written"; "A product is deactivated while it sits in a draft"; "The needed-by date passes while the order waits").
  - **Build:** Any order, a rejected one included, and several ticked orders at once, are copied into new drafts (the draft merge of section 5 applies); a draft keeps its typed price when the catalog price changes and shows the new suggestion as a hint; a draft with a deactivated entry is marked; a waiting order past its needed-by date shows "Overdue" and nothing is blocked.
  - **Done when:** S6 and S18 as tests.

- [x] **2.14 Download: Excel and PDF**
  - **Read:** `05-order-request-form.md` (Download); `13-technology.md` (Excel and PDF); `15-quality-and-acceptance.md` (S17).
  - **Build:** The filtered order list downloads as Excel (ExcelJS) and as a plain PDF (@react-pdf/renderer, A4 landscape, fonts for Uzbek and Russian built in, the filters used and who downloaded it and when on every page, no signature lines), one row per order with the planned columns and who approved each step and when, in the language of the downloader, no product photos. Every number comes from the domain functions. The actual columns arrive in 3.5.
  - **Done when:** S17 as a test that reads the Excel file and the text of the PDF; a product name in Cyrillic is readable in the PDF.

- [x] **2.15 Orders: branch wall and matrix**
  - **Read:** `03-roles-and-permissions.md` (Permission matrix; Rules: 1, 8); `15-quality-and-acceptance.md` (Test layers: Database; S7).
  - **Build:** Every order action and query is in the permission-matrix test, for one order and for ticked orders that mix branches; S7 is a Playwright test; whatever the matrix finds is fixed. The seed gains a few orders in different approval statuses, two of them in one group row.
  - **Done when:** The matrix covers each order action × each role × own branch and other branch, alone and mixed, and is green; S7 is green for orders; its stock and report parts are added in 5.2 and 6.8.


- [x] **2.7b Confirm before Submit in the drafts grid; the S19 test**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 6); `05-order-request-form.md` (Group rows: 1, 4); `15-quality-and-acceptance.md` (S19); `docs/decisions.md` (D48).
  - **Build:** "Submit" and "Submit again" in the drafts grid ask for confirmation first, saying how many orders they cover, and state the result, as Submit on the order page does (decision 2.9 item 4); Cancel submits nothing. The S19 database test makes three orders of quantity 10, as the scenario does, and asserts the group row's quantity (20, then 30) and that it holds three orders. Its counts of events and numbers then become 3 instead of 30: that follows the scenario and is no weakened test.
  - **Done when:** Playwright: Submit in the grid opens the confirmation with the count; Cancel leaves every draft a Draft; confirming submits them. The S19 test fails if the row sums orders instead of quantities.
  - Added by the owner on 17.10.2026 from the Phase 2 audit (D48), not from a changed decision on issue #9.

- [x] **2.11b The two findings of 2.11's last review**
  - **Read:** `06-approval-workflow.md` (Rules: 4); `03-roles-and-permissions.md` (rule 6); `docs/decisions.md` (D49; decisions of task 2.11, item 8); the `[review] changes needed` comment of pull request #61 (16.10.2026, 22:17 UTC), findings 1 and 2.
  - **Build:** `createdByHeadSql` (`src/features/orders/order-facts.ts`) reads the same fact as the action wrapper (`src/server/order-action.ts`, `created_by_head`: the creator is a Head and the order has no number yet), or both read one expression; a test with a taken-back Draft that a Head created shows the fact false on the order page and in the list, as on the server. A database test applies the migrations up to `0021`, writes an `order_revisions` row the way the 2.7 Submit did (no `submission`), applies `0022`, and checks that the row has `submission = 1`, that a second (order, revision, 1) is refused by `order_revisions_order_id_revision_submission_key`, and that (order, revision, 2) is accepted.
  - **Done when:** both tests exist and pass, and each fails without its fix.
  - Added by the owner on 17.10.2026 (D49): the findings were posted at the sha that was merged ten seconds later.

## Phase 3: Purchasing

The Manager records what was really bought, one order or one whole shop visit at a time. Products enter stock at once; services count as used.

- [x] **3.1 Stock ledger**
  - **Read:** `09-warehouse.md` (first paragraph; Movement types; Stock value); `14-data-model.md` (Warehouse: stock_balances, stock_movements; Notes for the build: first bullet); `edge-cases/developer-rules.md` (rules 5, 7).
  - **Build:** `stock_movements` (append-only) and the full `stock_balances`; one `postMovement()` used by everything that changes stock: it locks the balance row, writes the movement with `balance_after`, and updates quantity and average cost in the same transaction; the moving-average domain function. The foreign keys from movements to purchases and to document lines are added in 3.2 and 5.1.
  - **Done when:** Unit tests of the average formula on a receipt and of the reset at 0. Database tests: a movement that would go below zero is refused by the code and by the CHECK; two movements at the same moment both land with the right `balance_after`.

- [x] **3.2 Purchases schema and domain**
  - **Read:** `14-data-model.md` (Purchasing and money: purchase_trips, purchases, purchase_extras, trip_files); `08-money-and-settlement.md` (Numbers the system calculates); `07-purchasing.md` (Order progress; One trip, many orders: 2); `edge-cases/developer-rules.md` (rules 1, 7); `open-questions.md` (question 3).
  - **Build:** Migrations for the four tables, with the foreign keys from `stock_movements` and `price_history` to `purchases`; the date, supplier and payment type of a record are read from its trip only; domain functions for actual quantity, actual goods, actual extra, actual total, difference and order progress; the split of a group row's quantity (oldest submit first, each up to what it lacks, the rest to the newest).
  - **Done when:** Unit tests with the four cases of the worked example; cancelled records are left out of every sum; 30 pens split over orders lacking 20 and 10, and 35 over the same.

- [x] **3.3 Record a purchase**
  - **Read:** `07-purchasing.md` (Purchase record; What saving a record does); `02-assumptions.md` (A7); `04-catalogs.md` (Rules: 4); `03-roles-and-permissions.md` (Permission matrix: "Record purchases"; Manager rights: RECORD_PURCHASES); `edge-cases/purchasing-and-money.md` ("The item was free"; "Planned by card, paid in cash"; "Delivery for a bank-transfer item was paid in cash"; "No receipt photo"); `14-data-model.md` (Notes for the build: settings keys).
  - **Build:** The purchase form for one Open order (a trip of one) with every field and rule of the table; "Same as planned"; saving in one transaction: the trip, the record, the stock receipt for a product, the last purchase price and a `price_history` row with source PURCHASE, the order's progress, its cached `actual_total`, the history event; a service changes no stock and shows Used. When `receipt_required_for_cash` is on, a cash purchase needs a receipt. "Give straight to requester" arrives in 5.4.
  - **Done when:** Database tests: a product purchase raises stock by its quantity; a service purchase raises nothing; a price of 0 without a comment is refused; a date before the order's Finance approval is refused; a failing last step leaves no record and no stock. With `receipt_required_for_cash` on, a cash purchase without a receipt is refused.

- [x] **3.4 One trip, many orders**
  - **Read:** `07-purchasing.md` (One trip, many orders; What saving a record does); `edge-cases/requests-and-approval.md` ("A delivery fee covers a whole shop visit"); `15-quality-and-acceptance.md` (S19).
  - **Build:** The Manager ticks Open orders or a group row and records the visit once, for orders of one branch and one owner (on a group row of several owners, the recording Manager's own orders): date, supplier, payment type and receipt files shared; quantity, price, subtype bought, extra costs and comment per order; on a group row one quantity and one price, split by 3.2's function and changeable before saving; a "Delivery" service order is recorded in the trip like any other order; one record per order, saved all or nothing.
  - **Done when:** Database tests: a trip of three orders writes three records, one trip and the receipt once; one failing order saves nothing; a trip over orders of two owners is refused; a trip with a "Delivery" service order raises no stock for it. Playwright: 30 Tata pens recorded on a group row of 20 and 10 fill both orders.

- [x] **3.5 Purchases tab, order progress and the actual columns of the download**
  - **Read:** `07-purchasing.md` (Order progress; Finishing); `11-screens-and-ux.md` (Order page layout: 3); `15-quality-and-acceptance.md` (S4); `edge-cases/purchasing-and-money.md` ("The shop has only part of the quantity"; "The item cannot be found at all"; "More was bought than approved"). From the former 4.11: `05-order-request-form.md` (Download: 1).
  - **Build:** The Purchases tab of the order page; the four progress states; "Finish order" and "Not bought" with one reason on ticked orders; reopening a finished order's buying while it is Open; buying more than planned needs a comment. From the former 4.11 (Download: actual columns): From status Open onward the Excel and PDF rows add actual quantity, actual price, actual extra costs, actual total and difference.
  - **Done when:** S4 without the issue: 60 notebooks, then 40; stock 60, then 100; the order stays Open until the second record. A test reads the downloads of the Cheaper case and finds 470 000 and 50 000.
  - Merged with the former 4.11 by the owner on 17.10.2026 (D47).

- [x] **3.6 Substitution**
  - **Read:** `07-purchasing.md` (Substitution); `15-quality-and-acceptance.md` (S10); `edge-cases/purchasing-and-money.md` ("A different colour or size was bought"; "A completely different product is needed").
  - **Build:** The Manager picks the subtype really bought, inside the same product; stock rises for that subtype; the order shows "Substituted"; the closing rules of 4.4 read this.
  - **Done when:** Tests: a subtype of another product is refused; S10 up to the stock check (stock rises for black pens, not for blue).

- [x] **3.7 Cancel a purchase record or a trip**
  - **Read:** `07-purchasing.md` (Fixing a mistake); `09-warehouse.md` (Stock value: third bullet); `10-notifications-analytics-reports.md` (Notifications: "Purchase record cancelled"); `03-roles-and-permissions.md` (Manager rights: CANCEL_PURCHASES); `edge-cases/purchasing-and-money.md` ("A typo in a purchase record"; "A purchase record must be cancelled but the items were already issued"); `open-questions.md` (question 3).
  - **Build:** Cancel a record with a reason while its order is Open, and "Cancel trip" for every record of one trip, all or nothing; stock goes down by the same quantity and the average is recalculated; the cancel is blocked when stock would go below zero, and the message names the two ways out; cancelled records stay visible, crossed out; the Head is notified; the order shows how many of its records were cancelled.
  - **Done when:** Database tests: a cancel lowers stock; a cancel after stock was lowered by a test movement is blocked and nothing changes; "Cancel trip" with one blocked record cancels none; a Manager with `CANCEL_PURCHASES` off is refused.

- [x] **3.8 The three colours**
  - **Read:** `08-money-and-settlement.md` (The three colours; Worked example); `11-screens-and-ux.md` (Rules for a smooth feel: 11); `edge-cases/developer-rules.md` (rule 1).
  - **Build:** A domain function that returns Number, Price and Total for an order and for a set of orders (grey while in progress; Price green only when every record's unit price is the planned one; the worst colour wins; Total from the summed difference); the label component with icon, word and amount; the labels on orders, group rows and the ticked totals.
  - **Done when:** Unit tests of the four worked-example cases, of two records of 0.25 at the planned price 1 001 (Price green), and of "red beats orange, orange beats green" on a group row. By hand: the Cheaper case shows orange "Left 50 000".

- [x] **3.9 Buying on a phone**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 3; Interface per role: Manager); `07-purchasing.md` (Purchase record: Receipt).
  - **Build:** The phone layout of the purchase form: one order or group row at a time, large buttons, "Same as planned", and the camera opens directly for the receipt.
  - **Done when:** Playwright at 375 px records a purchase with a receipt file.

- [x] **3.10 Price prompt for the Head**
  - **Read:** `04-catalogs.md` (Rules: 4); `10-notifications-analytics-reports.md` (Notifications: "Recent purchases differ from the reference price by more than 20%"); `open-questions.md` (question 8).
  - **Build:** When recent purchases differ from the reference price by more than 20%, the Head gets a notification and a prompt that updates the price in one click.
  - **Done when:** A database test written from the answer to open question 8; the one-click update writes a `price_history` row with source HEAD.


## Phase 4: Money and settlement

Cash given, cash spent, the difference and the close, per order, with Finance working on many ticked orders at once. After this phase an order runs from draft to Closed.

- [x] **4.1 Money schema and domain**
  - **Read:** `14-data-model.md` (Purchasing and money: money_actions, money_rows, order_settlements); `08-money-and-settlement.md` (Money ledger; Exact match; Overspend guard; Worked example); `edge-cases/developer-rules.md` (rules 1, 6, 7); `02-assumptions.md` (A10, A11).
  - **Build:** Migrations for the three tables; domain functions for an order's cash count, a Manager's cash balance (held and owed apart), the exact match of an order, the prefilled cash rows (each order's planned cash) and the prefilled settlement rows (each order's count), the no-crossing check, the net of a settlement action, and the overspend guard with the percent and the amount.
  - **Done when:** Unit tests: the four worked-example counts (0, +50 000, −30 000, +50 000); the three-order example (split 520 000, 100 000, 30 000; net 20 000); a return row above an order's count is refused; 550 000 on 520 000 is 5.8% and 30 000 so'm and under the guard; 80 000 over is under the guard at a 100 000 amount and above it at 50 000; Bank transfer, Card top-up and Card money returned never change a count.

- [x] **4.2 Finance approval with cash**
  - **Read:** `08-money-and-settlement.md` (When Finance approves; Money ledger: 1); `06-approval-workflow.md` (Allowed moves: Waiting for Finance row); `10-notifications-analytics-reports.md` (Notifications: "Cash given, cash returned, paid back").
  - **Build:** The Finance approval dialog for ticked orders shows the planned totals per payment type and the table "Cash given to the Manager now", one row per order with planned cash, prefilled and changeable, one block per Manager; one cash action per Manager is written in the same transaction as the approval, all sharing the browser id with their own `manager_id`; rows of 0 write nothing.
  - **Done when:** Database tests: approving the three orders of the worked example with 650 000 creates one action with rows 520 000, 100 000 and 30 000 and sets all three Open; orders of two Managers make two actions; a failure rolls back the approval and the cash.

- [x] **4.3 Money tab and money actions**
  - **Read:** `08-money-and-settlement.md` (Money ledger); `03-roles-and-permissions.md` (Permission matrix: "Record money given, returned, paid back"); `11-screens-and-ux.md` (Order page layout: 3; Interface per role: Finance); `edge-cases/purchasing-and-money.md` ("The Manager bought before cash was given"; "Finance gives one amount for several orders"); `open-questions.md` (question 3).
  - **Build:** The Money tab of the order page with its rows and count; Finance adds actions of the six kinds for ticked orders, with date, optional document number, optional file and comment, one row per order, prefilled where section 8 says; cancels a wrong action whole with a reason while none of its orders is Closed (otherwise the Head reopens that order first); the owner gets one grouped notification.
  - **Done when:** Database tests: only Finance of the branch can add an action; an amount of 0 is refused by the database; a cancelled action leaves every count as it was before; an action whose rows cover orders of two Managers is refused.

- [x] **4.4 Close on an exact match**
  - **Read:** `07-purchasing.md` (Finishing); `08-money-and-settlement.md` (Closing: 1; Exact match); `06-approval-workflow.md` (Allowed moves: the two rows that start from Open); `03-roles-and-permissions.md` (Manager rights: CLOSE_ALONE; Permission matrix: "Close an order that matches exactly"); `15-quality-and-acceptance.md` (S1, S10, S16).
  - **Build:** The Manager ticks finished orders and sees the summary of their differences; for exact matches "Close" with the confirmation text; with `CLOSE_ALONE` off, or with a substitution, the order goes to settlement; Finance and the Head get one grouped notification.
  - **Done when:** S1 as a test; S16 and S10 as tests up to the point where the order goes to Finance; ticking an exact match and an order with a difference offers "Close" for neither.
  - From 3.6: `07-purchasing.md` (Substitution: "the order cannot be closed by the Manager alone; Finance reviews it"). "Substituted" is `isSubstituted()` of `src/domain/purchases.ts` (a record that is not cancelled bought another subtype); exact match reads it, never a second comparison.

- [x] **4.5 Settlement screen**
  - **Read:** `08-money-and-settlement.md` (Money ledger: 1 to 3; Closing: 2 with its table, 4, and the last paragraph); `06-approval-workflow.md` (Allowed moves: "Send to settlement" row; "Send back for correction" row); `02-assumptions.md` (A11); `10-notifications-analytics-reports.md` (Notifications: "Sent to settlement"); `edge-cases/purchasing-and-money.md` ("Cash was given but nothing was bought"; "No receipt photo"; "Finance finds an error during settlement"; "One order holds money and another of the same Manager is owed"; "The ticked orders in settlement belong to two Managers").
  - **Build:** The Manager's "Send to settlement" for ticked finished orders, with one grouped notification to the Finance users of the branch; the Finance screen for ticked orders in settlement, a block per Manager and inside it per payment type: Cash (one settlement action with Receive and Pay rows prefilled with each count, partial amounts allowed, the net shown, no row crossing its order), Bank transfer (Confirmed per order; a note when transferred and received differ), Corporate card (Confirmed per order; a Card money returned row); the count of cancelled purchase records per order with a link to each; the "No receipt" label; Finance sends an order back to Open with a reason.
  - **Done when:** Database tests: the two-order settlement of the worked example records one action and leaves both counts at 0; a Pay row above what the order is owed is refused; a transfer mismatch without a note cannot be confirmed.
  - From 4.4: the Manager's "Send to settlement" exists: `sendToSettlementOrders` (`src/features/orders/actions/send-to-settlement.ts`), its buttons on the list bar and the order page, and the `REQUEST_SENT_TO_SETTLEMENT` notice to the branch's Finance users. 4.5 does not build them again; it builds the Finance screen and Send back for correction.

- [x] **4.6 Finance closes**
  - **Read:** `08-money-and-settlement.md` (Closing: 3); `15-quality-and-acceptance.md` (S2, S3, S9, S13, S20); `10-notifications-analytics-reports.md` (Notifications: "Closed, reopened"); `03-roles-and-permissions.md` (Permission matrix: "Settle and close an order with differences"); `06-approval-workflow.md` (Allowed moves: Waiting for settlement, Close row).
  - **Build:** "Close" for Finance on ticked orders: it works when every ticked order has a count of 0, every block confirmed and any required Head acknowledgment; otherwise nothing closes and the screen names the orders that are not ready; one grouped notification to the owners, the Head and Finance.
  - **Done when:** S2, S3, S9, S13 and S20 as tests, and the endings of S10 and S16.
  - From 4.5: "every block confirmed" is `blockConfirmed()` of `src/domain/money-ledger.ts` over `settlementFactsOf()` (`src/features/money/settlement-facts.ts`), read under the lock: a transfer ticked while it matched counts as not confirmed once the amounts differ without a note; the Cash block is confirmed by a count of 0. Close goes on the settlement screen (`/orders/settle`) and the list bar.

- [x] **4.7 Overspend guard**
  - **Read:** `08-money-and-settlement.md` (Overspend guard); `02-assumptions.md` (A10); `10-notifications-analytics-reports.md` (Notifications: "Overspend above the guard"; "Overspend acknowledged"); `15-quality-and-acceptance.md` (S12).
  - **Build:** An order above both the percent and the amount setting notifies the Head, who must click "Acknowledge overspend" with a comment, for one order or several ticked ones, before Finance can close; a 0 in either setting leaves only the other; both 0 means every overspend; off means none; Finance is notified when the Head acknowledges.
  - **Done when:** S12 as a test; with the guard off the same order closes without the Head.
  - From 4.6: Finance's Close already reads the guard: `readyToClose()` of `src/domain/money-ledger.ts` refuses an order whose `overspend().needsHead` is true until `order_settlements.overspend_ack_at` is set (the Close test writes it directly). 4.7 builds the Head's "Acknowledge overspend" with its comment, its notices and S12 through the button, not a second check.

- [x] **4.8 Reopen**
  - **Read:** `06-approval-workflow.md` (Allowed moves: Closed row; Rules: 3); `03-roles-and-permissions.md` (Permission matrix: "Reopen a closed order"); `edge-cases/purchasing-and-money.md` ("An error is found after closing"; "Faulty goods go back to the supplier"); `10-notifications-analytics-reports.md` (Notifications: "Closed, reopened").
  - **Build:** The Head reopens a Closed order with a reason; the status is Open; its counts are recalculated; earlier settlement confirmations and the overspend acknowledgment are cleared; Finance settles it again; the owner, the Head and Finance are notified.
  - **Done when:** Database test: reopen, cancel one record, and the order needs settlement again with the old confirmations gone.
  - From 3.7: `07-purchasing.md` (Fixing a mistake, fourth bullet: "After the order is Closed, only a reopen by the Head allows corrections"). The cancel is `cancelPurchase` / `cancelTrip` of `src/features/purchasing/actions/cancel-purchase.ts`, allowed by `purchaseCancelAllows()` at status Open only; a reopened order is Open again and needs no other path.

- [x] **4.9 Money with managers**
  - **Read:** `08-money-and-settlement.md` (Money with managers; Money ledger: Manager's cash balance); `11-screens-and-ux.md` (Screens: Money with managers).
  - **Build:** `/money` for Finance (own branches) and the Head: every Manager's cash balance across their orders that are not Closed, held and owed shown apart, oldest first, with the date since when, opening the orders behind it. The seed gains Open orders with cash given and a Closed one.
  - **Done when:** Database test: Finance of one branch sees no balance of another. By hand: the seed shows one Manager holding money.

- [x] **4.10 Move orders to another Manager**
  - **Read:** `03-roles-and-permissions.md` (Rules: 7; Permission matrix: "Move orders to another Manager"); `edge-cases/requests-and-approval.md` ("A Manager with cash in hand leaves the branch"; "A user is deactivated with work waiting").
  - **Build:** The Head moves ticked orders to another Manager of the same branch, only orders whose cash count is 0, all or nothing; the move is written to each order's History.
  - **Done when:** Database tests: blocked when one of three ticked orders has a count of 50 000, and none moves; allowed at 0; a Manager of another branch cannot be chosen.

## Phase 5: Warehouse

Stock screens and every document that moves stock inside one branch.

- [x] **5.1 Stock documents schema**
  - **Read:** `14-data-model.md` (Warehouse: stock_documents, stock_document_lines; Orders: number_counters); `09-warehouse.md` (Movement types); `edge-cases/developer-rules.md` (rules 5, 7).
  - **Build:** Migrations for both tables, with the foreign key from `stock_movements` to document lines; numbering for ISS, RET, TRF, WOF, CNT and ENT through `number_counters`; the document posting helper on top of `postMovement()`; the reverse helper.
  - **Done when:** Database tests: two documents posted at the same moment get different numbers; a reverse writes the opposite movement and marks the original Reversed.

- [x] **5.2 Stock on hand**
  - **Read:** `09-warehouse.md` (Stock screens: Stock on hand); `11-screens-and-ux.md` (Screens: Stock on hand; Rules for a smooth feel: 8); `03-roles-and-permissions.md` (Permission matrix: "See orders, stock and reports"); `15-quality-and-acceptance.md` (S7).
  - **Build:** `/warehouse/stock`: product, subtype, photo, quantity, measure, value; search and category filter (the minimum column and the "Low stock only" switch arrive in 5.10); services are never listed; the branch wall.
  - **Done when:** Database test: a Principal sees only their branch's stock. By hand: the stock from phase 3 purchases is listed. The stock part of S7 is green.

- [x] **5.3 Item card**
  - **Read:** `09-warehouse.md` (Stock screens: Item card); `11-screens-and-ux.md` (Screens: Item card).
  - **Build:** `/warehouse/items/[id]`: every movement of one subtype in one branch, newest first, with the running balance and a link to the source document or order.
  - **Done when:** A database test checks the order and the running balance. By hand: the card of a purchased item lists the receipt with a working link.

- [x] **5.4 Issue to a department and the issue note PDF**
  - **Read:** `09-warehouse.md` (Issue to a department); `07-purchasing.md` (Purchase record: Give straight to requester; What saving a record does: 5); `03-roles-and-permissions.md` (Manager rights: ISSUE_STOCK; Permission matrix: "Issue, return, transfer stock"); `15-quality-and-acceptance.md` (S4, S8, S11); `edge-cases/warehouse.md` ("Two Managers issue the last items at the same moment"; "An item goes straight from the shop to a classroom"); `open-questions.md` (question 9); `11-screens-and-ux.md` (Interface per role: Manager). From the former 5.5: `09-warehouse.md` (Issue to a department: 2); `05-order-request-form.md` (Download: 2, 3); `16-build-order.md` (phase 5 row).
  - **Build:** The issue form (branch, date, department, received by prefilled, lines with current stock beside each, comment); the server checks stock again under a lock and names the item and the available amount when it fails; the number `ISS-CHL-26-0031`; "Give straight to requester" on the purchase record creates an issue in the same transaction. The form has a phone layout. From the former 5.5 (Issue note PDF): The issue note as a PDF in the style of the order list download: number, date, department, items, who gave them and who received them as typed; no signature lines.
  - **Done when:** S4 in full, S11 and the second half of S8 as tests. A test reads the number and both names from the file and finds no signature line. By hand: the spec's phase 5 check, download an issue note.
  - Merged with the former 5.5 by the owner on 17.10.2026 (D47).

- [x] **5.6 Return from a department**
  - **Read:** `09-warehouse.md` (Other documents: Return from a department; Movement types: Return row); `open-questions.md` (question 11).
  - **Build:** The return form: department, items and quantities; stock goes up; returning more than that department ever received shows a warning and needs a comment.
  - **Done when:** Database tests: a return raises stock; an over-return without a comment is refused.

- [x] **5.7 Reverse a document**
  - **Read:** `09-warehouse.md` (Movement types: last paragraph; Issue to a department: 3); `03-roles-and-permissions.md` (Manager rights: RETURN_REVERSE); `edge-cases/warehouse.md` ("A wrong issue was posted"); `open-questions.md` (question 19).
  - **Build:** "Reverse" with a reason on a posted issue, by its creator or the Head; the opposite movement is written; the original is marked "Reversed". Who may reverse the other document types is answered in open question 19.
  - **Done when:** Database tests: reversing an issue brings the stock back and marks the issue Reversed; a reverse that would push stock below zero is refused; a Manager with `RETURN_REVERSE` off is refused.

- [x] **5.8 Direct entry by the Head**
  - **Read:** `09-warehouse.md` (Direct entry by the Head); `03-roles-and-permissions.md` (Permission matrix: "Enter stock directly, without an order"); `15-quality-and-acceptance.md` (S15); `edge-cases/warehouse.md` ("The school already has stock on launch day"; "A gift or donation arrives without an order"); `open-questions.md` (question 12).
  - **Build:** The direct-entry form: branch, date, reason (stock we already had; gift or donation; other, with a comment), lines with product, subtype, quantity and a cost prefilled from the reference price; the number `ENT-CHL-26-0004`; an audit row; the item card marks the movement "Direct entry". A product's first direct entry locks its type and measure.
  - **Done when:** S15 as a test.

- [x] **5.9 Direct entry from Excel**
  - **Read:** `09-warehouse.md` (Direct entry by the Head: 1); `04-catalogs.md` (Rules: 7).
  - **Build:** Existing stock is imported from an Excel template through the import framework, as direct-entry documents.
  - **Done when:** Tests: a file with one unknown product saves nothing; a valid file of 20 rows raises 20 balances.

- [x] **5.10 Minimum stock and low stock**
  - **Read:** `09-warehouse.md` (Low stock); `04-catalogs.md` (Rules: 5); `14-data-model.md` (stock_minimums); `03-roles-and-permissions.md` (Manager rights: SET_MINIMUMS); `10-notifications-analytics-reports.md` (Notifications: "Item reached its minimum stock").
  - **Build:** The minimum is typed per subtype per branch on the item card or in the stock list, which gains its minimum column and the "Low stock only" switch; the "Low" label; the Managers of the branch are notified once per item until it is restocked; one button adds the item to a new or an existing draft of that branch.
  - **Done when:** Database tests: at the minimum the item is Low and one notification exists; a second issue sends none; after the item is restocked and falls to its minimum again, one more is sent; an item with no minimum is never Low.

- [x] **5.11 Write-off**
  - **Read:** `09-warehouse.md` (Movement types: Write-off row; Other documents: Write-off); `03-roles-and-permissions.md` (Permission matrix: the two write-off rows; Manager rights: WRITE_OFF_COUNT); `10-notifications-analytics-reports.md` (Notifications: "Write-off or correction asked"); `edge-cases/purchasing-and-money.md` ("Faulty goods go back to the supplier"); `open-questions.md` (question 13).
  - **Build:** The Manager asks for a write-off with items, quantities, a reason from the fixed list and a comment; stock changes only when the Head approves; the Head approves or refuses; the decision goes back to the Manager.
  - **Done when:** Database tests: stock is unchanged while the write-off waits; approval lowers it; a refusal changes nothing.

- [x] **5.12 Warehouse documents list and closing a branch**
  - **Read:** `09-warehouse.md` (Stock screens: Documents); `11-screens-and-ux.md` (Screens: Warehouse documents; New issue, return, transfer, write-off). From the former 5.13: `04-catalogs.md` (Rules: 2); `edge-cases/requests-and-approval.md` ("The Head wants to close a branch").
  - **Build:** `/warehouse/documents` with filters by type, date and department; `/warehouse/documents/new?type=` opens the right form. The seed gains an issue and a direct entry. From the former 5.13 (Closing a branch): Deactivating a branch is blocked while it has unfinished orders or stock above 0, and the message says which. From 5.3 (`09-warehouse.md`, Stock screens: Item card, "a link to the source document"): the item card's document number links to that document; 5.12 decides its address (a document page or the documents list filtered to that number).
  - **Done when:** A database test for the branch wall. By hand: filter to the issues of one department. Database tests for both blocks and for the free case.
  - Merged with the former 5.13 by the owner on 17.10.2026 (D47).

## Phase 6: Home, analytics, reports

What each role sees first, and the numbers behind the work.

- [x] **6.1 Home: Manager and Principal**
  - **Read:** `10-notifications-analytics-reports.md` (Home page per role); `11-screens-and-ux.md` (Interface per role: Manager, Principal).
  - **Build:** The Manager's home: three large buttons (New order, Record purchase, Issue from stock), then sent back to me, my drafts, my open orders with progress, cash I hold, low stock, orders due soon, as counts and group rows linking to the filtered order list. The Principal's home: waiting group rows as large cards with total, urgent label and price hints; tick all and approve, send back or reject in two taps on a phone; then the branch's orders by status and its spending this month.
  - **Done when:** Playwright at 375 px: the Principal approves a group row of two orders from the home page in two taps.

- [x] **6.2 Home: Head and Finance**
  - **Read:** `10-notifications-analytics-reports.md` (Home page per role); `11-screens-and-ux.md` (Interface per role: Head, Finance).
  - **Build:** The Head's home in the spec's order: waiting for my approval; overspends to acknowledge; write-offs to approve (corrections join in 7.4); product suggestions; orders stuck over 48 hours; counts by status per branch; spending this month per branch. The Finance home: approvals and settlements with the exact amount to give or receive, each opening the order list filtered to those orders; money with managers.
  - **Done when:** By hand with the seed: each list holds the right orders, and a Finance entry opens the filtered order list ready to tick. A database test checks each list against the seed.

- [x] **6.3 Analytics foundations**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: the five numbered points); `13-technology.md` (Scheduled jobs; Charts); `edge-cases/developer-rules.md` (rule 12); `14-data-model.md` (Notes for the build: third bullet); `open-questions.md` (question 14).
  - **Build:** Summary tables as materialized views, refreshed every 5 minutes by the scheduler; the period picker (this month, last month, this quarter, this school year hidden until it is set, custom dates) with the change against the period before; filters inside the user's branches; the drill-down list behind any number; Excel export of a chart or a table; the Recharts wrappers.
  - **Done when:** Database tests: a number equals the sum of the rows in its drill-down list; no filter returns rows of another branch; the school-year choice is hidden while the setting is empty.

- [x] **6.4a Analytics: Head, Spending and Plan vs actual** (6.4 split in three by its plan, pull request #105)
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Head, all branches); `16-build-order.md` (phase 6 row).
  - **Build:** The Head's Spending block (total by month and by category as built in 6.3; branches side by side; by department; top 10 suppliers; split by payment type) and the Plan vs actual block (share of orders ending green, orange and red; total overspent and total saved; by branch and by Manager), each number with its drill-down and Excel export.
  - **Done when:** A database test checks one number of each of the two blocks against the seed. By hand: click a bar of the Head's page and see the orders behind it.

- [x] **6.4b Analytics: Head, Prices and Approval speed**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Head, all branches); `16-build-order.md` (phase 6 row).
  - **Build:** The Prices block (price trend of any product; biggest price rises in the last 90 days; the same product bought at different prices by different branches or suppliers) and the Approval speed block (average hours at each step per branch; orders waiting now, by age; share sent back or rejected, with the most common reasons).
  - **Done when:** A database test checks one number of each of the two blocks against the seed.

- [x] **6.4c Analytics: Head, Managers** (6.4c split in two by its plan, pull request #107)
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Head, all branches); `16-build-order.md` (phase 6 row).
  - **Build:** The Managers block (per Manager: number of orders, average difference from plan, cancelled purchase records, cash held and for how long), each number with its drill-down and Excel export.
  - **Done when:** A database test checks one number of the block against the seed.

- [x] **6.4d Analytics: Head, Warehouse**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Head, all branches); `16-build-order.md` (phase 6 row).
  - **Build:** The Warehouse block (stock value per branch; low-stock items; use by department; items with no movement for 90 days; value written off), each number with its drill-down and Excel export.
  - **Done when:** A database test checks one number of the block against the seed. By hand: the spec's phase 6 check on the whole Head page.

- [x] **6.5a Analytics: Principal** (6.5 split in three by its plan, pull request #109)
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Principal, own branch).
  - **Build:** The four Principal blocks: Spending (my branch by month against the period before; by category and department; top 10 products), Orders (by status; needed-by dates coming up; overdue orders), My approvals (waiting now; my average time to decide), Warehouse (stock value; low stock; what each department used), each number with its drill-down and Excel export.
  - **Done when:** A database test: the Principal's page holds only the Principal's branch.

- [x] **6.5a-2 The Orders total of the Principal's page opens its list**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: point 3, every number opens the list behind it); `docs/decisions.md` (D51).
  - **Build:** The "All orders" total of the Orders block (`src/features/analytics/components/principal-blocks.tsx`) opens the list of every order of the period behind it, through a drill key that `getStatusOrders()` accepts for all statuses of the period, inside the same walls as the other keys.
  - **Done when:** A database test: the list's count equals the total, for the Principal's branch only. A Playwright step clicks the total and sees the list.
  - Added by the owner on 19.10.2026 (D51): the finding of a second review run of #109 that stood down after the merge.

- [x] **6.5b Analytics: Manager, My orders, My estimates, My cash**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Manager, own branches).
  - **Build:** My orders (by status; average time to full approval; share sent back, with reasons), My estimates (difference between planned and actual price per product), My cash (count per open order), each number with its drill-down and Excel export.
  - **Done when:** A database test: the Manager's blocks hold only the Manager's own orders in the Manager's branches.

- [x] **6.5c Analytics: Manager, Stock planning**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Manager, own branches; the "Runs out in" sentence); `open-questions.md` (question 15).
  - **Build:** Stock planning: use of each item per month; "runs out in" is current stock divided by the average daily issues of the last 90 days; low stock; suggested order quantity.
  - **Done when:** A unit test of "runs out in".

- [x] **6.6a Analytics: Finance, Cash and Cash needed soon** (6.6 split in two by its plan, pull request #113)
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Finance, own branches); `08-money-and-settlement.md` (Money ledger; When Finance approves; Money with managers).
  - **Build:** Cash (given, returned and paid back by month; money with managers by age: up to 7 days, 8 to 30 days, over 30 days) and Cash needed soon (planned cash of approved orders not yet paid, plus orders still in approval), each number with its drill-down and Excel export.
  - **Done when:** A test checks the age bands with the clock set.

- [x] **6.6b Analytics: Finance, Payments, Plan vs actual and Settlement speed**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: Finance, own branches); `edge-cases/purchasing-and-money.md` ("No receipt photo").
  - **Build:** Payments (spending by payment type; bank transfers by supplier), Plan vs actual (overspends and savings by branch and Manager; purchases without a receipt), Settlement speed (average days from "Send to settlement" to Closed), each number with its drill-down and Excel export.
  - **Done when:** A database test: Finance's page holds only Finance's branches. By hand: read the page on the seed.

- [x] **6.7 Analytics as a PDF**
  - **Read:** `10-notifications-analytics-reports.md` (Analytics page per role: 4); `05-order-request-form.md` (Download: 2, 3); `open-questions.md` (question 16).
  - **Build:** The whole analytics page downloads as a PDF report without signature lines, built as answered in open question 16.
  - **Done when:** A test reads the period and one total from the file.

- [x] **6.8 Reports: orders and spending**
  - **Read:** `10-notifications-analytics-reports.md` (Reports: first four rows); `11-screens-and-ux.md` (Screens: Reports); `03-roles-and-permissions.md` (Permission matrix: "Export to Excel, download PDF, print"); `15-quality-and-acceptance.md` (S7).
  - **Build:** `/reports` with Order register, Purchase register, Planned vs actual and Spending; filters by branch, date range and category; Excel export with real numbers and dates.
  - **Done when:** A database test for the branch wall on each report. By hand: export the spending report and sum a column in Excel. The reports part of S7 is green.

- [x] **6.9a Reports: Stock on hand, Stock movements and Use by department** (6.9 split in two by its plan, pull request #118)
  - **Read:** `10-notifications-analytics-reports.md` (Reports: rows Stock on hand, Stock movements, Use by department); `09-warehouse.md` (Direct entry by the Head: 5; Stock value).
  - **Build:** Stock on hand (quantities and value, with direct entries as their own line), Stock movements, Use by department, each on `/reports` with its Excel file.
  - **Done when:** Database tests: stock value equals quantity × average cost; the branch wall on each of the three reports.

- [x] **6.9b Reports: Price history, Money with managers and Approval speed**
  - **Read:** `10-notifications-analytics-reports.md` (Reports: rows Price history, Money with managers, Approval speed); `04-catalogs.md` (rule 4, Price memory); `08-money-and-settlement.md` (Money with managers); `06-approval-workflow.md` (Statuses).
  - **Build:** Price history (as a chart), Money with managers, Approval speed, each on `/reports` with its Excel file.
  - **Done when:** Database tests: the branch wall on each of the three reports.

- [x] **6.10 Search**
  - **Read:** `11-screens-and-ux.md` (Rules for a smooth feel: 9).
  - **Build:** Ctrl+K or Cmd+K opens a search for order numbers, products and suppliers, limited to what the user may see.
  - **Done when:** Database test: an order number of another branch gives no result. By hand: find an order by its number.


## Phase 7: Transfers and counts

Stock moving between branches, and stock checked against the shelf.

- [x] **7.1 Transfer: send**
  - **Read:** `09-warehouse.md` (Movement types: Transfer row; Other documents: Transfer); `03-roles-and-permissions.md` (Manager rights: TRANSFER_STOCK); `10-notifications-analytics-reports.md` (Notifications: "Transfer sent"); `05-order-request-form.md` (Download: 2, 3).
  - **Build:** The sender picks the other branch and the items; stock leaves the sender at once; the transfer shows "In transit"; the Managers of the receiving branch are notified; the transfer note as a PDF without signature lines.
  - **Done when:** Database test: the sender's stock falls at once and the receiver's does not change yet.
  - From 5.12 (`09-warehouse.md`, Stock screens: Documents, "All issues, returns, transfers, write-offs and counts, with filters by type, date and department"; `11-screens-and-ux.md`, Screens: "New issue, return, transfer, write-off | `/warehouse/documents/new?type=`"): `?type=TRANSFER` opens the send form (the page answers "Not found" for it until then), and a sent transfer appears in `/warehouse/documents` and its type filter, and opens at `/warehouse/documents/[id]`, of the sending branch.

- [x] **7.2 Transfer: receive**
  - **Read:** `09-warehouse.md` (Other documents: Transfer; Stock value: second bullet); `16-build-order.md` (phase 7 row); `edge-cases/warehouse.md` ("A transfer arrives short").
  - **Build:** The receiving Manager enters what really arrived; stock rises there with the sender's average cost; a shortage becomes a write-off request "Lost in transfer" on the sending branch for the Head.
  - **Done when:** The spec's phase 7 check as a test: send 10, receive 8, and a write-off request for 2 exists.
  - From 5.12 (`09-warehouse.md`, Stock screens: Documents): the receiving branch sees the transfer in its `/warehouse/documents` and on the transfer's page (`listStockDocuments()` and `getStockDocument()` filter by `branch_id` only until then), and receives it from there.

- [x] **7.3 Stock count**
  - **Read:** `09-warehouse.md` (Other documents: Stock count); `11-screens-and-ux.md` (Screens: Stock counts); `03-roles-and-permissions.md` (Manager rights: WRITE_OFF_COUNT).
  - **Build:** `/warehouse/counts`: the Manager starts a count for a branch or a category and types the counted quantities; the system shows the differences.
  - **Done when:** Database test: each difference equals the counted quantity minus the stock at the start.
  - From 5.12 (`09-warehouse.md`, Stock screens: Documents, "… write-offs and counts, with filters by type …"): a count appears in `/warehouse/documents` and its type filter ("Stock count") and opens at `/warehouse/documents/[id]`, which shows its lines with the counted quantities.

- [x] **7.4 Count approval**
  - **Read:** `09-warehouse.md` (Movement types: Correction row; Other documents: Stock count); `03-roles-and-permissions.md` (Permission matrix: "Approve a write-off or stock correction"); `10-notifications-analytics-reports.md` (Notifications: "Write-off or correction asked").
  - **Build:** The Head approves the differences as corrections; an item that moved between the start of the count and the approval goes back to the Manager to be counted again; the Head is notified when a correction is asked, the decision goes back to the Manager, and corrections join the Head's home list.
  - **Done when:** Database tests: approval writes Correction movements; an item issued during the count is not corrected and is flagged.
  - From 5.12 (`09-warehouse.md`, Stock screens: Documents): the Head approves a count from its page `/warehouse/documents/[id]` (as a write-off is approved there), and Reverse of an approved count is offered there when `reverseAllows()` gains the type.


## Phase 8: Jobs and polish

The scheduled work, and the translation pass.

- [x] **8.1 Reminders and escalation**
  - **Read:** `06-approval-workflow.md` (Rules: 8); `10-notifications-analytics-reports.md` (Notifications: "Orders waiting more than 24 hours"; "Orders waiting more than 48 hours"; "Needed-by date is 2 days away and the order's buying is not finished"); `14-data-model.md` (Notes for the build: settings keys); `16-build-order.md` (phase 8 row); `open-questions.md` (question 7).
  - **Build:** Scheduled jobs: orders waiting longer than `reminder_hours` remind the approvers of their step, grouped in one notification a day per approver; longer than `escalation_hours` tell the Head, grouped the same way; an order whose buying is not finished 2 days before its needed-by date tells the owner.
  - **Done when:** Database tests with the clock: at 24 hours and 1 minute the approvers have a reminder (the spec's phase 8 check); at 48 hours and 1 minute the Head has one.

- [x] **8.2 Nightly check and weekly copy**
  - **Read:** `14-data-model.md` (Notes for the build: first bullet); `13-technology.md` (Running it); `open-questions.md` (question 17).
  - **Build:** A nightly job recomputes `stock_balances` from the movements and reports any mismatch, as answered in open question 17; a weekly job saves a copy of the database to R2.
  - **Done when:** Database test: a balance changed directly in the database is reported. By hand on the test copy: the weekly file is in the bucket.

- [x] **8.4 Translation pass**
  - **Read:** `02-assumptions.md` (A2); `11-screens-and-ux.md` (Rules for a smooth feel: 14).
  - **Build:** All three languages complete and consistent; a script exports every Uzbek and Russian text to one Excel file for the owner to correct, and reads the corrected file back.
  - **Done when:** The missing-key check is green; the owner has the file; a corrected file changes the message files and nothing else.


## Phase 9: Before go-live

Proof that it works, then the real environment and the real data.

- [x] **9.1a Acceptance run: orders to approval** (9.1 split in four by its plan, pull request #128)
  - **Read:** `15-quality-and-acceptance.md` (whole file); `16-build-order.md` (whole file). From the former 8.3: `11-screens-and-ux.md` (Rules for a smooth feel: 13); `01-summary.md` (Quality bar); `15-quality-and-acceptance.md` (Done-check for every phase).
  - **Build:** The Phase 2 scenarios of `16-build-order.md` as Playwright tests at both widths: S5, S6, S7, S14, S17, S18, S19; a scenario covered so far only by database tests gets its browser test.
  - **Done when:** All seven are green in CI in both projects (`phone-375`, `desktop-1440`), each test named for its scenario.

- [x] **9.1b Acceptance run: money and settlement**
  - **Read:** `15-quality-and-acceptance.md` (whole file); `16-build-order.md` (whole file). From the former 8.3: `11-screens-and-ux.md` (Rules for a smooth feel: 13); `01-summary.md` (Quality bar); `15-quality-and-acceptance.md` (Done-check for every phase).
  - **Build:** S1, S2, S3, S9, S12, S13, S16, S20 as Playwright tests at phone and desktop width.
  - **Done when:** All eight are green in CI in both projects.

- [x] **9.1c Acceptance run: purchasing and warehouse**
  - **Read:** `15-quality-and-acceptance.md` (whole file); `16-build-order.md` (whole file). From the former 8.3: `11-screens-and-ux.md` (Rules for a smooth feel: 13); `01-summary.md` (Quality bar); `15-quality-and-acceptance.md` (Done-check for every phase).
  - **Build:** S4, S8, S10, S11, S15 as Playwright tests at phone and desktop width (S10 and S15 have browser tests; each is read against its "Must end with" line).
  - **Done when:** All five are green in CI in both projects; with 9.1a and 9.1b every scenario S1 to S20 has its browser test.

- [x] **9.1d Accessibility pass**
  - **Read:** `15-quality-and-acceptance.md` (whole file); `16-build-order.md` (whole file). From the former 8.3: `11-screens-and-ux.md` (Rules for a smooth feel: 13); `01-summary.md` (Quality bar); `15-quality-and-acceptance.md` (Done-check for every phase).
  - **Build:** From the former 8.3 (Accessibility pass): Every screen checked for keyboard use and WCAG AA contrast at 375 px and 1440 px, and for 44 px touch targets at 375 px, and fixed.
  - **Done when:** An automated accessibility check runs in Playwright on every screen with no serious finding; S1 passes with the keyboard only.
  - Merged with the former 8.3 by the owner on 17.10.2026 (D47).

- [x] **9.2 Speed**
  - **Read:** `01-summary.md` (Quality bar: Fast); `edge-cases/developer-rules.md` (rule 12); `11-screens-and-ux.md` (Rules for a smooth feel: 5, 8).
  - **Build:** A script fills a database with several years of invented orders, purchases and movements; every page is measured; missing indexes and queries inside loops are fixed.
  - **Done when:** A table in `docs/` shows every page under 1 second with that volume, measured on a production build against a local database (no test copy, D52).

- [x] **9.3 Monitoring**
  - **Read:** `18-hosting-and-costs.md` (table row 8).
  - **Build:** If the owner wants it: error alerts and an uptime check on free plans, as section 18 names them.
  - **Done when:** A forced error in a production build is handed to the error-reporting client (stubbed) in a test; the owner's check on the live app during the trial (after 9.4) is listed in the report under "For the owner" (no test copy, D52).

- [x] **4.10b Money corrections from issue #9**
  - **Read:** `08-money-and-settlement.md` (Money ledger; the approval dialog paragraph); `edge-cases/purchasing-and-money.md` ("A typo in a purchase record"; "No receipt photo"; "Finance gives cash for several orders"); `docs/decisions.md` (D55); on issue #9 the decisions of 4.3 items 2 and 8, 4.10 item 3 and 3.3 item 4 (issue #9 numbering; each names its line in `docs/decisions.md`).
  - **Build:** (1) `moneyPrefill()` (`src/domain/money-ledger.ts`): a Cash given row on the Money tab is prefilled with the order's planned cash less `cashHanded()`, never below 0, and the row shows what was already given; the approval dialog stays as it is (D43). (2) The cancel of a money action (`cancel-money.ts`) and of a purchase record (`cancel-purchase.ts`) is allowed again when the order's owner now is the owner it had when the action or record was written; `movedSince()` becomes that check, and a refusal names the Manager to move the order back to. (3) A money action's date is not later than today in `Asia/Tashkent` (the injected clock), checked on the server, as a purchase date is. (4) With `receipt_required_for_cash` on, a trip also needs a receipt when any of its extra costs is paid in cash, checked on the server (`record-purchase.ts`).
  - **Done when:** a test per item names its rule and fails without its fix: an order planned at 520 000 with all of it given at approval prefills 0, and one with 500 000 given prefills 20 000; Aziz's typo is refused while the order is with Dilnoza and cancelled once it is back with Aziz; a money action dated tomorrow is refused; a transfer-paid trip with a cash delivery fee and no receipt is refused with the setting on and saved with it off.
  - Added by the owner on 20.10.2026 (D55): answers 1, 2, 15 and 16 on issue #9.

- [x] **7.4b Inactive stock, counts into 0, a direct entry's cost**
  - **Read:** `04-catalogs.md` (Rules: 2); `09-warehouse.md` (Documents; Stock value; Direct entry by the Head: 4); `docs/decisions.md` (D55); on issue #9 the decisions of 5.4 item 3, 5.6 item 7, 5.11 item 9, 5.12 item 8, 7.1 item 10 and 7.4 item 3 (issue #9 numbering).
  - **Build:** (1) Issue, write-off and transfer accept an inactive product or subtype up to the stock the branch holds, and a return accepts one that the department received (the return rules of 09 as they are); the stock pickers list such items marked "inactive"; ordering and buying still refuse them. (2) A count correction that adds stock to a quantity of 0 comes in at the subtype's last cost in that branch (the average before its stock last reached 0), at 0 only when it never had one, as one rule in `src/domain/stock.ts`. (3) A direct entry's page shows the Head its cost per unit.
  - **Done when:** a test per item names its rule: 120 notebooks of a switched-off product are issued, written off and transferred, and cannot be ordered; 20 found by a count at 0 enter at the last average (3 000), and a later purchase of 100 at 3 000 keeps the average at 3 000; the direct entry page shows its cost per unit to the Head only.
  - Added by the owner on 20.10.2026 (D55): answers 3, 4 and 19 on issue #9.

- [x] **7.4c Cancel a transfer, a reason for a refusal**
  - **Read:** `09-warehouse.md` (Documents: Transfer, Write-off, Stock count); `10-notifications-analytics-reports.md` (Notifications); `14-data-model.md` (`stock_documents`); `03-roles-and-permissions.md` (Permission matrix; Manager rights); `edge-cases/developer-rules.md`; `docs/decisions.md` (D55); on issue #9 the decisions of 7.1 item 9 and 5.11 item 6 (issue #9 numbering).
  - **Build:** One migration adds `CANCELLED` to the status and `decision_reason` to `stock_documents`. (1) Cancel of a transfer still In transit, by the Head or a Manager of the sending branch with `TRANSFER_STOCK` on, with a reason (5 to 500, as every move): the stock goes back to the sender at the cost it left with, the transfer can no longer be received, and the Managers of the receiving branch are told. (2) The Head's refusal of a write-off or a count correction takes a reason, stored in `decision_reason` and shown to the Manager.
  - **Done when:** a test per item names its rule: a cancelled transfer puts 20 chairs back at the sender at their cost and a later receive is refused; a refusal without a reason is refused; the permission-matrix test holds the new action. Migrations run on an empty database and the seed still runs.
  - Added by the owner on 20.10.2026 (D55): answers 17 and 18 on issue #9.

- [x] **2.3b Orders, notices and report access from issue #9**
  - **Read:** `06-approval-workflow.md` (Allowed moves); `03-roles-and-permissions.md` (Permission matrix); `10-notifications-analytics-reports.md` (Notifications; Reports); `14-data-model.md` (`notifications`); `edge-cases/developer-rules.md`; `docs/decisions.md` (D55); on issue #9 the decisions of 2.3 items 5 and 7, 2.11 items 5, 6 and 12, 4.10 item 5, 0.11 item 4 and 6.9b items 1 and 5 (issue #9 numbering).
  - **Build:** (1) The move "Draft with a number | Cancel | Owner or Head | Cancelled | Reason" in `src/domain/order-moves.ts`, with its button. (2) "Submit again" for the owner or the Head; it still goes to Waiting for Head with the revision up by 1, and the Head step is not skipped (`.claude/rules/server-actions.md`: a shortcut holds on the first pass only). (3) A notification to the owner when someone else cancels their orders, and one to the new owner and one to the old owner when the Head moves orders, grouped per action and per branch. (4) A migration adds `branch_id` to `notifications`, written from `notify()`'s `branchId`; the bell lists only rows of branches the reader has now, filtered in the SQL, and a row of no branch (the Heads' notices, rows from before the migration) always shows. (5) The report "Money with managers" and the Head's notes and setter on reference prices in "Price history" for the Head and Finance only, refused on the server for the Manager and the Principal; the rest of Price history stays open, and a Manager still sees their own cash.
  - **Done when:** a test per item names its rule; the permission-matrix test holds the new move and the two report limits; Bekzod's sent-back order is submitted again by the Head and waits for the Head; Bekzod, moved from YUN to CHL, no longer sees a YUN notice. Migrations run on an empty database and the seed still runs.
  - Added by the owner on 20.10.2026 (D55): answers 9, 12, 13, 14, 20 and 22 on issue #9.

- [x] **8.2b Backups, a Head's lost password, receipt photos, running periods, the report branch**
  - **Read:** `13-technology.md` (Running it); `03-roles-and-permissions.md` (Rules: 4); `02-assumptions.md` (A8); `07-purchasing.md` (Receipt); `10-notifications-analytics-reports.md` (Notifications; Analytics page per role: 1; Reports); `11-screens-and-ux.md` (Rules for a smooth feel: 1); `docs/decisions.md` (D9, D55; under 8.2 the item "A failed copy is a failed tick and a log line, no notification"); on issue #9 the decisions of 8.2 items 4 and 6, 1.3 item 2, 0.12 items 8 and 12, 6.3 items 3 and 6 and the build choice of 6.8 (issue #9 numbering).
  - **Build:** (1) The weekly copy (`src/server/jobs/database-copy.ts`) writes to a bucket of its own, with its own bucket and access-key settings of the environment, and a second bucket of the local SeaweedFS and of the test setups (`npm run storage:bucket`, `tests/helpers/local-storage.ts`); a failed copy tells every active Head in the bell and is tried again the next night until one succeeds; the Head's Settings page shows the date of the last copy. (2) `npm run user:renew-head`: a command run in the hosting console that renews one named active Head's password (typed at the prompt, never printed), deletes that Head's sessions and writes an audit row, the script copied into the image's run stage (`tests/image-files.test.ts`); nothing in the app changes (D9). (3) Receipt photos are stored at up to 2 500 px on the longest side beside the 160 px thumbnail, and the browser's shrink (`SHRINK_SIDE`, `src/domain/files.ts`) lets a receipt photo keep 2 500 px; catalog photos keep 160 and 1 200 px. (4) A period still running is compared with the same number of days at the start of the period before, capped at the end of the period before (`src/domain/analytics.ts`), and the page says "against the same days of …"; finished periods and custom dates stay as built. (5) Reports start at the branch picked in the branch switcher, as Analytics does.
  - **Done when:** a test per item names its rule: a forced copy failure sends one notice per active Head and a retry the next night, and a success shows its date; the command renews a Head's password, signs that Head out and refuses an unknown or inactive username; a 1 000 × 4 000 receipt keeps 2 500 px on its long side; on 18 October "this month" compares 1 to 18 October with 1 to 18 September, and on 31 March compares 1 to 31 March with the whole of February; a report opened with CHL picked filters to CHL.
  - Added by the owner on 20.10.2026 (D55): answers 6, 7, 8, 10 and 11 on issue #9.

- [x] **5.4b "Give straight to requester": stored, and its cancel**
  - **Read:** `07-purchasing.md` (Purchase record: Give straight to requester; Fixing a mistake); `09-warehouse.md` (Issue to a department; Reverse); `14-data-model.md` (`purchases`); `docs/decisions.md` (D56); the audit report in D56, findings 1 and 2.
  - **Build:** (1) Saving a record with "Give straight to requester" writes `purchases.give_to_requester` true (`record-purchase.ts`; it is left out of the insert today). (2) Cancelling a record whose "Give straight to requester" issue is still posted is refused, the message naming that issue and the two ways out (07 Fixing a mistake 2), whatever other stock the branch holds; once the issue is reversed, the cancel goes through as today (`cancel-purchase.ts`).
  - **Done when:** a database test per item names its rule and fails without its fix: a record with the tick reads `give_to_requester` true and one without reads false; with 50 notebooks in CHL, a record of 10 with the tick cannot be cancelled while its issue is posted (stock stays 50 and the issue stays), and after the issue is reversed the cancel leaves 50 and the department's received count back where it was.
  - Added by the owner on 20.10.2026 (D56): the money and stock audit.

- [x] **5.7b Reversing an issue after a return**
  - **Read:** `09-warehouse.md` (Issue to a department: 3; Other documents: Return); `docs/decisions.md` (D57; 5.7 item 2, which this reverses; 5.4b item 2).
  - **Build:** The reverse of an issue (`src/features/warehouse/actions/reverse.ts`, `reverseAllows()` or a rule beside it in `src/domain/`) is refused, under the locks it already takes, when a line is more than the department's net received amount of that subtype (`departmentReceived()`), the message naming the line, what the department holds, and "reverse the return first"; the warning of 5.7 item 2 for an issue goes. A return keeps its warning and comment (09 Return). This also closes the gap left open by 5.4b item 2 (an issue "given straight" reversed after a return).
  - **Done when:** a database test names the rule and fails without the fix: 10 notebooks issued to Maths, 4 returned, the reverse of the issue is refused and stock stays where it is; after the return is reversed, the issue's reverse goes through and stock is back to before the issue; an issue with nothing returned reverses as today.
  - Added by the owner on 20.10.2026 (D57): found in the review of the D55 fix tasks' decisions.

- [x] **9.4 The live app, in trial**
  - **Read:** `18-hosting-and-costs.md` (whole file); `13-technology.md` (Running it); `open-questions.md` (question 10, answered); `docs/decisions.md` (D52).
  - **Build:** `.do/app.yaml` and `docs/deploy.md` turned from the test copy into the live app: app `ombor`, 1 GiB container, Managed PostgreSQL with 1 GiB (daily backups), Frankfurt, the R2 buckets `ombor-files` and `ombor-copies` (the weekly copies, with a key of their own, 8.2b), the error and uptime alerts of 9.3 switched on (the owner creates the two free accounts; owner, 20.10.2026, D55), the address `ombor.sodiqschool.uz`; it starts in trial mode with `SEED_DEMO_DATA` on, the demo users and the invented data. The end of the trial as one script (`npm run trial:reset`): it drops the `public` and `drizzle` schemas, applies the migrations from zero and records in the new database that the trial has ended; it runs only when the database's name is typed as the confirmation, and refuses, writing nothing, once that record exists, so it can never run over the real data. No test copy (D52).
  - **Done when:** The demo users sign in at the live address; the database dashboard shows a daily backup; a database test shows that the reset empties a database with demo data, and refuses a second run and a wrong confirmation.

- [x] **9.6 Restore drill**
  - **Read:** `13-technology.md` (Running it); `16-build-order.md` (phase 8 row); `18-hosting-and-costs.md` (table row 2; Total).
  - **Build:** A written restore procedure in `docs/`, and one real run of it during the trial, before 9.5: yesterday's copy of the live database restored into a new, empty database, never over the live one; and once the newest weekly copy from `ombor-copies` restored the same way (D55).
  - **Done when:** The restored database holds yesterday's demo orders, users and stock lines, counted against the live one, and the restored weekly copy holds the demo orders of its Sunday; the owner has the written steps.

- [x] **4.10c The Finance step switch**
  - **Read:** `06-approval-workflow.md` (Allowed moves; Finance step switched off); `08-money-and-settlement.md` (Exact match; Money ledger; Closing; Overspend guard); `03-roles-and-permissions.md` (Rules: 5; Manager rights: `CLOSE_ALONE`; Permission matrix); `07-purchasing.md` (Purchase record: Date bought; Substitution); `10-notifications-analytics-reports.md` (Notifications); `11-screens-and-ux.md` (Order page layout); `14-data-model.md` (`orders`; Notes for the build: settings keys); `15-quality-and-acceptance.md` (S21); `edge-cases/requests-and-approval.md`; `edge-cases/developer-rules.md`; `docs/decisions.md` (D62).
  - **Build:** One migration adds `orders.skipped_finance` (boolean, false) and the settings key `finance_step` (true) with its CHECK. (1) The Head's Settings page switches `finance_step`, with a confirmation and an audit row; switching off is refused, naming the orders, while any order is Waiting for Finance or Waiting for settlement, checked on the server under a lock that a Principal's approval also takes, so the two cannot cross. (2) `src/domain/order-moves.ts`: the Principal's Approve goes to Open when the step is off and marks the order `skipped_finance`, read in the same transaction as the move, setting `approved_at`; a new row "Open, skipped Finance | Close | Owner or Head | Closed | buying finished", with the Head alone closing the orders of a Manager whose `CLOSE_ALONE` is off; Send to settlement refused for such an order. (3) An order that skipped Finance has no cash count: money actions refuse a row on it, and it is left out of every Manager's cash balance, Money with managers, the Manager's home "cash I hold", the cash analytics and the "Money with managers" report; the Money tab is not shown. (4) The overspend notice goes to the Head as usual, and no acknowledgment is asked for such an order. (5) The notice "Principal approved" goes to the owner and the Head for orders that skipped Finance; no "no active Finance user" warning while the step is off. (6) The stepper, the History tab, the Excel and the PDF show the Finance step as "Skipped". Texts in uz, ru and en.
  - **Done when:** S21 passes as a database test and as a Playwright test at 375 px and 1440 px; a test per rule names it, among them: switching off with an order Waiting for settlement is refused; switching on leaves an Open order that skipped Finance closable by its owner without settlement; a skipped order bought in cash adds nothing to its Manager's balance; a money row on a skipped order is refused; a Principal's approval at the moment of the switch never leaves an order Waiting for Finance with the step off. The permission-matrix test holds the new close and the switch. Migrations run on an empty database and the seed still runs.
  - Added by the owner on 25.10.2026 (D62): orders do not go through Finance until the Finance team moves to the platform.

- [x] **1.12b Managers add products and subtypes while ordering**
  - **Read:** `04-catalogs.md` (whole file, above all Rules: 1, 3, 8); `03-roles-and-permissions.md` (Manager rights; Permission matrix); `05-order-request-form.md` (Order, field 2); `10-notifications-analytics-reports.md` (Notifications; Home page per role: Head); `11-screens-and-ux.md` (Rules for a smooth feel: 2); `14-data-model.md` (`manager_rights`, `products`, `product_variants`, `catalog_suggestions`); `15-quality-and-acceptance.md` (S22); `edge-cases/requests-and-approval.md` ("The needed item is not in the catalog"); `edge-cases/developer-rules.md`; `docs/decisions.md` (D63; the plan of 1.8, decided item 1, for the first real subtype).
  - **Build:** One migration adds the Manager right `ADD_PRODUCTS` and `added_by`, `checked_at` to `products` and `product_variants`. (1) In the product search of the drafts grid and of the phone draft card, when nothing active matches, a last line "Add …" opens a small form: a new product (name, product or service, category, measure, optional photo) or a new subtype of a picked product (name, optional photo; for a product without subtypes also the name of its existing items, given to the hidden default subtype). On save the draft row takes the new entry. (2) The server action for the Head and for a Manager whose right is on, with a browser-made id, the duplicate rule of 04 rule 3 (the existing entry is offered; an inactive one is named and not switched on), an audit row and `added_by` for a Manager; no reference price, brand or description is taken. (3) The Head's home lists products and subtypes added by Managers whose `checked_at` is empty, each linking to its catalog page, and the Head marks one or many checked (audit row). (4) The Manager's "Suggest a product" entry points are removed; suggestions already pending stay on the Head's screen and are decided as before. (5) The tenth switch on the Manager's user page. Texts in uz, ru and en.
  - **Done when:** S22 passes as a database test and as a Playwright test at 375 px and 1440 px; a test per rule names it, among them: a Manager with the right off is refused on the server; a Principal and Finance are refused; the same browser id twice makes one product; a name differing only in capitals and spaces is refused and the existing entry is returned; the first subtype added to "Pen" with 40 in stock and two orders leaves both pointing at the default subtype, now named "blue"; a Manager cannot set a reference price or edit an existing entry through the action. The permission-matrix test holds the new action and the mark checked. Migrations run on an empty database and the seed still runs.
  - Added by the owner on 25.10.2026 (D63): Managers add what they need while ordering, without waiting for the Head.

- [x] **1.12c The Head's first subtype names the existing items; adding needs both rights**
  - **Read:** `04-catalogs.md` (Rules: 1, 8); `open-questions.md` (18, answered); `03-roles-and-permissions.md` (Manager rights); `docs/decisions.md` (D64, D66; the plan of 1.8, decided items 1, 2, 6 and 9, which D64 replaces or touches; the plan of 1.12b, decided items 1 and 2).
  - **Build:** The Head's first real subtype from the catalog page works as the add from an order does (04 rule 1): on a product without subtypes the Head also names the existing items; the hidden default takes that name and keeps its id, orders, stock, price and photo, and the Head's new subtype is a new row, with its own price and photo when given. Reuse the `existingName` path that 1.12b built; this replaces decisions 1.8 item 1, under which the default took the new name. (2) Adding a product or a subtype while ordering (`catalog.add` of 1.12b) needs both of a Manager's rights `ADD_PRODUCTS` and `CREATE_REQUESTS`: with either off the Add line is not shown and the server refuses (D66; this replaces the part of 1.12b decided item 1 that did not ask for `CREATE_REQUESTS`). Texts in uz, ru and en.
  - **Done when:** a database test names 04 rule 1: the Head adds "black" to "Pen" (40 in stock, two orders, a reference price) naming the existing "blue"; stock, both orders, the price and the photo stay on the default id, now "blue", and "black" is a new row with no stock. The 1.8 tests of the old conversion are changed with the reason (D64, a changed requirement). A Manager with `ADD_PRODUCTS` on and `CREATE_REQUESTS` off is refused both adds on the server and sees no Add line; the permission-matrix test holds the case.
  - Added by the owner on 25.10.2026 (D64): split from 1.12b, which had started before D64 was merged.

- [x] **2.5c The order sheet**
  - **Read:** `05-order-request-form.md` (Order; Drafts; Order number; Checks at submit); `11-screens-and-ux.md` (Order list layout 3; Rules for a smooth feel: 2, 4, 6, 7, 13); `06-approval-workflow.md` (rule 8); `04-catalogs.md` (rule 8); `15-quality-and-acceptance.md` (S5, S19, S23); `edge-cases/requests-and-approval.md`; `docs/design-system.md`; `docs/decisions.md` (D65).
  - **Build:** (1) The drafts grid becomes the order sheet: six cells (product with its subtype in the same search, and Product or Service, stock and measure under it; department; quantity with its measure; price; needed-by date; total), the branch first only for a user with several branches; brand, extra costs, payment type, priority, comment, requester and reference photo under "More" on the row; the phone card shows the same six and "More". (2) A new draft takes the branch, department and needed-by date of the draft above it. (3) Submit with nothing ticked sends the ready ones among the user's own drafts without a number that the screen shows, with their versions (never a draft the screen did not show; never a sent-back or taken-back order or another owner's draft, which go only when ticked), the first 200 in the order they were added; a draft that is not ready is not sent and stays, marked on its cell and named in the list on top; the confirmation says how many go and how many stay. With drafts ticked, Submit stays all or nothing. Whether a draft is ready is one function in `src/domain/` (the checks of 05) that the screen and the server both use; the server checks again. (4) The word "Draft" is no longer shown on a row without a number. Texts in uz, ru and en; the sheet opened at 375 px and 1440 px.
  - **Done when:** S23 passes as a database test and as a Playwright test at 375 px and 1440 px; a test per rule names it, among them: Submit with nothing ticked and one draft without a price sends the others and leaves that one marked; ticked drafts with one failing send nothing; 201 ready drafts send 200, then 1; a draft another tab changed after the screen loaded refuses the submit and names it; a draft added in another tab after the screen loaded is not sent; a sent-back order and a taken-back order in the sheet stay unsent; the Head's Submit with nothing ticked sends none of a Manager's drafts; S5 and S19 still pass.
  - Added by the owner on 25.10.2026 (D65): ordering as simple as a sheet in Excel, in one step.

- [x] **2.9b A simpler order page**
  - **Read:** `11-screens-and-ux.md` (Order page layout; Rules for a smooth feel: 4, 6, 13); `08-money-and-settlement.md` (The three colours); `06-approval-workflow.md` (Statuses; Allowed moves; Finance step switched off); `docs/design-system.md`; `docs/decisions.md` (D65; "Plan and actual, labels that say what they compare" of 22.10.2026).
  - **Build:** (1) The top shows one line saying who acts next and since when ("Waiting for Principal (Otabek N.) since 10.10.2026"), from the step the order waits on and the time of its last move. (2) One Plan and actual block: the planned total while nothing counted is bought; after that, the plan beside the actual quantity, price and extra costs with each effect on the total and the three colour labels; the separate totals strip goes, so nothing is shown twice. (3) The stepper moves to the top of the History tab, Finance "Skipped" kept. (4) The action bar shows the user's main next action as one button and the rest under "More"; which action is the main one is decided in one place in `src/domain/`, beside the state machine, and the plan lists it per status and role. (5) Details leaves out fields that are empty. Texts in uz, ru and en; the page opened at 375 px and 1440 px for an order Waiting for Principal, one Open with a difference, one that skipped Finance and one Closed.
  - **Done when:** a test per rule names it, among them: the main action per status and role (unit test); the top line of an order Waiting for Principal names the Principal and the date; the Plan and actual block shows the planned total only before a purchase and the table after; the stepper sits in History; a Playwright test at both widths opens the four orders above. Order-page tests that read the old layout are changed with the reason (D65, a changed requirement).
  - Added by the owner on 25.10.2026 (D65): a more user-friendly order page.

- [x] **2.5d-a Fields the Head sets: every field but the price**
  - Split from 2.5d by its plan (pull request #173, decided item 1, Look first): the task as the owner added it on 26.10.2026 (D67) is the two parts together.
  - **Read:** `05-order-request-form.md` (Order; Fields the Head sets; Drafts; Checks at submit; Group rows); `06-approval-workflow.md` (Finance step switched off, rule 8); `07-purchasing.md` (Purchase record: Give straight to requester); `10-notifications-analytics-reports.md` (Notifications; Home page per role; Analytics; Reports); `11-screens-and-ux.md` (Order list layout 3; Order page layout; Rules for a smooth feel: 2, 6, 14); `14-data-model.md` (`orders`; settings keys); `edge-cases/developer-rules.md`; `docs/decisions.md` (D67).
  - **Build:** The migration of 2.5d whole: the settings key `order_fields` with its CHECK; `orders_submitted_plan_check` loosened (D67); the CHECK that a planned price and a planned total are both present or both empty, and the one that an order without a planned price is never Waiting for Finance or Waiting for settlement; the one-draft index treating two empty departments as equal; the analytics tables taking an empty department and needed-by date. (1) The Head's Settings page sets each field of 05's table (how it is asked, where it stands), with an audit row; the price offers Required only, until 2.5d-b. (2) The order sheet, the add row and the phone card show the fields as set; hidden ones never. (3) Submit checks the fields as set at the moment of the submit, in one function in `src/domain/` that the screen and the server both use, and stores each hidden field's hidden value on a draft that never had a number. (5) An order without a department: no "Give straight to requester", counted in every total of analytics and reports and left out of what is split by department, as 05 rule 3 read when the build reached analytics; "No department" (D68, merged during the build) is 2.5d-b's. An order without a needed-by date: no "due soon" reminder or list entry; group rows take the earliest date given. Texts in uz, ru and en.
  - **Done when:** a test per rule names it, among them: a submit with a hidden needed-by date and an empty optional department goes through; a required field left empty is still refused (in the row and under "More"); the new and loosened constraints each refuse what they must, written straight in SQL; every reader of an empty department or needed-by date (lists, downloads, home, reminders, analytics, reports) has its test; a Playwright test at 375 px and 1440 px. The permission-matrix test holds the setting. Migrations run on an empty database and the seed still runs.

- [x] **2.5d-b Fields the Head sets: the price**
  - Split from 2.5d by its plan (pull request #173, decided item 1, Look first). Split again by its own plan (pull request #174, decided item 1, Look first): this part built Build (1), (2), (6) and (4) for every reader but the counts beside the analytics and report sums; Build (5) and those counts are 2.5d-c.
  - **Read:** `05-order-request-form.md` (Fields the Head sets; Group rows; Download); `06-approval-workflow.md` (Finance step switched off, rule 8); `08-money-and-settlement.md` (Numbers the system calculates; The three colours; Overspend guard); `10-notifications-analytics-reports.md` (Home page per role; Analytics; Reports); `15-quality-and-acceptance.md` (S24); `docs/decisions.md` (D67, D68); the plan and the report of 2.5d-a (pull request #173).
  - **Build:** (1) Price optional or hidden on the Settings page, refused while the Finance step is on, under the settings lock. (2) A hidden price stores `suggestedPrice()` of `src/domain/drafts.ts` when there is one. (4) An order without a planned price: no planned total in `src/domain/` (no second formula): every caller of `orderTotal()` and every `BigInt(planned_total | planned_price)` takes a missing price (the money ledger's `plannedCash`, `settlementBlocks`, `orderOverspend` and the skipped-Finance close; the colours; the order download; the settlement query; the approve button, the action bar and the home cards; the analytics refresh and its `planned` columns; reports; the purchase form), and a Cancel of a taken-back order without a price (`cancelPlanGaps()`, asked for the price until then: review of #173, finding 1); "No planned price" for the Price and Total labels; no overspend notice; left out of planned sums, and every sum that leaves orders out says how many (group rows, ticked totals, analytics, reports, Excel and PDF). (5) Analytics and reports by department show an order without a department under "No department" (D68), so their totals add up; its bar opens its records like any other (10 Analytics point 3), through a "no department" value of the department filter. (6) Switching the Finance step on is refused while price is not required, or while an order without a planned price is Waiting for Head or Waiting for Principal, naming those orders. Texts in uz, ru and en.
  - **Done when:** S24 passes as a database test and as a Playwright test at 375 px and 1440 px; a test per rule names it, among them: price set to optional with the Finance step on is refused; the switch on with an unpriced order Waiting for Principal is refused and names it; a group row of a priced and an unpriced order shows the priced total and "1 without a price"; an unpriced order's Price and Total labels read "No planned price" and it sends no overspend notice; a taken-back draft without a price cancels and the analytics refresh still runs; spending by department with one order without a department shows it under "No department" and the bars add up to the total; a same-moment test of a submit reading the price setting and the Head switching the Finance step on (the settings lock taken shared by the submit). Migrations run on an empty database and the seed still runs.

- [x] **2.5d-c Fields the Head sets: analytics and reports**
  - Split from 2.5d-b by its plan (pull request #174, decided item 1, Look first): the task as the owner added it on 26.10.2026 (D67, D68) is 2.5d-a, 2.5d-b and 2.5d-c together.
  - **Read:** `10-notifications-analytics-reports.md` (Analytics; Reports); `05-order-request-form.md` (Fields the Head sets 3); `08-money-and-settlement.md` (Numbers the system calculates); `docs/decisions.md` (D68; the plans of 2.5d-a and 2.5d-b, pull requests #173 and #174).
  - **Build:** (1) Analytics and reports by department show an order without a department under "No department" (D68), so their totals add up; its bar opens its records like any other (10 Analytics point 3), through a "no department" value of the department filter read by every analytics filter. (2) Every planned sum of analytics and reports that leaves orders without a planned price out says how many ("1 without a price"), on screen and in their Excel and PDF: the plan-vs-actual blocks of the Head, the Managers and Finance, the Planned vs actual report, the Order register summary, Cash needed soon and My estimates. 2.5d-b already leaves those orders out of each sum (`analytics_orders.planned_cash` empty, no outcome row, My estimates filtered). Texts in uz, ru and en.
  - **Done when:** spending by department (analytics) and the Spending report by department, each with one order without a department, show "No department" and add up to the total; the bar opens that order; each planned sum named in Build (2) with one unpriced order says "1 without a price", with a test each, and so do their Excel and PDF; a Playwright test at 375 px and 1440 px. The permission-matrix test holds every changed query three ways (.claude/rules/tests.md). Migrations run on an empty database and the seed still runs.

- [x] **4.10d The Principal step switch**
  - **Read:** `06-approval-workflow.md` (Allowed moves; Rules: 4; Principal step switched off; Finance step switched off); `03-roles-and-permissions.md` (Rules: 5, 6; Permission matrix); `05-order-request-form.md` (Drafts: 4); `07-purchasing.md` (Purchase record: Date bought); `10-notifications-analytics-reports.md` (Notifications; Analytics: Approval speed, My approvals); `11-screens-and-ux.md` (Order page layout); `14-data-model.md` (`orders`; Notes for the build: settings keys); `15-quality-and-acceptance.md` (S21, S25); `edge-cases/requests-and-approval.md`; `edge-cases/developer-rules.md`; `docs/decisions.md` (D62, D69; the plan of 4.10c).
  - **Build:** One migration adds `orders.skipped_principal` (boolean, false) and the settings key `principal_step` (true) with its CHECK, and a CHECK that an order that skipped the Principal is never Waiting for Principal. (1) The Head's Settings page switches `principal_step`, with a confirmation and an audit row; switching off is refused, naming the orders, while any order is Waiting for Principal, checked on the server under the lock a Head's approval also takes, so the two cannot cross. (2) `src/domain/order-moves.ts`: the Head's Approve, and the Submit of an order the Head created, go to the next step that is on, read in the same transaction as the move; the order is marked `skipped_principal`, and the mark is set or cleared by every Head approval; with both steps off the order opens and is marked `skipped_finance` too, setting `approved_at`, so every rule of 4.10c applies to it. (3) The notice "Head approved" goes where "Principal approved" goes while the step is off; no "no active Principal" warning while the step is off. (4) The stepper, the History tab, the Excel and the PDF show the Principal step as "Skipped"; approval-speed analytics count no time at a skipped step. Texts in uz, ru and en.
  - **Done when:** S25 passes as a database test and as a Playwright test at 375 px and 1440 px, and S21 still passes; a test per rule names it, among them: a Head's approval at the moment of the switch never leaves an order Waiting for Principal with the step off; an order sent back from Finance and approved again by the Head with the step on waits for the Principal and loses the mark; with both steps off, a Head-created order opens on Submit with no cash count. The permission-matrix test holds the switch. Migrations run on an empty database and the seed still runs.
  - Added by the owner on 27.10.2026 (D69): the Procurement Head says orders do not need the Principal's approval.

- [ ] **9.5 Real data**
  - **Read:** `04-catalogs.md` (Rules: 7); `09-warehouse.md` (Direct entry by the Head); `edge-cases/warehouse.md` ("The school already has stock on launch day").
  - **Build:** First the end of the trial (D52): `SEED_DEMO_DATA` removed from the app (its next start writes no demo users), then `npm run trial:reset`, then the first Head created by `npm run user:first-head`, and a second Head account created by that Head, so a Head's password can be renewed in the app (D55). Then, with the owner: catalogs, departments and prices imported from the school's Excel files; users created by the Head; existing stock entered by direct entry. The files never enter the repository, a test, a log or a chat.
  - **Done when:** The Head confirms the counts of products, users and stock lines on production.
