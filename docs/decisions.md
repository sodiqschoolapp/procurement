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
| D20 | 12.10.2026 | **Decide and flag** replaces "the builder asks, it never guesses". Where the spec is silent or unclear the builder takes the most reasonable reading, writes it under "Decided without the owner" with the reason and goes on; the reviewer confirms or changes it; the owner confirms or changes it afterwards on issue #9, and a changed decision becomes a fix task `<id>b`. No extra stop for rules about money, stock or the approval order: those are **Look first** decisions. In force since the process change of 12.10.2026 (`CLAUDE.md`, the skills). It replaces rule 15 of `edge-cases/developer-rules.md` ("Ask, do not guess") and the sentence "Nobody decides one alone" of `open-questions.md`; the spec change of 14.10.2026 rewrote both. | Owner's decision, "exactly as in sodiq-platform": the owner reviews every independent decision on the decisions issue and changes what is wrong through fix tasks. |
| D21 | 12.10.2026 | **The review routine merges task pull requests**: `task/` branches only, at the commit it reviewed, with the checks `checks` and `e2e` green. The owner merges spec changes and process changes, and task 0.3 once, by hand, because no CI exists before it. Replaces D17 for task pull requests. In force since the process change of 12.10.2026. | Owner's decision. The merge was the one step that still needed a person on every task. |
| D22 | 12.10.2026 | **The test copy comes now**, as task 0.16, the next task after 0.3: the app online at `ombor-test.sodiqschool.uz`, a new version on every merge to `main`. The task is built by the loop like any other; the owner's own steps (the DigitalOcean account and its payment, the app created from the repository, the DNS record) are listed in `docs/deploy.md` and done after the merge. Task 0.15 keeps what needs later tasks: the test copy's file storage and its seed users. The cost note of `18-hosting-and-costs.md` says "from task 0.16" since the spec change of 14.10.2026. | Owner's decision. With the loop, the owner looks at each merged task online; the test copy costs $17 a month from the day the owner creates it. |
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

### 0.7 Permissions and the branch wall (14.10.2026)

The plan's decisions, as the plan review of 14.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first.** "At most one active PRINCIPAL per branch": "active" is the user's `is_active`. `user_branches` carries the copies `user_role` and `user_is_active`, held equal to the user's by the composite foreign key `user_branches_user_fk` (user_id, user_role, user_is_active) → `users(id, role, is_active)` `ON UPDATE CASCADE`, so the partial unique index `user_branches_active_principal_branch_id_key` can read them. **Amendment of constraint style 9:** an `ON UPDATE CASCADE` is allowed only on a foreign key whose columns are copies kept for a constraint; it cascades no delete, and every other relation still cascades nothing. A partial unique index cannot be deferred, so **replacing a Principal (1.3) deactivates the old one before it adds or activates the new one, inside its one transaction.** Proposed `/spec-change` of `14-data-model.md`, user_branches: "user_id, branch_id, user_role, user_is_active KEY (user_id, branch_id) -- the role and active flag copied from users by a foreign key, so the partial unique index can read them".
2. **Look first.** "Exactly one row for PRINCIPAL" is held by the database: at most one by `user_branches_principal_user_id_key`, at least one by the deferred constraint trigger `user_branches_principal_has_one_branch` (on `users` insert and role update, on every write of `user_branches`), which raises `check_violation` naming itself as the constraint. A Manager or Finance user with no branch is allowed; "one or more" is the user form's (1.3).
3. **Look first.** The matrix as data (`src/domain/permissions.ts`): one permission per row of `03`, split where Manager rights differ: `stock.issue`, `stock.return_reverse`, `stock.transfer`; `stock.ask_write_off` and `stock.start_count` (both `WRITE_OFF_COUNT`); `purchase.record`, `purchase.cancel`, `request.close_exact` on own requests; `stock.set_minimums`; `catalog.suggest` as a branch permission. Rights are checked for Managers only. Reversing documents other than issues waits for open question 19 (5.7).
4. **Look first** (decided in the build, permission review). "Create, edit, submit, cancel a request" is split in two: `request.create` in own branches, and `request.edit` (edit, submit, cancel, take back) on own requests, the Head in any branch; both under `CREATE_REQUESTS`. Reason: `03` rule 7 (one owner) and `06` Allowed moves ("Submit: Owner or Head", "Take back: Owner", "Cancel: Owner or Head"); otherwise any Manager of the branch could submit a colleague's request.
5. **Look first.** Export, PDF and print are branch permissions like "See requests": another branch's export answers `not_found`.
6. **Look first.** The order in `decide()`: another branch `not_found` first, then role, Manager right and owner, each `forbidden`. The Head sees every branch.
7. **Look first.** `authorize()` reads the actor from the database on every call (role, `is_active`, branches, rights switched off), in one query, inside the transaction it is given.
8. **Look first.** `branchFilter()` is a subquery on `user_branches` inside the list's own SQL.
9. **Look first.** Inactive branches are neither filtered out nor refused; 1.2 and 5.13 decide what they still allow.
10. **Look first.** `signInAction`, `signOutAction`, `chooseLanguageAction` are listed as open (decisions 0.6, Look first item 3); the sign-in tests prove sign-out ends only the caller's session.
11. `branches` comes with all its constraints now; `address` is NOT NULL; the code and the name stay held on an inactive branch (D41: the name is freed by renaming in 1.2).
12. `manager_rights` has only the data model's columns; `enabled` is switched in place, the history being the audit row.
13. The refusal is `AuthorizationError` with `kind`; message keys come with 0.8.
14. The fence is an ESLint rule, not `server-only`.

