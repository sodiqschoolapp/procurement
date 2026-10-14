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
| D16 | 10.10.2026 | The owner's machine is Windows 11. Tools are checked and installed in step "Once" of `docs/START-HERE.md`. The GitHub repository is private and is `sodiqschoolapp/procurement`. Changed on 14.10.2026: the owner makes it public before the routines are created, and the loop trusts only `abbosc` and this repository's branches (D32 to D36). | Owner's answers. |
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
| D27 | 14.10.2026 | **Both routine prompts say what the skills say since D26.** The review prompt: every Look first decision is marked and listed first; a spec contradiction is decided like a silence (confirm or change the reading, marked Look first, with the proposed `/spec-change` wording), never an owner decision; the check runs are read first, so a head with no checks that conflicts with `main` gets `CI red (no checks: merge conflict with main)` with the conflicting files at once, not after 15 minutes of waiting. The start prompt: the skill stops for a stop-list item too; a task too large is no stop, the skill splits it and goes on. `docs/cloud-loop.md`, sections 3 and 5. | From sodiq-platform pull request #56 (12.10.2026). A routine runs from the prompt pasted into it, which a merged file does not change: the prompts copied on 12 October still carried the stops that D26 removed, and the review prompt waited up to 15 minutes for CI that GitHub never runs on a conflicting branch. |
| D28 | 14.10.2026 | **After every push the builder checks that CI started** (`next-task` and `finish-task`, "After every push"): a check run `checks` on the new head within 15 minutes. None, and the branch conflicts with `main`: merge `main`. None otherwise: at once a comment that starts with `@abbosc`, the label `needs-owner`, and the builder stops. The builder never pushes an empty commit and never closes and reopens a pull request to start CI; the empty commit `<id> CI again` of `finish-task` is gone. Before task 0.3 no CI exists and nothing is checked. | From sodiq-platform pull request #69 (13.10.2026). On 12 October GitHub recorded a push there and fired no `pull_request` event: no CI ran, the reviewer never woke, and the task waited more than an hour until the owner closed and reopened the pull request. A cloud session's own rules forbid an empty commit or a close and reopen to start CI, so the call to the owner is immediate and loud. |
| D29 | 14.10.2026 | **A CI failure outside the pull request's code is re-run once, and nothing is pushed after a green re-run** (`finish-task` step 9): the failure is outside the tests (every test passed; a teardown, a download or the runner failed) and the same suite is green locally and on `main`. The builder re-runs the failed jobs once and waits up to 20 minutes. Green: one comment, no commit, and the review routine picks the head up (D30). Red again: no second re-run; it is root-caused as any red CI. | From sodiq-platform pull request #69 (13.10.2026). There a check failed in its teardown after every test had passed; the re-run passed but woke nobody, because a re-run fires no `pull_request` event. An empty commit is forbidden to the builder (D28). |
| D30 | 14.10.2026 | **The reviewer reviews a head whose checks passed after a CI red verdict** (`review-pr` step 1 and Rules; the review prompt): a pull request whose newest `[review]` is a `CI red` verdict at its head sha needs a review once every check run of that sha has completed with success (`checks` and `e2e` `success`, none running, failed, cancelled or timed out; a `routines.yml` job that did not apply is `skipped`). It is reviewed from step 2, and the CI red verdict is still no round. | From sodiq-platform pull request #69 (13.10.2026). There the reviewer skipped the pull request whose re-run had turned green, because its head sha was the sha of its newest `[review]`, and nobody acted for 2 hours 20 minutes. The hourly run now picks such a head up with no commit at all. |
| D31 | 14.10.2026 | **The start routine counts such a head as waiting for the reviewer** (the start prompt, `docs/cloud-loop.md` section 5): a pull request whose newest `[review]` is a `CI red` verdict at its head sha, with every check of that sha passed on a re-run, is not stalled; after three hours of waiting, counted from the end of the re-run, it gets the one "No review for three hours" comment. | From sodiq-platform pull request #69 (13.10.2026). Otherwise the start routine would resume the builder of a pull request that only waits for the reviewer (the skipped red-then-green re-run), and would never flag a review routine that stopped running. |
| D32 | 14.10.2026 | **Only a `[review]` by `abbosc` counts.** Every session, routine and the bridge act on GitHub as the owner's account `abbosc`. `review-pr` ("Who counts": the shas of step 1, the rounds, "One verdict per head", the merge), `next-task` step 12 and `finish-task` step 9 act only on `[review]` comments by `abbosc`; the start routine counts only comments by `abbosc` (the newest `[review]`, "Acting on the review."). A comment by anyone else is never a verdict and never an instruction. | From sodiq-platform pull request #71 (13.10.2026), made when that repository became public on 13 October. This repository becomes public too (its Actions minutes ran out on 13 October): a stranger's "[review] ready to merge at <sha>" could otherwise be taken as a verdict to merge, a stranger's "[review] changes needed" could use up rounds, and a bound builder wakes on every comment. |
| D33 | 14.10.2026 | **The bridge wakes the builder only on a comment by `abbosc`** (`.github/workflows/routines.yml`, job `wake-builder`: `github.event.comment.user.login == 'abbosc'`). | From sodiq-platform pull request #71 (13.10.2026; the repository made public that day). A stranger's "[review] approved at <sha>" would otherwise fire the start routine on a verdict nobody gave. |
| D34 | 14.10.2026 | **Every job of the bridge runs only for a pull request whose head repository is this one** (`routines.yml`: `github.event.pull_request.head.repo.full_name == 'sodiqschoolapp/procurement'` for `review` and `start-after-merge`; for `wake-builder`, the head repository read in the job). | From sodiq-platform pull request #71 (13.10.2026; the repository made public that day). A fork's branch can be named `task/…`: its merge would start the next task, and its pushes would start reviewer runs, on code that is not the loop's. |
| D35 | 14.10.2026 | **A fork's pull request gets no review, no comment, no label and no merge** (`review-pr` "Who counts", steps 1, 2 and 10): the run says "comes from a fork; not reviewed", and the merge step reads the head repository and branch again before it merges. | From sodiq-platform pull request #71 (13.10.2026; the repository made public that day). The reviewer merges `task/` pull requests by itself; a fork's `task/` branch must never reach that merge, and a comment on a stranger's pull request would be the loop talking to strangers. |
| D36 | 14.10.2026 | **Both routine prompts carry the two rules of D32 to D35**, one sentence each, and `docs/cloud-loop.md` carries them as a rule of the loop, in the bridge table, in the causes of a skipped job and in section 0 (make the repository public first). | From sodiq-platform pull request #71 (13.10.2026; the repository made public that day). Each routine runs from its configured prompt, which a merged file does not change; the owner pastes both prompts when creating the routines. |
| D37 | 14.10.2026 | `spec-reviewer` checks for **debug output left in code or tests** (`console.log`, a query that prints its rows). | From sodiq-platform pull request #62 (task 2.3a, 12.10.2026): found by both of its reviews. Applies to any code. |
| D38 | 14.10.2026 | `spec-reviewer` checks for **a fixture made under a guard** (`if (result.ok)`, `if (row)`, `if (status === 201)`) instead of an assertion. | From sodiq-platform pull request #65 (task 2.3c-1, 12.10.2026): a conditional fixture lets a case pass without running. Worded for server actions, whose results the wrapper returns. |
| D39 | 14.10.2026 | `spec-reviewer` checks that **every branch of a database guard** (a CHECK, a unique index, a foreign key, a trigger; insert and update, each refused case) has a test that reaches the database with nothing in front of it that refuses first (`authorize()`, the action wrapper, a Zod schema, another constraint). | From sodiq-platform pull request #68 (task 2.4b-1, 13.10.2026). Here the database is the last defence (`CLAUDE.md` rule 5): a guard whose test is stopped earlier by the wrapper proves nothing about the guard. |
| D40 | 14.10.2026 | `spec-reviewer` checks that **a test that a guard lets a case through carries the data the guard would refuse if it were wrong** (another branch's record beside it, a status one step off, a quantity one past the stock). | From sodiq-platform pull request #68 (task 2.4b-1, 13.10.2026). A pass test without that data passes with or without the guard; here it matters most for the branch wall and the stock CHECK. |
| D41 | 14.10.2026 | `spec-reviewer` checks for **a unique mark or claim left held on a deactivated record** that no screen or server action can reach any more, where the spec does not say it stays held: the deactivating action frees it in the same transaction with its audit row, or an action can still free it. | From sodiq-platform pull request #74 (task 2.5b-2, 13.10.2026). Here records are deactivated, never deleted (`CLAUDE.md` rule 11), so a held code or username can block a new record for good. Where the spec keeps a mark held (a request number), the check does not apply. |

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

### 0.3 CI (14.10.2026)

The owner's answers are "Decided ahead: task 0.3", items 1 to 9. Decided without the owner, all confirmed by the plan review of 14.10.2026:

1. On a push to `main`, the "no merged migration edited" step compares with the commit before the push (`github.event.before`; skipped when all zeros, a new branch). Decided ahead 5 names only the pull request command, which on `main` lists nothing.
2. "On an empty database" and "a second run that applies nothing" are checked by the output of `db:migrate` (an `applied` line per journal entry, then `nothing to apply`), before `npm test`. An exit code of 0 passes in both wrong cases.
3. Guard 2 compares the total row count of `drizzle.__drizzle_migrations` with the journal in both directions, each with its own message; a database ahead of the code is refused too.
4. `applyMigrations` takes an optional migrations folder, used by every journal read and by `migrate()`; only the database test passes one.
5. The e2e job runs the app with `npm run dev`, the `webServer` of `playwright.config.ts`: no `start` script exists before 0.15.
6. Concurrency: a group per pull request with `cancel-in-progress`; a group per sha on `main`, so no merge loses its run.
7. 20 minutes per job.
8. The Playwright headless shell (`--only-shell`) with `--with-deps`.
9. The deliberately failing test was its own file and commit, pushed after a green run and deleted by the next commit (plan review, correction 1).
10. Actions pinned to the commit of their newest release tag at build time (checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2), the tag in a comment; no Dependabot file.

Choices made during the build:

- On a pull request the migration step fails with a message when `git merge-base origin/main HEAD` finds nothing (plan review, correction 3).
- Both checkouts set `persist-credentials: false` (permission review): no step needs the token after checkout, so the code under test cannot read it from `.git/config`.
- The journal checks are one function in the test, run on `drizzle/` and on invented broken journals (spec review): with one journal entry, the ascending check could not fail on `drizzle/` alone.

### 0.16 Test copy: the app online at the test address (14.10.2026)

The owner's answers are "Decided ahead: task 0.16", items 1 to 5. Decided without the owner, all confirmed by the plan review of 14.10.2026 (corrections 1 to 3 applied):

1. **Look first.** `/health` answers without sign-in and without `authorize()`: App Platform's health check cannot sign in; the route reads no table and returns only a status word, the session time zone and the commit sha. A spec contradiction with `developer-rules.md` rule 4 and `CLAUDE.md` rule 4; proposed `/spec-change`: "The one exception is the health route `/health`: it answers without sign-in, reads no table and returns only whether the database answers, its time zone and the commit."
2. **Look first.** Migrations run in the container's start command (`scripts/start.sh`) before `next start`, not in a pre-deploy job, which would be a second billed component.
3. **Look first.** `.do/app.yaml`: `apps-s-1vcpu-1gb-fixed` ($10; the non-fixed 1 GiB slug costs $12), one instance, a dev database ($7), PG 17. Written from memory: DigitalOcean's pages could not be read from the session. The owner checks the $17 total before Create and stops otherwise (`docs/deploy.md`, step 3).
4. **Look first.** `18-hosting-and-costs.md` says "from task 0.15" in row 7 and in "Total, required"; proposed `/spec-change`: row 7 "Yes, from task 0.16 (D22) until go-live: …" and "While the app is being built, from task 0.16, only the test copy runs: $17 per month."
5. The database certificate is verified: `DATABASE_CA_CERT` (`${db.CA_CERT}`), `rejectUnauthorized: true`, the address's `sslmode` removed, because the installed `pg` reads `sslmode=require` as `verify-full` and would refuse DigitalOcean's CA.
6. If `${db.CA_CERT}` is not bound, the owner types the CA certificate of the database page as `DATABASE_CA_CERT` in the dashboard (public material, never in the repository).
7. The commit comes from `${_self.COMMIT_HASH}` as `GIT_COMMIT` at run time (`$GITHUB_SHA` or the pull request's head in CI), `unknown` when unset.
8. The start page shows "Versiya <7 characters>" (`start.version` in three files); the page is dynamic.
9. The route is `/health`, not under `/api/` (D5); the database client is loaded inside the handler, so `next build` needs no `DATABASE_URL`.
10. The runtime image holds the full production `node_modules` and runs `next start`, not the standalone output, which would leave out Drizzle's migrator. Base `node:24-bookworm-slim` pinned by digest; user `node`; port 8080.
11. The CI steps are added to the job `e2e`, whose name and 20-minute timeout stay.
12. `deploy_on_push: true` through DigitalOcean's GitHub app; no deploy key, no GitHub secret.
13. `/health` waits 3 s for the database; App Platform's health check: `/health`, 20 s initial delay, 10 s period, 5 s timeout, 6 failures.
14. Every value of `.do/app.yaml` is a binding or `production`; `docs/deploy.md` names each variable and where it is seen.

Choices made during the build:

- `NODE_ENV` has the scope `RUN_TIME` in `.do/app.yaml`, not build time: a build-time `production` could make the build stage skip the development packages `next build` needs (spec review).
- `.dockerignore` also keeps out `data`, `imports` and spreadsheets, as `.gitignore` does, with `public/templates/**/*.xlsx` let through (permission review): a local `docker build` must not copy real school files into its build layers.
- The CI check of a failed migration requires a non-zero exit within 120 s and the `db:migrate failed:` line (spec review): an empty status from a timeout no longer passes.
- The version line uses the caption size (`text-xs`, 12/16) in Golos with `tabular-nums`, not `<code>` (spec review; `docs/design-system.md`, Type).

### 0.4 Clock, ids and test helpers (14.10.2026)

Decided without the owner; all confirmed by the plan review of 14.10.2026, number 7 changed in part, corrections 1 to 4 applied. None is of a Look first kind.

1. The forbidden call is reading the current time: `new Date()` with no argument, `Date.now` (called or as a reference), `Date()`, and `Temporal.Now` (review correction 4). `new Date(<value>)` builds a fixed moment and is allowed.
2. The check is ESLint's `no-restricted-syntax` (`FORBIDDEN_TIME_SELECTORS` in `eslint.config.mjs`), proved through ESLint's Node API in `tests/forbidden-time.test.ts`; `performance.now()` (a duration) is allowed.
3. The clock is `src/server/clock.ts`; the business-date functions are pure in `src/domain/business-date.ts` and take the moment as an argument; the generator is `src/components/client-key.ts`.
4. One module-level clock, fixed by tests through `setTestClock()`, which throws when `NODE_ENV` is `production`; not a clock passed through every call.
5. A business date is the text `YYYY-MM-DD`, the form of a PostgreSQL `date`.
6. The business year is the calendar year in Tashkent (`05-order-request-form.md` rule 2, A9): 31.12.2026 19:00 UTC is already 2027.
7. `client_key` is a UUID v4 from `crypto.randomUUID()`, and every `client_key` column is `uuid UNIQUE`. Whether it is NOT NULL follows 0.2 item 8 and is decided in each table's plan (reviewer's change).
8. Invented users and branches are plain data now; `insertUser()` comes with 0.6 and `insertBranch()` with 0.7.
9. `emptyTables()` is not built: the Build line does not name it, and a database per test file keeps files apart.
10. `.defaultNow()` is forbidden too: a column default reads the database's time (0.2 item 3). A raw `` sql`now()` `` cannot be caught by the syntax rule and is left to review.
11. A fixed clock is frozen; `advanceClock()` moves it and throws when no clock is fixed (correction 3). `setClock()` refuses a text without `Z` or an offset (correction 1); `businessDate()` and `businessYear()` throw on an invalid moment (correction 2).

Choices made during the build:

- Only test files may import `setTestClock` and `isTestClockSet` (`no-restricted-imports` for `src/**` outside `*.test.ts`; permission review): app code that moved the clock could change business dates on a server whose `NODE_ENV` is not `production`. `import "server-only"` was proposed too and not added: it would be a new dependency, and `src/server/` modules have none of it yet (0.2 note for 0.7).
- `dropTestDatabase` waits up to 5 s until no connection to the database is left, then drops `with (force)`. `pg`'s `pool.end()` resolves before the connections have left the server; the forced drop terminated one (57P01) and CI failed on an unhandled error after every test had passed. Proved by `tests/helpers/test-database-teardown.db.test.ts`, which fails without the wait.
- Invented phones use `+998 90 000 xx xx`. 90 is a real mobile prefix in Uzbekistan; the numbers are invented, not taken from a range reserved for tests (none is known).

### 0.5 Languages and formats (14.10.2026)

Decided without the owner; all confirmed by the plan review of 14.10.2026, corrections 1 to 4 applied. None is of a Look first kind.

1. The language is the signed-in user's `locale`, else the cookie `locale`, else Uzbek; `Accept-Language` is ignored and any value other than exactly `uz`, `ru`, `en` is ignored (`chooseLocale()` in `src/i18n/locale.ts`). Reason: A2, "Each user picks one; Uzbek is the default"; the sign-in page's language select (`docs/design-system.md`) needs a place to keep the choice before sign-in.
2. Money is `1 250 000 so'm` in all three languages; the word is the message key `format.currency`. Reason: rule 10 writes it literally, rule 14 is met by the key. `сум` in Russian would be a `/spec-change` of rule 10 plus one value in `ru.json`.
3. The spaces in money and quantities are no-break spaces (U+00A0), so an amount never splits across two lines.
4. A quantity's decimal separator follows the language: comma in uz and ru, point in en; thousands grouped like money.
5. The formatters never round; a quantity shows the digits the column holds without trailing zeros; `-0.000` shows `0`.
6. The formatters live in `src/i18n/format.ts` (display, not business formulas); the Tashkent wall clock is `businessTime()` in `src/domain/business-date.ts`, so it exists once.
7. Time is `HH:mm`, no seconds, the same in all three languages; a screen that needs date and time calls both formatters.
8. The translation check also fails on an empty or non-text value.
9. The lint rule is `react/jsx-no-literals` (`noStrings`, `ignoreProps`) plus `no-restricted-syntax` for a non-empty string in `aria-label`, `title`, `placeholder`, `alt`, `label` (plain, in braces, or a template). Not caught: a text in a variable, another prop, or `metadata`; reviewers look for them.
10. The Uzbek code is `uz`, not `uz-Latn` (`14-data-model.md` enum `uz|ru|en`).

Choices made during the build:

- `useFormatters()` and `getFormatters()` are two files (`src/i18n/use-formatters.ts`, `src/i18n/get-formatters.ts`): `next-intl/server` must not be imported by a client component (plan review, "Not checked").
- `alt=""` passes the lint rule: an empty alt marks a decorative image (rule 13; spec-reviewer of the diff).
- next-intl 4.14.9 brings its own dependencies into the lock file (`@formatjs/*`, `intl-messageformat`, `use-intl`, and for its message extractor `@swc/core` and `@parcel/watcher` with their platform builds). The production audit finds nothing. The lock file was written with npm 11, as CI's Node 24 uses; npm 10 removes the `libc` fields.
- `npm run i18n:check` runs `scripts/check-translations.mjs`; with a folder as its argument it checks that folder instead (for tests).

### 0.6 Sign-in and sessions (14.10.2026)

Decided without the owner; confirmed or changed by the plan review of 14.10.2026 (corrections 1 to 7 applied). The Look first items come first.

1. **Look first.** A table `login_attempts` outside the 34 tables of `14-data-model.md`. Reason: the library's limiter counts per address and only on its HTTP route, which is not mounted; 20 to 30 users behind a few addresses would lock each other out. Proposed `/spec-change` of `14-data-model.md`, first paragraph: "…plus the session tables the login library creates and `login_attempts` (username, succeeded), which counts sign-in tries for the limit of developer-rules rule 13."
2. **Look first.** New dependencies: `better-auth` 1.7.7 (MIT; 1.7.4 to 1.7.7 released 10 to 30 September 2026), `zod` 4 (MIT, on the stack line), `react-hook-form` 7.90 (MIT, on the stack line: "React Hook Form with Zod") and `@hookform/resolvers` 5.9 (MIT; the glue between the two, not on the stack line by name; added during the build). Audit: `npm audit --omit=dev` finds 4 moderate and no high, all `esbuild`/`@esbuild-kit` through `drizzle-kit`, which better-auth declares as an optional peer and npm therefore installs as a production package (the findings of decisions 0.2). Nothing forced with `overrides`. Telemetry is pinned off.
3. **Look first.** Sign-in, sign-out and the sign-in page's language choice run without `authorize()` and outside the action wrapper; sign-out ends only the caller's own session. Proposed `/spec-change` of developer-rules rules 3 and 4: "Sign-in, sign-out and the sign-in page's language choice run without `authorize()` and outside the action wrapper; sign-out ends only the caller's own session." For 0.7: the permission matrix lists the three actions as open to everyone.
4. **Look first.** Session rows are deleted on sign-out (by our `signOut()`, by token) and by sign-in when its own commit fails: an exception to rule 11; they are the library's tokens, not records with data. Proposed `/spec-change` of `14-data-model.md`, first paragraph: "Session rows are the login library's tokens and are deleted when they end."
5. **Look first.** "5 tries per 15 minutes" (developer-rules rule 13): after 5 **failed** tries of one username within 15 minutes, every try of that username is refused without checking the password until the oldest is 15 minutes old. A try the limit refuses writes no row (decided during the build): counting it would keep the username locked for as long as someone keeps trying, against the review's worked example (failures 08:00 to 08:04, a try at 08:10 refused, at 08:15:00 allowed).
6. One refusal text for a wrong password, an unknown username and an inactive user; an inactive user's try counts. An unknown or inactive username costs a password hash too, so the time of the answer tells nothing (permission review).
7. `expires_at` is set once from our clock by the library's session create hook and never extended; only our reader (`src/server/auth/session.ts`) judges it; the library's `getSession` is never used.
8. No library HTTP route (D5).
9. `SameSite=Lax`; `Secure` and the `__Secure-` cookie name under `NODE_ENV=production`.
10. Placeholder email `<user id>@users.invalid` (RFC 2606).
11. Usernames lower-case, 3 to 30 of `a-z 0-9 _ .`, matched in any case; a CHECK keeps them lower-case.
12. Password length at most 4096; username at most 256 in the Zod schema (review correction 6).
13. scrypt, the library's default hash.
14. `/` stays the public placeholder until 0.10 (CI's container step reads the commit there).
15. A session read checks `is_active`.
16. React Hook Form with the server's Zod schema.
17. The first-Head script reads the time once on its command line (a plain `.mjs` cannot load the clock); it refuses when any HEAD exists.
18. The library is created lazily (`getAuth()`); in production the secret must be set, at least 32 characters and not the public default, or every cookie reads as signed out and sign-in is refused (review correction 1; permission review).
19. **Changed by the review:** a `verifications` table with the library's columns; nothing writes to it.
20. No audit row from the first-Head script until 0.9.

Choices made during the build:

- The library's `nextCookies()` plugin is not used and its own Set-Cookie is ignored. `src/server/auth/session-cookie.ts` signs the token itself (HMAC-SHA256, `<token>.<base64url signature>`, compared with `timingSafeEqual`) and the Server Action sets the cookie with `cookies().set`: only our reader reads it, and the core `signIn()` stays callable from tests outside a request.
- The library has its own pool of 4 connections (review correction 3): `signIn()` holds an app connection inside its transaction while the library writes the session. Proved by 12 sign-ins at once. Together with the app's pool that is at most 14 connections.
- The library is told our extra user columns as `additionalFields` with `input: false`: its Drizzle schema check refuses to start otherwise; nothing a browser sends can set them.
- `src/server/auth/password-user.mjs` (the plan's `placeholder-email.mjs`) inserts a user and its password account; the first-Head script and `tests/helpers/users.ts` share it.
- The e2e user `e2e_manager` is a Manager written by Playwright's global setup, so `npm run user:first-head` still works on the same local database.
- The `--primary-hover` and `--secondary-hover` tokens do not exist yet (0.10); the buttons hover with `/90` and `/80` of their fill until then.
- `session.ts` and `sign-in.ts` load the database client inside their functions, as `/health` does: the layout reads the session and `next build` runs with no `DATABASE_URL` (the CI image step failed on it); `no-database-at-import.test.ts` guards it.
- Constraint style: foreign keys keep Drizzle's names (`sessions_user_id_users_id_fk`); the library's tables carry `updated_at`.

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

### The loop brought up to sodiq-platform of 14 October (14.10.2026)

Pull request #11 copied the other project's loop as it stood on 12.10.2026 at about 00:40 UTC. That loop then ran about 25 tasks and changed in three process pull requests and in its reviewers' checklist. Every change that is a rule of the loop is brought here as D27 to D41, adapted to this stack: npm, server actions, the check run `checks` as the sign that CI started, `.github/workflows/ci.yml` as the CI workflow, and nothing to check before task 0.3. #11's own choices stay: the routine minutes 17 and 47, the `procurement-review` environment, issue #9, task 0.3 merged by hand once, the test copy as task 0.16.

Left out, with the reason:

- Two check lines of the other project's `spec-reviewer` from the same commits: a lock test that proves only the order of locks (task 2.3a), not in the owner's list for this change; and a person-wide fact read through the row-filtered `staff_branches` (task 2.3c-1), which is about that project's own tables and row security.
- Its check lines added by later tasks (2.5 to 2.7) to `.claude/rules/`: they name its own screens, tables and functions.
- `CLAUDE.md` and `.claude/settings.json`: unchanged there since the copy. The REST calls of the new steps (the check runs, the re-run of failed jobs) are already allowed here by `gh api *`.

The history was searched before the repository becomes public (all 45 commits of every branch): no secret, key, token or `.env` file; the passwords and database addresses in tests are invented; no phone number, and no email address but the commit authors' and an invented one. The owner's commit email is in the author line of the owner's commits.