Choices made during the build:

- `Target.branchId` and `Target.ownerId` are read from the record in the database, never from the browser's input; only a create action passes the branch the user chose (permission review; written on the type).
- The matrix test generator (`tests/helpers/permission-matrix.ts`) takes its expected answers from the hand-written `tests/permission-matrix-expected.ts`, never from `PERMISSIONS`; for an own-requests permission it adds the case of a colleague's request (Manager `forbidden`, Head `allow`), and `run` builds the request with `ownerId`.
- The registry (`tests/permission-registry.ts`) also checks layouts and the special route files, refuses an inline `"use server"`, and ignores a `requireUser(` written in a comment. The root layout is listed as open.
- The fence covers `src/app`, `src/components` and `src/features/*/components` (`.ts` and `.tsx`), and catches every module of `src/server/db`, `pg` and `drizzle-orm/node-postgres`, static and `import()`; `/health` is the one exception.
- The three-column foreign key is named `user_branches_user_fk`, not Drizzle's default: the default name passes PostgreSQL's 63 characters. The other foreign keys keep Drizzle's names.
- `MANAGER_RIGHTS` is one list in `src/domain/permissions.ts`; the enum of the schema is made from it.
- `insertUser()` writes the user, the account and the branch rows on one client between BEGIN and COMMIT; a Principal with no branch given gets a new branch.

### 0.8 Server-action foundations (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first.** Order: an unlocked read of branch and owner (`target`), `authorize()`, the lock, the branch and owner compared under the lock (`conflict`), the version, the status. Rule 3 names permission first and permission needs the branch; "check status and version" is one step. A record missing at `target` or gone at `lock` is `not_found`.
2. **Look first.** Same moment: `SELECT … FOR UPDATE` at READ COMMITTED; the second writer finds the new version and gets `stale_version` ("The first wins"). Who acted and when: 2.x.
3. **Look first.** A repeated `client_key` is checked after `authorize()`: a user whose right was switched off between two tries gets `forbidden`, not the first result.
4. **Look first.** Safe repeat reads the action's own `client_key UNIQUE` column (no results table), after `pg_advisory_xact_lock(hashtextextended(key, 0))`; a collision only makes two calls wait. The first result goes back only to the same user in the same branch, else `not_found`; the repeat runs no step after `find`.
5. **Look first.** The wrapper raises the version by 1 itself (`versionOf`); a lock that returns a version without `versionOf` is `unexpected`. A versioned action's Zod schema requires `version` (review correction 3).
6. **Look first.** The client helper tries a lost answer again only when the input carries a client key (three tries, same key); a move without a key is tried once and returns `network`; `run()` ignores calls while one is pending.
7. History and notifications are steps whose place the wrapper fixes; their tables come with 0.9, 0.11 and 2.x.
8. Errors are returned as `ActionResult`, not thrown.
9. An unexpected error is logged by `describeForLog()`: the error's name, and for a database error only its PostgreSQL code and constraint. Changed in the build (both reviewers): Drizzle's `DrizzleQueryError` message holds every bound value, so "name and message" leaked the input.
10. The sample action and its table exist only in `src/server/action.db.test.ts`.
11. ESLint refuses `.transaction(` in `src/app`, `src/features` and `src/components`; sign-in keeps its own in `src/server/auth`.
12. The first-result rule is tested over four cases (same user other branch, colleague, Head, Manager of another branch), not the full role grid.

Choices made during the build:

- Message keys are camelCase (`errors.staleVersion`, `errors.field.tooLong`) like the existing keys of the message files; the codes stay snake_case (`stale_version`) and `ERROR_MESSAGE_KEYS` maps them. The plan wrote `errors.<code>`.
- `serverAction(definition, currentUser = getCurrentUser)`: tests pass the user, as review correction 4 asked; no mock of `next/headers`.
- An action that has neither `repeat` nor `lock` is refused as a definition error (`unexpected`), so no edit skips the check under the lock (permission review).
- `export const x = serverAction(def)` in a `"use server"` file passes `next build` (a throwaway route, removed). A `bigint` in `ActionResult.data` survives React's Flight serialisation exactly (`tests/server-action-bigint.test.ts`).
- A deactivated user is not probed through `target`: `serverAction()` reads the user with `getCurrentUser()`, which refuses an inactive user (decisions 0.6, item 15), so such a call is `signed_out` before any step (answer to the permission review).
- The `ActionError` class lives in `src/server/action.ts`, not `action-result.ts`: only server steps throw it.

### 0.9 Audit log (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 4 applied), renumbered in order, and those of the build. The Look first items come first.

1. **Look first.** `audit_log.entity_id` has no foreign key: one log serves every audited table, and a settings row is named by its text key. `actor_id` keeps its foreign key. Proposed `/spec-change` of `edge-cases/developer-rules.md`, "Constraints the spec names": "`audit_log.entity_id` names a row of the table in `entity`; it has no foreign key, as one log serves every audited table."
2. **Look first.** `audit_log` is append-only: the trigger `audit_log_append_only` refuses UPDATE, DELETE and TRUNCATE with `check_violation`.
3. **Look first.** Reading the history is Head only, through `catalog.manage`; no new permission.
4. **Look first.** The first Head is the actor of its own `user.create` row, written in the same transaction as the user.
5. `action` and `entity` are text with a format CHECK, not enums.
6. `before` and `after` hold the changed fields as a JSON object; a create has `before` null; a `bigint` is stored as its decimal text, a moment as UTC ISO text.
7. Secret field names (`password`, `passwordHash`, `hash`, `token`, `secret`, any case, with or without `_`/`-`, at any depth) are refused; the one list is `src/domain/audit-secrets.mjs` (review correction 1).
8. `created_at` comes from the injected clock as a required argument, with no database default.
9. The query lives in `src/features/audit/`, the component in `src/components/`.
10. The caller gives each field a label key and a value kind; action labels sit under `audit.actions.<action>` with the fallbacks "Changed" and "Other field".
11. No page shows the component in 0.9; the first is 1.1.
12. History pages by 50, newest first, `created_at DESC, id DESC`.

Choices made during the build:

- **Look first** (permission review). `audit()` takes the actor from the wrapper (`audit({ tx, userId }, entry)`), never an `actorId` field the action builds, so no row is written in another user's name. Added to `.claude/rules/server-actions.md`.
- `AUDIT_ACTIONS` in `src/domain/audit.ts` is the typed list of audit actions; a unit test checks that each has its label in uz, ru and en.
- `audit()` runs the shared statement of `audit-row.mjs` through Drizzle by turning `$1 … $n` into bound parameters (`bound()` in `src/server/audit.ts`).
- `changedFields()` orders fields by name; equal values compare by canonical JSON, whatever the key order.
- The component shows a value it cannot format by its kind, or an object or array, as "(unknown value)", never as raw text (spec review). A field that had no value before shows the new value only.
- `listChangeHistory` checks its input with Zod after `authorize()`, reads 51 rows to know whether a next page exists, and shows the actor's current full name (the spec does not say whether the name at the time is meant; the review may change it).
- Tests of `audit_log` count their own rows, since rows cannot be removed between tests.

### 0.10a Design system and shared parts (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 8 applied), and those of the build. The Look first items come first.

1. **Look first.** Task 0.10 is split into 0.10a (design system and shared parts) and 0.10b (shell, menu per role, branch switcher, `/profile`, home pages, the Done-when of 0.10); both keep 0.10's Read line.
2. **Look first.** New dependencies: `@fontsource-variable/golos-text` and `@fontsource-variable/bitter` 5.3 (OFL-1.1), `@base-ui/react` 1.9 (MIT), `@material-symbols/svg-400` 0.48 (Apache-2.0, dev only); `lucide-react` removed and refused by ESLint. Installed by the owner's session (the cloud session's guard refused `npm install`).
3. **Look first.** The words of the colour labels: Number Matches / Less / More, Price Matches / Cheaper / Dearer, Total Even / Left / Over; grey "In progress" (Number, Total) and "Not bought yet" (Price). The amount is shown without its sign; a difference whose sign contradicts the word is refused. "Orange" of `08` is drawn amber. Proposed `/spec-change` of `08-money-and-settlement.md`, "The three colours": rename the column "Orange" to "Amber", write "red beats amber, amber beats green", and every "orange" of "Worked example" becomes "amber".
4. **Look first.** Request statuses use info or muted only: info for the four waiting statuses, Sent back and Open; muted for Draft, Closed, Rejected, Cancelled. The ten codes live in `src/domain/request-status.ts`.
5. The theme follows the device; a chosen light or dark is kept in `localStorage` (`theme`) and set as `<html data-theme>` by an inline script before the first paint. The sign-in button toggles light and dark; the three-way choice is on `/profile` (0.10b).
6. The dark tints are the colour at 16% over the card, composited in sRGB, rounded to whole channels, written as oklch; the contrast test recomputes them.
7. New tokens `--topbar`, `--link`, `--sidebar-avatar`, `--today-muted`; corners 8 / 12 / 6 (`--radius`, `--radius-panel`, `--radius-label`); `--chart-*` untouched until 6.x.
8. Bitter's letters are checked in the browser (CDP `getPlatformFontsForNode`): every letter of the sample is drawn by Bitter, so no language falls back to Golos Text bold.
9. The unsaved-changes guard: the browser's own question on close or reload; link clicks caught on `window` in the capture phase and the back button through a guard history entry, both answered with the confirm dialog.
10. Toasts: success 4 s, an error stays until closed and is announced at once.
11. `/` keeps its placeholder role until 0.10b.
12. `components.json` keeps `"iconLibrary": "lucide"`; ESLint refuses `lucide-react`.

Choices made during the build:

- **Look first.** A colour label in green shows its amount too ("Even 0 so'm", "Matches 0"): `08` says a label "carries an icon, a word and the amount". Price follows Total's sign rule: the difference is planned minus actual, above 0 is Cheaper.
- A pending button keeps its width: the turning icon takes the place of the button's icon, or, on a button with words only, covers the words, which stay readable to screen readers. The sign-in button no longer changes its words to "Signing in…" (key removed).
- The guard is the component `UnsavedChangesGuard` (`src/components/unsaved-changes-guard.tsx`), which renders its own dialog, instead of a hook file.
- Material Symbols renamed `expand_more` to `keyboard_arrow_down`; `scripts/icons.mjs` reads that file under the design system's name. `src/components/icon-paths.ts` is generated and left out of Prettier.
- The skeleton does not pulse: "nothing moves on its own" (design system, Motion).
- Under `prefers-reduced-motion: reduce` every animation and transition takes 0 s, globally in `globals.css`.
- The navy panel shows from 640 px on; the logo is the on-dark file in the dark theme; the hexagon column is white through the token `--sidebar-accent-foreground`, white in both themes (spec review).
- The guard takes its history entry off when the form becomes clean, so a later change guards again, and a Back between fragments of the page does not ask (spec review).
- The dialog backdrop is navy at 50% (`--sidebar`) in both themes.

### 0.10b App shell, menu per role and profile (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 6 applied), and those of the build. The Look first items come first.

1. **Look first.** New permission `profile.edit` (global, all four roles `yes`) for one's own language, branch view and list of branches; `03` has no row for it. Proposed `/spec-change` of `03-roles-and-permissions.md`, Permission matrix, new last row: "Change one's own language and branch view | Yes | Yes | Yes | Yes".
2. **Look first.** The language change writes the audit row `user.change_language` (entity `users`, before/after `locale`) in the same transaction; choosing the same language again writes none.
3. **Look first.** `chooseBranchAction` writes the `branch` cookie only and calls `authorize()` outside the action wrapper; the cookie is checked again against the person's branches at every read. Proposed `/spec-change` of developer-rules rule 3: "…Choosing the branch view writes a cookie only and calls authorize() without the wrapper."
4. **Look first.** The wrapper's global form: an action of a global permission returns `GLOBAL_TARGET` from `target` and `lock`, and `authorize()` is asked without a target. A global target with a branch permission, a branch target with a global permission, and `GLOBAL_TARGET` with `repeat` are definition errors that save nothing (correction 4); the first global create (1.x) decides how its repeat is matched.
5. **Look first.** `tests/e2e/start-page.spec.ts` is replaced by `tests/e2e/login-language.spec.ts`: the start page went by the Build line, and its checks (three languages by default and from the cookie, the bad cookie, the title, no side scroll) now run on `/login` (correction 6).
6. **Look first.** The sample action of `src/server/audit.db.test.ts` used `catalog.manage`, a global permission, with a branch target; decision 4 refuses that pairing, so the sample now uses `GLOBAL_TARGET`. What it checks about the audit row is unchanged.
7. The branch choice is the cookie `branch` (httpOnly, SameSite Lax, Secure in production, one year), never a column. Its value names its user (`<user id>:<branch id or all>`), so the next person on the same device starts on "All my branches"; sign-out also clears it (corrections 2 and 3). Inactive branches stay in the switcher, marked "(inactive)" (0.7 item 9; correction 1).
8. "Several branches" means the person sees more than one: a Head when two or more exist. One branch shows as text, none as nothing.
9. Admin opens `/catalog` and is active on `/catalog/*`, `/users`, `/branches`, `/settings`; Warehouse and Stock open `/warehouse/stock`, active on `/warehouse/*`. Pages not built yet answer Next's "not found".
10. Search (6.10) and the bell (0.11) keep empty places in the top bar; no dead control.
11. Home's title is "My tasks", the menu word "Home"; the empty state names what will appear (from `10`, Home page per role) and has no button.
12. The person block and the phone avatar link to `/profile`, which carries the sign-out button for phones.
13. The rail is `localStorage` `sidebar` = `rail`, set as `<html data-sidebar="rail">` by the theme's inline script; CSS draws it through the `rail:` variant.
14. The commit caption moves to `/login`; CI's container step reads it there; `/health` keeps the full commit; `docs/deploy.md` follows.
15. The browser tests get their own database `procurement_e2e` on the same server, made, migrated and filled by `tests/e2e/global-setup.ts` with invented branches `EA`, `EB`, `EC` and one person per role (plus one Manager per project for the language test); the app runs on port 3100 against it. The dev database keeps no Head from the tests.
16. "More" is a Base UI `Menu` above the tab bar; its items are links.
17. Role words are the keys `roles.*`; every new text is in uz, ru and en; `start.*` and `session.signedInAs` are gone, the page title is `app.title`.
18. Language and theme are segmented controls that save at once; no unsaved-changes guard.

Choices made during the build:

- The language action's definition lives in `src/features/catalog/actions/own-language.ts`: `tests/forbidden-time.test.ts` refuses a database import under `src/app/`.
- `CurrentUser` carries `username`, so `/profile` reads nothing from the database itself.
- The branch choice's input is `{ branch: "all" | <uuid> }`, so the shared `useAction()` hook fits.
- The segmented control gained `pending` (disabled, dimmed, the turning icon on the chosen item); at phone width its words may take two lines.
- The sidebar and the theme choice read `<html>` through `useSyncExternalStore` (`subscribeToRoot()` in `src/components/theme.ts`), not an effect that sets state (ESLint).
- The e2e setup runs `scripts/db-migrate.mjs` in its own process: Playwright loads the setup as CommonJS, which cannot import a module that reads `import.meta`.
- A branch is shown as `{code} — {name}` through the key `branch.option` (no text in a screen).
- The wrapper recognises a global target by its shape (`scope: "global"`), and refuses as a definition error a branch target without a `branchId` (permission review).
- Choosing the language one already has writes nothing: no update and no audit row, so no `users` row changes without its audit row (spec review).
- The proxy hands the asked-for path to the signed-in layout in the request header `x-return-path`, so a session that ended while its cookie stayed returns to the same page after sign-in (spec review).
- The Build and Done-when lines of 0.10b grew on `main` during the build (design system of 14.10.2026): the small button and the small icon button are 44 high at phone width (32 and 32×32 from `sm` on), with the unit test; the rail's current item is its icon on the orange fill, checked in the browser.
- Sign-out is the client component `SignOutButton` with `useFormStatus`, so both sign-out buttons show their loading state (spec review, Must fix).

### 0.11 Notifications (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first.** `notification_type` holds one value per event of `10`, Notifications, now: `REQUEST_SUBMITTED`, `REQUEST_HEAD_APPROVED`, `REQUEST_PRINCIPAL_APPROVED`, `REQUEST_FINANCE_APPROVED`, `REQUEST_SENT_BACK`, `REQUEST_REJECTED`, `CASH_GIVEN`, `CASH_RETURNED`, `CASH_PAID_BACK`, `REQUEST_SENT_TO_SETTLEMENT`, `OVERSPEND_ABOVE_GUARD`, `OVERSPEND_ACKNOWLEDGED`, `REQUEST_CLOSED`, `REQUEST_REOPENED`, `REQUEST_WAITING_24H`, `REQUEST_WAITING_48H`, `NEEDED_BY_NEAR`, `PRODUCT_SUGGESTED`, `PRODUCT_SUGGESTION_DECIDED`, `STOCK_CHANGE_ASKED`, `STOCK_CHANGE_DECIDED`, `TRANSFER_SENT`, `MINIMUM_STOCK_REACHED`, `BRANCH_ROLE_VACANT`, `PURCHASE_CANCELLED`, `PRICE_DIFFERS`, `MANAGER_RIGHT_SWITCHED`. A later value is a new migration (`ALTER TYPE … ADD VALUE`). Open question 17 stays with 8.2.
2. **Look first.** New permission `notification.own` (global, all four roles `yes`): one's own notifications, read and marked read; the SQL filters by the signed-in user. Proposed `/spec-change` of `03-roles-and-permissions.md`, Permission matrix, new last row: "See one's own notifications and mark them read | Yes | Yes | Yes | Yes".
3. **Look first.** `notifications` rows are never deleted and change once, `read_at` from NULL to a moment: the trigger `notifications_guard` (CLAUDE.md rule 11). No "unread again".
4. **Look first.** A notification shows as written, also after the reader loses the branch it names; its link's page checks again. The table has no `branch_id` (`14` has none). Any later type whose params hold a request number or an amount must either filter old rows when read or bring a nullable `branch_id` with `branchFilter()` on the list (permission review, Should fix 2).
5. `notify()` leaves out the actor, repeats and inactive users; with `userId: null` (a job) nobody is left out (correction 1).
6. The bell's count is read on the server and refreshed by `router.refresh()` on focus and every 60 seconds while the tab is visible, held while an unsaved-changes guard is dirty.
7. The bell stays in the top bar at phone width.
8. Opening a notification is the action `openNotification` (marks read, returns the link); "Mark all as read" is included and asks no confirmation.
9. `params` is a JSON object of strings and numbers; money a string of whole so'm. Changed in the build from "strings, numbers and booleans": next-intl takes no boolean argument, so a flag (such as "submitted again") is a word for an ICU `select`.
10. Each type's text and params come with the task that first sends it; `notify()` accepts only such a type. This task has `BRANCH_ROLE_VACANT` (`branch`, `role` through an ICU `select`).
11. `npm run dev:notify` gives the first active Head one `BRANCH_ROLE_VACANT` (branch `DEMO`, link `/`), with the database's `now()` (correction 2); it refuses production, any database but local port 5433, and no active Head.
12. The area is `src/features/notifications/`.

Choices made during the build:

- `notify()` takes the event's `branchId`; when it is not null, only a Head or a person of that branch gets a row, in the same statement (permission review, Should fix 1). A wrongly worked-out recipient list of a later task cannot carry a branch's data to another branch.
- A link is printable ASCII only (`'^[!-~]+$'` and the same in `isInternalLink()`), not "no space or control character": PostgreSQL's `[[:space:]]` and JavaScript's `\s` disagree on U+00A0 (found while checking the spec review's question).
- The recipients go into the one INSERT as a JSON array: Drizzle's `sql` spreads a JavaScript array into a list.
- `bound()` of `src/server/audit.ts` moved to `src/server/bound-sql.ts`, shared with `notify()`.
- The page is capped at 10 000 and a page past the end goes to page 1 (spec review).
- The two actions revalidate the layout in their `"use server"` wrappers and the screen only navigates: `router.push()` with `router.refresh()` at once left the address on `/notifications` while the page showed the link's page (one phone run of the browser test).
- The unsaved-changes guard counts the dirty guards on the page (`hasUnsavedChanges()`), which the bell reads.
- `NOTIFICATIONS_PAGE_SIZE` lives in `src/domain/notifications.ts`: the registry test reads every export of a queries file as a query.

### 0.12 File storage (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first.** SeaweedFS (`chrislusf/seaweedfs:4.48`, Apache-2.0) replaces MinIO on the developer's computer and in CI: MinIO's images are gone from Docker Hub, `quay.io/minio/minio` answers 403 from a cloud session, and the project is archived. The app speaks S3 only, so R2 in the cloud is unchanged. Proposed `/spec-change`: `13-technology.md`, row Files, "MinIO on the developer's computer" → "SeaweedFS (S3 API) on the developer's computer", and row Running it, "Docker Compose with MinIO" → "Docker Compose with SeaweedFS"; the owner also changes `CLAUDE.md`'s stack line ("Cloudflare R2 (MinIO locally)" → "Cloudflare R2 (SeaweedFS locally)"), the 0.12 Build line, and closes D18 naming SeaweedFS.
2. **Look first.** New dependency `@aws-sdk/client-s3` (Apache-2.0): the S3 client for SeaweedFS and R2.
3. **Look first.** New dependency `heic-decode` (ISC) with `libheif-js` (LGPL-3.0, used unmodified): sharp's prebuilt build reads only AVIF of the HEIF family. `sharp` becomes a direct dependency (on the stack line).
4. **Look first.** Permission `file.upload`: global, all four roles. Not a row of `03`; an upload shows nothing to anyone, and each attaching action checks its own row. The Principal holds it too: the download route's gate asks it of every reader, and a Principal will see files attached to the requests of the branch (permission review, Should fix 4, kept with this reason). Proposed `/spec-change` of `03`, Permission matrix, new row: "Upload a file before it is attached | Yes | Yes | Yes | Yes".
5. **Look first.** A file no record holds goes to its uploader only; every refusal is 404. A record that holds a file decides through its owner in `src/server/files/owners.ts`, under the contract written there (a record's current visibility, one holder per file, attach only one's own unheld upload; permission review, Should fix 1 to 3).
6. **Look first.** The action wrapper takes a global create with `repeat`: its first result goes back to its maker alone (`branchId: null`). The wrapper test that called this a definition error is replaced by two tests (maker gets the first result; another user gets Not found), because the decision changed.
7. **Look first.** `/files` and `/files/…` are outside the proxy: the routes answer a signed-out visitor with 401, and an upload does not pass the proxy's 10 MB body buffer.
8. The original of a photo is not kept; the 160 px and 1200 px versions are JPEG (react-pdf draws JPEG and PNG only); a PDF is kept as it is. `mime` and `size_bytes` are those of the upload.
9. `client_key` is a column of `files`; the repeat is checked inside the wrapper only, so a repeat redoes the image work.
10. The upload is a Route Handler that writes the row through `runAction`.
11. 10 MB is 10 485 760 bytes, for photos and PDFs alike.
12. The browser redraws a photo above 2 MB or 2400 px to at most 2400 px, JPEG 0.85.
13. The bucket is made by `npm run storage:bucket` and the test setups, never at run time; `ci.yml` is unchanged (correction 1).
14. The local storage keys are invented and public, on `127.0.0.1` only.
15. Objects are written first, then the row; objects of a refused row stay, reachable by no address.

Choices made during the build:

- A picture is refused as `not_an_image` when it declares more than 268 402 689 pixels, read from its header before any decoding (correction 3): sharp's `metadata()`, and heic-decode's `all()` for a HEIC (it reads the size without decoding; checked: about 1 MB for a file declaring 20 000 × 20 000).
- The HEIC brands are exactly those heic-decode accepts (`heic`, `heix`, `hevc`, `hevx`, `mif1`, `msf1`); the plan also named `heim` and `heis`, which heic-decode would not decode (spec review, Should fix 1).
- A transparent PNG or WebP turns white in its JPEG versions.
- The browser's file name is trimmed and cut to 255 characters (by characters, not UTF-16 units); an empty one becomes `file`.
- `fileForDownload` calls `authorize()` before it reads the row (permission review, Should fix 5).
- The tests' buckets are `procurement-test` (Vitest) and `procurement-e2e` (Playwright); their S3_* values come from `tests/helpers/local-storage.ts` when the environment has none.
- heic-decode's types are written in `src/server/files/heic-decode.d.ts` rather than adding `@types/heic-decode`.
- The HEIC test picture (1600 × 1200, two coloured blocks) was made once with pillow-heif and is committed in `tests/helpers/files/`; sharp writes no HEIC.

### 0.13 Scheduler (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first.** A job runs as the system: no signed-in user, no `authorize()`, no `runAction`; its writes are in the transaction the scheduler opens in `src/server/jobs/`, and what it tells a person goes through `notify()` with `userId: null`, which keeps the branch wall per recipient. Proposed `/spec-change` of `edge-cases/developer-rules.md` rule 4: add "A scheduled job runs as the system, without a user; what it tells a person goes through the notification helper, which checks the person's branch."
2. **Look first.** New table `scheduled_jobs`, not in `14-data-model.md`: the state of each job (state, updated in place; never deleted). Proposed `/spec-change` of `14`, System: add `scheduled_jobs  name KEY, schedule JSONB, last_tick, last_started_at, last_finished_at, last_failed_tick, last_failed_at`.
3. The lock is the job's row taken with `FOR UPDATE SKIP LOCKED`; a job runs only for a tick later than both `last_tick` and `last_failed_tick`, so a clock behind another instance's never runs a tick again.
4. A job's whole run is in a savepoint of the transaction that holds its lock; its writes and its record commit together. A failure rolls back to the savepoint and is recorded under the same lock (review correction 1).
5. Ticks are counted from 00:00 Tashkent with `businessDayStart(businessDate())` (review correction 2); the minutes divide a day. Only `everyMinutes` now; times of day and weekdays with 8.2.
6. A missed tick is not caught up.
7. The scheduler wakes every 15 seconds.
8. It starts in `src/instrumentation.ts`, once per server process, Node.js runtime only, not during `next build`, not with `SCHEDULER=off`; on by default.
9. A failed run records `last_failed_tick` and `last_failed_at`, logs `Job <name> failed:` with `describeForLog()`, is not tried again in its tick; no notification.
10. The heartbeat runs every minute and writes only its record.

Choices made during the build:

- Every time column comes from `now()` of the injected clock, `created_at` included (review correction 3).
- The missing rows are made with `INSERT … ON CONFLICT DO NOTHING` in a short transaction before the lock transactions.
- A round runs the jobs one after another; one job's failure, or a failure to write its record, does not stop the others.
- `startScheduler` takes an optional `runRound` so a test counts rounds instead of waiting a fixed time; its timer is `unref()`ed.
- `.env.example` names `SCHEDULER`.

### 0.14 Seed data (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed or changed them (corrections 1 to 4 applied). The Look first item comes first.

1. **Look first.** Four seed users; the Principal has CHL only and YUN has no Principal. The build line counts four users; `00-definitions.md` says "exactly one Principal per branch". The reviewer reads the definition as how the school runs, as `03` rule 5 expects a branch without a Principal for a while. A YUN request stops at the Principal step until a Principal is added. Proposed `/spec-change`, if the owner wants five: `developer-rules.md` rule 14 "… 2 branches, one user per role and a Principal for each branch, 30 products …", and build-plan 0.14 Done-when "each of the five seed users"; or no change.
2. The Manager and Finance have both branches, so the branch choice and the branch wall can be clicked through.
3. Four password variables, one per user: one leaked value opens one role only (the test copy, 0.15).
4. Safe to run twice: create what is missing, keep what is there (found by code or username, never changed, no password reset, nothing deactivated). Refused, writing nothing: a found seed user of another role; a missing seed Principal when CHL has an active Principal.
5. Changed by the review: CI's seed passwords are random values made in the step (`openssl rand -hex 16`), never printed; the workflow holds no password text.
6. Audit rows for the seed with the seed Head as actor (of its own row too); new audit action `branch.create`; `user.create` lists the first Head's fields plus `branchIds`.
7. Rule 14's 30 products and requests are left to the catalog and request tasks.
8. The moment is read once in `scripts/db-seed.mjs` behind the eslint exception of `scripts/create-first-head.mjs` and passed in.
9. No Playwright test uses the seed; the e2e database keeps its own people.

Choices made during the build:

- `FIRST_HEAD_LOCK` is exported from `scripts/first-head.mjs` and nothing else there changed (review correction 3). The seed Head is written first, so every audit row has an actor (correction 4).
- The pre-check for an active Principal of CHL runs before any write, so the refusal names the branch instead of the database's unique-index error.
- Branch names "Chilonzor (demo)" and "Yunusobod (demo)", addresses "Namuna ko'chasi 1/2": invented, district names only.
- No production guard (permission review, Should fix 1, not done): the plan leaves hosted databases to 0.15, which needs the seed users on the test copy; the image does not ship the seed script.
- `scripts/not-built-yet.mjs` removed: no script uses it.

### 0.15 Test copy: file storage and seed users (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first.** The demo users reach the test copy through the container start: `scripts/start.sh` seeds after the migration when `SEED_DEMO_DATA` is exactly `yes`; a failed seed is logged as `db:seed failed: …` and the app starts. The owner never holds the database address (Decided ahead 0.16, item 2), and the seed keeps what is there.
2. **Look first.** Reading of the Done-when "a photo uploaded there is shown again": no screen has a photo field yet, so the storage check (a sharp-made 160 px JPEG written to and read back from R2) run by the owner in the console proves R2, its token and sharp in the image; the first task with a photo field asks for a photo on the test copy. Proposed `/spec-change` of build-plan 0.15 Done-when: "… and the storage check in the console prints `storage ok`; a photo is uploaded on the test copy by the first task with a photo field."
3. **Look first.** The hosted-database guard of the seed: refused unless `SEED_DEMO_DATA` is exactly `yes`; a `?host=` elsewhere, an empty host or an unreadable address is not local; the refusal names the variable, never the address. Closes the 0.14 permission review's Should fix 1. 9.4 must not set it in production.
4. **Look first.** New direct dependency `pg-connection-string` ^2.14.1 (MIT, the `node-postgres` project, already installed as `pg`'s own parser at 2.14.1; `npm audit --omit=dev --audit-level=high` passes, the four moderate findings are the existing ones of `drizzle-kit`).
5. **Look first.** The three CI steps of the plan (the seed in the image, no seed without the switch, a failed seed does not stop the app) are not in this task: a change under `.github/` is an owner decision when the Build line does not ask for it (plan review, correction 1). Replaced by `tests/image-files.test.ts` and `tests/start-script.test.ts`; the step texts are in the report of pull request #29 for the owner to add by hand.
6. `S3_REGION=auto` and `S3_BUCKET=ombor-test-files` are plain values in `.do/app.yaml`; `S3_ENDPOINT` and both keys are typed and encrypted by the owner.
7. The R2 token is "Object Read & Write" for the one bucket; the bucket is private, without an `r2.dev` address or a custom domain.
8. `s3ClientOf` sets `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED`; the 0.12 file tests pass with it against SeaweedFS. The R2 side is proved by the owner's console check.
9. The check's object stays under `checks/`; nothing is deleted. `forcePathStyle` stays. The bucket's location hint is Eastern Europe.
10. `docs/deploy.md` is written from memory of the dashboards; each step names what the owner should see and to post on issue #9 when it differs.

Choices made during the build:

- The storage check prints `storage failed: S3_… is not set.` without the local `.env` hint, as it runs on the test copy (spec review, Should fix 2); its missing-object test goes through the check's own read (Should fix 1).
- A connection the seed cannot open is reported by its error kind only; the error object names the host and the port (permission review, Should fix 3).
- Not done, with the reason in the report: a second guard independent of configuration (permission review, Should fix 1). A check on other active users would stop the seed on the test copy as soon as the owner adds an invented user, and later tasks extend the seed; the production spec belongs to 9.4, whose test must assert it has no `SEED_DEMO_DATA` (progress, "For 9.4"). A tunnel to `127.0.0.1` passing the guard (Should fix 2) is written in `.env.example`.
- The image was built locally and run: a fresh database got the seven seed lines and `storage ok`; a restart printed `kept`; without passwords it printed `db:seed failed: …` and `/health` answered 200.

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
