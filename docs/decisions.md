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
| D42 | 14.10.2026 | ~~**A temporary owner gate before task 2.1.** The owner is redesigning requests: no order request form; each branch has an order list of items, and every item is approved, bought, settled and closed on its own, with every role acting on many ticked items at once. Phase 1 does not depend on the form and runs on; Phases 2 to 4 wait for the `/spec-change` that rewrites them, which also deletes the gate.~~ Lifted by the spec change of 16.10.2026 (D43). | Owner, 14.10.2026: "we remove ORF thing, and each branch will have their order list"; building the form first would be built twice. |
| D43 | 16.10.2026 | **Requests are orders.** No order request form: each branch has an order list; an order is one product or service for one department with its own number, approvals, purchases, money count and close. Every role acts on many ticked orders at once, all or nothing, at most 200. Lists show one group row per subtype and status; drafts of the same subtype and department merge. Finance's money is actions with one row per order: the cash given is prefilled with each order's planned cash, a return or payback with each order's count, no row crosses its order, one Manager per action, and a settlement action may net returns against paybacks. Delivery for a whole shop visit is its own service order; a fee that turns up only at the shop is an extra cost on one order; nothing is split automatically (owner, 16.10.2026: "PM adds just as one more order (service)"). The overspend guard needs both 10% and 100 000 so'm. No form PDF and no signature lines anywhere; the filtered list downloads as Excel and PDF. Internal codes (`CREATE_REQUESTS`, the status enums, the notification types) keep their names. | Owner, 14 and 15 October 2026, in the design doc "Order list: requests as items" and its seven answered questions. |
| D44 | 17.10.2026 | **The reviewers flag over-engineering and never ask for safeguards no rule needs** (`.claude/agents/spec-reviewer.md`; `review-pr` steps 4 and 8 and Rules). Over-engineering is a guard, check or validation no rule of the spec, the edge-case files or `CLAUDE.md` needs; the same rule checked in more layers than `edge-cases/developer-rules.md` asks for; a new table, function, abstraction or setting where an existing one does the job; a task split where one session can build it. It is a should-fix "remove" or "merge", never alone a `changes needed`; a must-fix names the rule it breaks. The never-broken rules of `CLAUDE.md` are never over-engineering. | From sodiq-platform pull request #112 (owner, 15.10.2026, after Anthropic's note that adversarial AI review over-engineers). Its light review of the handbook and its test at the real school size are not brought: this app has no handbook, and task 9.2 already measures every page on several years of invented data. |
| D45 | 17.10.2026 | **One spec review of the code, not two.** `finish-task` step 3 asks only the `permission-reviewer`, on every finished task as before (D8); the review routine does the spec review of the code. The `spec-reviewer` still checks the plan (`next-task` step 8). Because the builder no longer runs the `spec-reviewer` on the code, `review-pr` step 8 now applies every check of `.claude/agents/spec-reviewer.md` and of the `.claude/rules/` files whose paths the diff touches. | From sodiq-platform pull request #121 (owner, 16.10.2026): the builder's spec review and the routine's review read the same diff, and the builder's two subagents were about 30% of a builder session there. The step 8 line is this repository's own: without it the check lines of D37 to D41 and of `.claude/rules/` would no longer be read against any code. Unlike sodiq-platform, the permission review stays on every diff, because every task here adds or changes server actions. |
| D46 | 17.10.2026 | **Twenty-two check lines from sodiq-platform's reviews of 14 to 16 October** that apply to any app: four in `.claude/agents/spec-reviewer.md` (a case tested at one layer only; a rule read on a date already past; one outcome allowed by a check of one raised flag only; spec rows handed to later tasks), nine in `.claude/rules/tests.md` (same-moment tests that can fail, a test per branch, a line read by its kind, a condition tested with every other value letting the row in, every reader of a value tested), five in `.claude/rules/database.md` (trigger locks, waivers that outlive their reason, child-parent checks after the lock, migrations that meet old rows), four in `.claude/rules/ui.md` ("nothing found" timing, one branch-switch path, field messages, locked field values). Each line names the sodiq-platform task it came from. | The owner asked for every general check line sodiq-platform gained since 14 October (17.10.2026), as D27 to D41 were brought: each line came from a real bug there, and this app has the same triggers, deferrable constraints, advisory locks, branch switcher and forms. Left out: lines about its dated moves, record merges, audit rows per branch, its own branch reader and its timetable. |
| D47 | 17.10.2026 | **Five task pairs merged, 104 tasks become 99**: 2.12 into 2.11 (what changed, with send back and submit again), 4.11 into 3.5 (the actual columns of the download, with purchases), 5.5 into 5.4 (the issue note PDF, with the issue), 5.13 into 5.12 (the block on closing a branch, with the documents list), 8.3 into 9.1 (the accessibility pass, with the acceptance run at both widths). The kept task takes the Read, Build and Done-when lines of the other, which keeps its text. A note or decision that names a former task belongs to the task it was merged into. The phase table now counts 99 (it said 103 and missed 2.5b). Nothing is deferred: analytics, the price prompt, search and stock counts stay before go-live. | Owner, 17.10.2026, to save sessions: each pair is built on the same screens or files. The accessibility pass moves from phase 8 to 9.1, still before go-live and the owner gate; `16-build-order.md` lists it under phase 8, a difference of order only. A merged task that is too large for one session is still split by the builder (D44). |
| D48 | 17.10.2026 | **The Phase 2 audit and its fix.** Two independent sessions read the orders and approval code against the spec after 2.15 (247 statements): nothing missing, no gap in money, the branch wall or the approval order; one difference, Submit in the drafts grid asks no confirmation (`11` rule 6); the S19 test checks orders instead of quantities. Fix task 2.7b, placed first among the open tasks; `spec-reviewer` gains a check line for confirmations. The review routine stays on Opus. | Owner, 17.10.2026: the audit was the test of the reviewer; the agreed bar for a switch to Fable 5.1 (one serious gap, or five or more real misses) was not met. Task 2.7's Read line did not name `11` rule 6, so no review looked for it. |
| D49 | 17.10.2026 | **The loop wakes sooner, finds dead sessions sooner and never merges past a second verdict.** (1) After opening the draft pull request the builder waits in its own session for the plan review (`next-task` step 11: every 30 seconds, up to 15 minutes) instead of stopping. (2) Every place that binds names both tool names, `bind_pr` and `subscribe_pr_activity`; a start routine run without either watches for 2 minutes instead of 10 before it resumes (only a builder still waiting in its own session can react). (3) On its own red CI the builder first posts "Acting on the red CI.", which the start routine reads as its reaction. (4) Progress comments at least every 20 minutes; the stall rule (b) is 45 minutes of silence instead of two hours. (5) The reviewer merges only while its `ready to merge` is the newest verdict at that sha (`review-pr` step 10 and the review routine's prompt). Fix task 2.11b. | (1) Procurement's builders woke 7.5 to 10.5 minutes after each plan approval (tasks 3.1 to 3.5), with no resume: they were bound and still slow, so binding alone does not remove the wait here; the plan review comes about 3 minutes after the plan, and code rounds are rare (1 in 33 tasks). (2) to (4) from sodiq-platform pull requests #122 and #126 (17.10.2026): there, unbound builders and dead sessions cost hours; here 2.7 lost about two and a half hours to a dead session. (5) On #61 (2.11) one reviewer run posted `ready to merge` at 22:17:04 UTC and merged at 22:17:22, after another run's `changes needed` at the same sha (22:17:12) whose two findings were never fixed. |
| D50 | 17.10.2026 | **The builder yields to a resumed session and acts on the newest verdict.** `next-task` step 12 and `finish-task` step 9: before "Acting on the review." (or "Acting on the red CI.") and again right before the first commit of the work, the builder re-reads the comments, acts on the newest `[review]` naming the head sha, and stops without posting when a "Resumed by the start routine." it did not post came after that review. The start routine's prompt follows `next-task` through step 10 and then waits as step 11 says, instead of "to the end of The draft pull request", which since D49 holds the wait itself. | From sodiq-platform pull request #131 (17.10.2026), whose check of D49 found the same three gaps here: the prompt bound and waited twice; a woken builder arriving after the start routine's 10-minute wait could build beside the resumed session; a builder could act on an older of two verdicts at one sha, the builder-side twin of D49's merge guard. |

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

### Open questions 3, 8, 9, 11, 12, 13 and 19 (17.10.2026)

Answered by the owner on 17.10.2026 ("ok to all", to the parent chat's proposals). Each answer enters the spec through `/spec-change` later; until then this is the answer a task uses (`open-questions.md`, top). None of these is a Look first decision any more.

1. **Question 3, for tasks 3.2, 3.7, 4.1 and 4.3: cancelling a purchase record or a money action fills its cancel fields once, and nothing else changes.** `is_cancelled` goes from false to true, with `cancel_reason`, `cancelled_by` and `cancelled_at`, in one update that can never be undone or repeated; every other column stays as it was written, and the database refuses any other update (`CLAUDE.md` rule 5; built with the tables in 3.2 and 4.1). Stock is undone by a new stock movement (`09-warehouse.md`, Stock value). Money needs no new row: cancelled actions and records are left out of every count (`08-money-and-settlement.md`, Order's cash count). The order's History gets an event with who, when and the reason, as every write does (`CLAUDE.md` rule 3). No separate cancellation table.
2. **Question 8, for task 3.10: "recent purchases" are the last 3 purchase records of that subtype in that branch within the last 90 days, at least 2 of them.** Cancelled records do not count. Fewer than 2 such records: no prompt. The prompt comes when the average unit price of those records differs from the reference price by more than 20% (the parent chat's reading, not offered to the owner: one odd purchase should not prompt alone).
3. **Question 9, for task 5.4: "Give straight to requester" is hidden on a service order.** A service never enters stock, so there is nothing to issue.
4. **Question 11, for task 5.6: a return from a department comes back in at the item's current average cost in that branch.** The average does not change by the return. Where the average is 0 (`09-warehouse.md`, Stock value: a cancelled purchase emptied the stock), the task decides the cost and marks it Look first.
5. **Question 12, for tasks 5.8 and 5.9: a direct entry enters the moving average like a purchase receipt**, at the cost per unit the Head types (prefilled from the reference price).
6. **Question 13, for task 5.11: the write-off reasons are damaged, expired, lost, returned to supplier, lost in transfer, and "Other".** Every write-off still has its comment, as `09-warehouse.md` (Write-off) asks.
7. **Question 19, for task 5.7, and 7.2 and 7.4 for their documents: who may reverse a warehouse document.** An issue and a return: their creator or the Head, a Manager only with the right `RETURN_REVERSE` (`03-roles-and-permissions.md`). A direct entry, an approved write-off, a received transfer and an approved count: the Head only. 5.7 builds the reverse of the documents that exist then; 7.2 and 7.4 add theirs.

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

### 1.1 Settings (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first.** The overspend guard's "off" is the JSON string `"off"` in `overspend_guard_percent`; any whole percent 0 to 1000 is "on". The accessor returns `number | "off"`. With the worked example of `08` (5.8 % over): guard 10 asks nothing, guard 0 asks the Head, `"off"` never.
2. **Look first.** Percents are whole: price hint 0 to 1000 (0: any difference shows the hint), overspend guard 0 to 1000; hours 1 to 720.
3. **Look first.** Migration `0007_settings_values`: one CHECK per known key on `settings.value`, each a `CASE` that tests the JSON type before any cast, so it is never NULL and a wrong type is `23514`, never a cast error. Unknown keys stay allowed; the key list is the accessor's.
4. **Look first.** `getSchoolName` asks `profile.edit` (all four roles) for the shell; every other setting is read by the Head only, through `catalog.manage`. `readSettings(executor)` in `src/server/settings.ts` checks no permission, like `audit()`: only an action or query that already called `authorize()` calls it.
5. **Look first.** No order is enforced between reminder and escalation hours (`06` rule 8 gives the two numbers apart).
6. An unset key has no row; a key once set is changed, never removed (no delete path, `CLAUDE.md` rule 11), so the school name and the school-year start cannot be emptied again.
7. The form sends only the fields the Head changed; the action writes only the keys whose value differs from the value in force, under the advisory lock `hashtextextended('settings', 1)`. No version column.
8. One audit row per save: `settings.change`, entity `settings`, entity id `settings`, `before`/`after` with the same changed keys; `before` is the value in force (the default, or `null` for the two keys with none). This changes the reasoning of 0.9 decision 1 ("a settings row is named by its text key"): the settings' changes are one record named `settings`; `entity_id` stays text, as before. The comments in `src/server/audit.ts` and `system.ts` say so.
9. The first day of the school year is `{"month", "day"}`, exactly those two keys; 29 February is refused.
10. The school name is trimmed, 1 to 120 characters counted by code point (as `char_length` counts).
11. Admin opens `/settings` until `/catalog` exists; task 1.5 points it back. The active paths of 0.10b decision 9 are unchanged.
12. A non-Head opening `/settings` gets Next's "not found".
13. The school name shows under the logo in the sidebar, in `text-sidebar-foreground/70`, not in the rail and not at phone width.
14. `PAYMENT_TYPES` (`CASH`, `TRANSFER`, `CARD`) live in `src/domain/payment-types.ts`; their words are `paymentTypes.*` from `05` field 12.
15. `saveSettings` has no client key and no `repeat`: it changes values; a repeat writes nothing.

Choices made during the build:

- A stored value of the wrong shape makes `settingsFrom()` throw rather than fall back to the default: a money rule must not run on a guessed value. The CHECKs make it impossible short of a new migration.
- `<ChangeHistory>` gained four kinds, `percent`, `percentOrOff`, `hours`, `monthDay`; the texts are `audit.percent`, `audit.off`, `audit.hours`, `audit.monthDay.<1-12>` (the month in the form a date takes in each language). The month names of the form are `months.<1-12>`.
- React Hook Form keeps the form's state and which fields changed; the values are checked once, by the action's Zod schema, whose field errors show under the fields. No client-side copy of the checks (`CLAUDE.md` rule 1).
- Save is disabled until the form runs in the browser: a click before hydration submitted the plain HTML form and reloaded the page (found by the Playwright test). The browser tests wait for Save to be enabled.
- The school-year day list shows only the days of the chosen month.
- The concurrent same-key test proves the advisory lock: without it the second save's `before` is the default again (spec review, Should fix 1; tried by removing the lock).
- The Playwright test of the unsaved-changes guard clicks the Requests tab at phone width: in the dev server the Next.js indicator covers the first tab.

### 1.2 Branches (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first.** No version column on `branches` (`14-data-model.md` gives none; rule 9 names the request). Two Heads saving at once each write only the fields they changed, under the row lock; both moves are in the history.
2. **Look first.** Deactivating refuses nothing and moves nothing: users, stock and records stay. The block on closing is 5.13, the code lock 2.7; until 2.7 the code can be changed.
3. **Look first.** The top-bar branch switcher keeps listing inactive branches (`04` rule 2: they "stay visible in old records"); pickers that create something list active branches only (1.3, 2.x).
4. **Look first** (design-system departure, D23). Pages `/branches/new` and `/branches/[id]` instead of the side panel of "Lists": a handful of rows; the history and the unsaved-changes guard fit a page.
5. `branches.client_key uuid`, nullable, unique `branches_client_key_key` (migration `0008`), for `developer-rules.md` rule 8; the seed's branches have none.
6. A branch can be activated again, with its own audit row `branch.activate`; a repeat of the same move is `wrong_status`.
7. A taken code or name is `invalid_input` with `fields: { code|name: "errors.field.taken" }`, checked under the advisory lock `hashtextextended('branches', 1)` with the unique index's SQL expression, the branch's own row excluded on update. `ActionError` takes a field map for this. The unique constraints stay the last defence.
8. The code is never upper-cased by the server or the form.
9. Names are stored trimmed with inner spaces collapsed, addresses trimmed; limits 120 and 300 code points in the domain and the form only.
10. Audit rows: entity `branches`, the branch id; new actions `branch.update`, `branch.deactivate`, `branch.activate`.
11. The list has 25 a page and no search or filter.
12. A segmented control of links (Branches, Settings) on the Admin pages; the Admin menu item stays on `/settings` until 1.5.

Choices made during the build:

- `createBranch`'s repeat finds the maker as the actor of the branch's own `branch.create` audit row (plan review, correction 1); another Head with the same key gets `not_found`.
- An update with nothing changed returns the branch, writes no audit row and touches no column (correction 3).
- `getBranch` answers `null` for a text that is not a UUID, after `authorize()`, so `/branches/abc` is "not found".
- Active/Inactive is plain words, not a status label (design system, What we never do 4); at phone width the table scrolls inside its panel.
- The text of `errors.field.taken` names no entity ("Already used"), so later catalogs reuse it (diff review, Should fix 1).
- `BRANCHES_PAGE_SIZE` lives in `src/domain/branches.ts`: the permission registry counts every export of a query file as a query.

### 1.3 Users (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first.** The role of an account is not edited after creation; a role change is a new account. It narrows the Build line "edit the other fields". Proposed `/spec-change` of `04-catalogs.md`, Catalogs table, Users, Notes: "See section 3. The role is set when the account is made; a change of role is a new account."
2. **Look first.** The Head cannot renew their own password; another Head does. A single Head who forgets theirs has no way back in today (`user:first-head` refuses once a Head exists). Proposed `/spec-change` of `02-assumptions.md` A8: "…and can renew any other user's password at any time; nobody, the Head included, changes their own."
3. **Look first.** Replacing a Principal is the `replacePrincipal` choice on create, on activate and on a Principal's branch change: the old Principal is deactivated and signed out first, then the new one is added or activated, in one transaction, with a confirm dialog. Without it a second active Principal is refused (`errors.field.principalTaken`).
4. **Look first.** The last active Head is held by the action and by the deferred trigger `users_keep_one_active_head`; both take the advisory lock `users_active_head` before counting, so two concurrent deactivations cannot both pass.
5. **Look first.** A deactivated user keeps their branches; their own requests are not moved and nothing is blocked (2.x moves requests).
6. **Look first** (design-system departure, D23, as decisions 1.2 item 4). Pages `/users/new` and `/users/[id]` instead of the side panel.
7. **Look first.** The Head cannot deactivate their own account (it narrows the Head's row of the permission matrix).
8. **Look first** (review correction 1). Removing a branch from a user deletes its `user_branches` row; the `branches` field of the `user.update` audit row keeps the change; a Principal's old row goes before the new one. Proposed `/spec-change` of `14-data-model.md`, user_branches: "A row is an assignment: removing a branch from a user deletes it, and the audit log keeps the change."
9. `BRANCH_ROLE_VACANT` goes to every active Head, the acting Head included (`notify` with `userId: null`, a deliberate exception to decisions 0.11 item 5), only when a change vacates a place of an active branch.
10. The vacancy warning is a panel at the top of `/users`; the home page gets it with the home contents (2.x).
11. A generated password is made in the browser by `generatePassword(bytes)` (12 characters of 32 lower-case letters and digits without 0, o, 1, l; 60 bits); the server never makes or returns a password.
12. Usernames as 0.6 decided; a changed username is checked as taken under the advisory lock `users` too, the own row left out (review correction 2). Full name trimmed and collapsed, at most 120 code points; phone 7 to 30 of digits, spaces and `+ ( ) -`, in the domain and the form only.
13. Audit: entity `users`; `branches` as the sorted codes joined by ", "; `user.renew_password` with `before` and `after` both `{}`.
14. No version column on `users`; only changed fields are written, under the row lock.
15. The branch picker lists active branches plus the inactive ones the user holds.
16. `/users` is 25 a page, active first, no search.
17. New field error keys `principalTaken`, `branchCount`, `branchInactive`.

Choices made during the build:

- The replaced Principal's `user.deactivate` row is written in the write step, so a repeated create returns the same result as the first (`repeat.find` reads the user).
- The plan's refusal key `errors.user.lastHead` became a hint on the page: the wrapper carries one message per code, and an acting Head never reaches the action's last-Head check alone (deactivating oneself is `forbidden`); only a race does, as `wrong_status`.
- `USERNAME_PATTERN` stays in `src/server/auth/password-user.mjs`, which the container copies; the actions import it from there.
- Passwords are shown in Golos Text, not a monospace font (diff review, Should fix 2).
- Checkboxes and radios use `accent-foreground` (navy; the foreground in the dark theme).

### 1.4 Manager rights (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (correction 1 applied), and those of the build. The Look first items come first.

1. **Look first.** Rights are switched for a MANAGER only; any other role is refused (`invalid_input`). No database guard: a row of another role grants nothing, as `decide()` reads rights for Managers only. A role is never edited after creation (decisions 1.3 item 1), so switched-off rows cannot return through a role change (permission review, Should fix 1).
2. **Look first.** An inactive Manager's rights cannot be switched (`wrong_status`; shown disabled), so every change can be notified (`notify` skips inactive users, decisions 0.11 item 5). Proposed `/spec-change` of 03, Manager rights, third bullet: "… and the Manager is notified. The rights of an inactive Manager cannot be switched; activate the user first."
3. One switch is one action, one audit row and one notice, saved on flip with no confirm dialog.
4. The same switch twice is `wrong_status` and writes nothing, as `setUserActive`.
5. The notice links to `/` with no branch (A13); params `{ right, state }`.
6. Audit `user.switch_right`, entity `users`, `before`/`after` `{ CODE: boolean }`; the history shows the right's name, Yes → No.
7. The section "Rights" sits under the user form; each hint is 03's "When it is off" text.
8. Buttons of later actions are hidden by their own tasks through `decide()`.
9. `lockUser` is exported and taken by the new action (the locks of progress 1.3).

Choices made during the build:

- The checkboxes flip at once with `useOptimistic` inside a transition, until the refreshed page brings the saved state; all are disabled while one saves.
- `tests/notification-texts.test.ts` gains a `SHOWN` table (the free text a sample must show, `null` for a type of codes only), replacing the fixed "DEMO" check, and a test that each right is named by a word in each language.

### 1.5 Measures, categories, extra cost types, companies (14.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first** (permission matrix). A new global permission `catalog.pick` for the picker query, all four roles: `04` says "everyone else picks from them" and `03` has no row for reading a catalog; catalogs hold no branch data. The picker lists active entries only; analytics and report filters (6.x, 7.x) read their own query with inactive entries too. Proposed `/spec-change` of `03`, Permission matrix, a new row: "Pick from the catalogs | Yes | Yes | Yes | Yes".
2. **Look first** (stock: whole or decimal quantities). A measure's "Allows decimals" can be changed while no product uses the measure; once one does it locks, wired in 1.7. Proposed `/spec-change` of `04-catalogs.md`, Catalogs table, Measures, Notes: "\"kg\" allows decimals, \"pcs\" does not. \"Allows decimals\" locks once a product uses the measure."
3. **Look first** (design-system departure, D23, as decisions 1.2 item 4). New and edit are pages (`/catalog/<kind>/new`, `/catalog/<kind>/[id]`), not the side panel.
4. A measure's short name is unique like the name.
5. A company's tax ID is optional, 9 or 14 digits, not unique; phone optional with the users' rule; note optional up to 1000 code points; formats in the domain and the form only, a blank value refused by the database; empty is stored as null.
6. The company kind has no preset and can be changed later.
7. `client_key uuid`, nullable and unique, on each table; a repeat finds its maker through the `<prefix>.create` audit row.
8. No version column; only changed fields are written, under the row lock.
9. Indexes on `is_active` of each table and `(is_active, kind)` of companies (`developer-rules.md` rule 12; plan review, correction 1, which replaced the plan's "no index").
10. Audit entity is the table name; actions `unit.*`, `category.*`, `extra_cost_type.*`, `company.*`.
11. `/catalog` lists the catalogs with their active counts from `countActiveCatalogEntries` (catalog.manage; correction 2); the Admin item opens it; `AdminNav` has four links, Catalogs first.
12. One dynamic route `/catalog/[catalog]` with the segments `measures`, `categories`, `extra-costs`, `companies`; an unknown one is "not found".
13. Search matches part of the name (and short name, tax ID, phone), any case, `%` and `_` literal; the list orders active first, then by name; the picker gives at most 50, active, by name.

Choices made during the build:

- The company kind is checked with a refine, not `z.enum`, so an unchosen kind reads "Fill in this field" and not "This value is not allowed".
- The form and the Deactivate button live in `src/app/(app)/catalog/`, as the branch pages' do: `src/components/` does not import a page's server actions.
- The page actions take the catalog's address segment with the fields and run that catalog's own action; an unknown segment is `invalid_input`.
- `tests/e2e/settings.spec.ts` follows Admin to `/catalog`, then to Settings: decision 11 of 1.1 ("Admin opens /settings until /catalog exists") ended with this task.
- The phone browser test saves with Enter after a refusal: the error toast covers Save until it fades.
- `countActiveCatalogEntries` is one statement with a scalar subselect per catalog (diff review, Should fix 1); `/catalog/<kind>/new` uses it as its permission check.
- The three page actions have their own matrix tests through the dispatch (permission review, Should fix 1).

### 1.6 Departments (15.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (branch wall). A department's branch is chosen once, at creation, and never changes; the update input has no branch, and one sent is ignored. The first task that points a branch record at a department also holds this in the database (plan review, decision 1).
2. **Look first** (design-system departure, D23, as decisions 1.2 item 4 and 1.5 item 3). New and edit are pages, not the side panel.
3. A department cannot be added to an inactive branch (`invalid_input`, `branchId: errors.field.branchInactive`) or an unknown one (`branchId: errors.field.notAllowed`), the keys of `createUser` (plan review, correction 1); the branch row is locked `FOR SHARE` before the insert. Departments of a branch deactivated later stay as they are.
4. The responsible person's name and phone are optional; the users' name and phone rules when filled; empty is stored as null; a blank value is refused by the database.
5. The name follows the catalog name rule of 1.5, unique inside the branch only, held while inactive and freed by a rename (D41).
6. `client_key` nullable and unique; a repeat finds its maker through the `department.create` audit row.
7. Audit entity `departments`, actions `department.create|update|deactivate|activate`; the create row's `after` holds `branchId` and the branch's code as `branch`, as it was then.
8. The list orders active first, then by branch name, then by name; search matches the name, responsible name or phone.
9. Static routes `/catalog/departments` beside `[catalog]`; not in `CATALOG_KINDS`.
10. The list shows the top bar's branch view ("All" shows every branch); no second branch chooser.

Choices made during the build:

- `defineCatalogActions()` gained an optional `within` parent instead of a second write path (plan, "Server actions and queries"); its `kind` is an `EntryKind` read from `CATALOG_ENTRIES`, the four of 1.5 plus `DEPARTMENTS`.
- The shared `CatalogForm` and `CatalogActiveButton` serve departments with the department page actions, instead of a separate `department-form.tsx` (the plan's Size named one): one form, as build-plan 1.5 asks. The branch select shows on a new department only.
- `HistoryField` has an optional `hidden` flag: the create row keeps `branchId` for the record and the history shows only the code (decision 7). It has its own unit test.
- `PageLinks` moved from `[catalog]/page.tsx` to `src/app/(app)/catalog/page-links.tsx` so the department list reuses it.
- New texts `catalog.chooseBranch`, `branchOption`, `branchLine`, `allBranches`, `oneBranch`, the department fields, hints, `kinds.departments` and `audit.actions.department` in uz, ru and en; the Uzbek ones use ʻ and ʼ as the file does.
- The Excel import of departments is task 1.10 (plan review, correction 2).

### 1.7 Products and services (15.10.2026)

The plan's decisions as the plan review of 14.10.2026 confirmed them (corrections 1 and 2 applied, decision 7 changed by the spec review of the plan), and those of the build. The Look first items come first.

1. **Look first** (stock: type and measure lock). "First use" is any row that holds a quantity of one of the product's subtypes, whatever task writes it: request lines, stock movements and balances of every source (direct entry, the existing-stock import, issues, transfers, counts) and stock minimums (plan review, correction 1). The list `PRODUCT_USES` is empty in 1.7; the update asks it under the product's `FOR UPDATE` lock, and each later writer adds its check and takes the product row `FOR SHARE` before inserting.
2. **Look first** (money: reference price). Set at creation (optional, whole so'm, more than 0) and read-only on the edit page; a sent price is dropped by the update's input check and writes nothing. It changes only as a new price with a note in 1.9 (04 rule 4). Obligations for 1.8 and 1.9 are in progress.md (plan review, correction 2).
3. **Look first** (stock: whole or decimal quantities). A measure's "Allows decimals" locks once any product, active or not, points at it (decisions 1.5 item 2); the measure's name and short name still change. Product create and change of measure lock the unit `FOR SHARE`, the measure update holds it `FOR UPDATE`.
4. **Look first** (design-system departure, D23, as 1.2 item 4, 1.5 item 3, 1.6 item 2). New and edit are pages, not the side panel.
5. **Look first** (permission matrix). A product photo is seen by every role (`catalog.pick`), the product active or not (04: everyone picks from the catalogs; rule 2). No new permission.
6. Required: name, type, category, measure. Optional: photo, default brand or company, reference price, description; empty is stored as null, a blank value is refused by the database.
7. The default brand or company is any active company, of any kind (04: "brand or company"; 05 field 5; 07 Supplier). Changed from "brand or both" by the spec review of the plan.
8. A new item is `GOODS` unless `SERVICE` is chosen, in the create input and as the database default; an edit that sends no type keeps it.
9. Names are unique across products and services together, ignoring capital letters and extra spaces, held while inactive and freed by a rename (D41); 120 code points; description up to 1000.
10. A photo is an image uploaded by the Head who attaches it and held by no record, checked with the `files` row locked `FOR UPDATE`; a PDF is `errors.field.notAPhoto`; another person's, an unknown or a held file is `errors.field.notAllowed`. A replaced or removed photo goes back to its uploader only.
11. The audit rows keep the ids of category, measure, company and photo and, beside them, the names as they were then (`category`, `unit`, `defaultCompany`) and the photo's file name (`photo`); the history hides the ids.
12. Search on the name; category and type filters in the address; the category filter lists inactive categories too.
13. `client_key` nullable and unique; a repeat finds its maker through the `product.create` audit row. No version column.
14. Static routes `/catalog/products`, `/new`, `/[id]`, and a form of their own (`product-form.tsx`).

Choices made during the build:

- `defineCatalogActions()` gained `guard`, `createOnly`, `createShape` and `shownRefs` (plan review, Should fix 1); measures use `guard` too.
- The form's selects read `listProductChoices` (catalog.manage: every active category, measure and company, and the product's own inactive ones) and not `listCatalogChoices`, which caps at 50; the category filter reads `listCategoryFilter` (every category) and not the 25-a-page `listCatalogEntries`.
- The list's type filter is a select beside the category select (docs/design-system.md, Lists: "filter selects"); the form's type is the segmented control. `Segmented` gained a `disabled` prop for a locked type.
- New field error kinds `inactive`, `notAPhoto`, `locked` with texts in uz, ru and en.
- The price is typed as text and read by `parseSom()` on the server: spaces, U+00A0 and U+202F between groups; at most 999 999 999 999 999.
- `src/server/db/schema/files.db.test.ts`: since `products` points at `files`, a plain `truncate files` is refused (0A000) before the `files_guard` trigger; the test asserts that and reaches the guard with `truncate files cascade` (D39). No guard was weakened.
- The page actions return only what the screen needs (the id, the changed fields, the active flag).
- The lock's refusal is tested through `updateProduct` with `./product-uses` replaced by a set of used products (`product-lock.db.test.ts`; diff review, Should fix 1), because no real use exists before the tasks that write one.

### 1.8 Subtypes (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first** (open question 18; stock and money). The first real subtype the Head adds to a product without subtypes is its hidden default row made real: same id, so every line, stock row and price that pointed at the default stays with it; `has_variants` turns true; later subtypes are new rows. Proposed `/spec-change` wording for 04 rule 1: "When the Head adds the first real subtype, the hidden default one becomes it: it keeps its lines, stock and price."
2. **Look first** (money). A subtype's reference price is optional, whole so'm, more than 0, set on create only; it changes through a new price with a note (1.9). On the first subtype a price the default holds stays and a sent one is refused (`errors.field.locked`); with none held the sent one is taken. The default of a new product takes the product's price.
3. **Look first** (stock). A product with subtypes keeps at least one active subtype and never goes back to a hidden default. The default row is never reached by `updateSubtype` or `setSubtypeActive` ("not found").
4. **Look first** (money). A subtype without its own price has none: no fallback to the product's or another subtype's. A product with subtypes shows "set per subtype" in place of a price, and its list row the count of subtypes. Proposed `/spec-change` wording for the 04 Catalogs table, Subtypes row: "Product, name, own photo (optional; without one the product's photo is shown), own reference price (optional; without one the subtype has no reference price), active".
5. An inactive product takes no new subtype (`errors.field.inactive`); its subtypes can still be renamed (D41).
6. The hidden row is named `default` (04 rule 1). Names are unique inside the product with the catalogs' expression; the default itself is left out of the check on the conversion, so "Default" is a valid first name.
7. The database holds the rule: a deferred constraint trigger checked at commit, and a guard refusing every delete, a move to another product and a real subtype turned default.
8. A subtype's photo follows the product photo's contract (`refusePhoto()`); without one the product's photo is shown; seen through catalog.pick.
9. Audit entity `product_variants`; every row keeps `productId` and the product's name (in `before` and `after` alike on update and activate, so the history does not list them). The conversion's `subtype.create` row has the default's name and price as `before` and `fromDefault: true`; the product gets a `product.update` row `{ hasVariants: false → true }`. A product's create writes no row for its default.
10. `last_purchase_price` and `last_purchase_at` exist now and stay empty until purchases (3.x).
11. New and edit are pages (as decisions 1.7 item 4).
12. Subtypes are added one at a time after the product exists.

Choices made during the build:

- `createSubtype` is written with `defineAction()`: the conversion is an update, not an insert. It takes the table's advisory lock through `lockTable()` and the name check through `refuseTaken()`, both returned by `defineCatalogActions()`; the factory's own `create` for subtypes is never exported. `defineCatalogActions()` gained `afterInsert`, `lockable`, `checkActive` and `within.onEveryRow`.
- The last-active check counts the other active subtypes under the table's advisory lock, which every subtype write takes, so two deactivations cannot both pass.
- The backfill test copies `drizzle/` to a temporary folder, cuts the journal at `0012`, migrates an empty test database with `applyMigrations(url, folder)` (the optional folder argument that already existed; plan review, correction 2), writes a product, then applies the full folder.
- The last active subtype's page shows the reason in place of the Deactivate button; the server refuses it anyway (`wrong_status`).
- Existing raw product inserts in `products.db.test.ts` write their default row in the same statement (`withDefault()`); no case was removed or weakened.

### 1.9 Prices and price history (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (money). Every price the Head sets is a HEAD row of `price_history`, the price typed at product or subtype creation too, with no note; a new price carries its note. The backfill gives every price of 1.7 and 1.8 its row, credited to the audit row that set it (a first subtype that kept the default's price: the product's `product.create`), else the oldest Head and the subtype's time.
2. **Look first** (money). The database holds that a subtype's `reference_price` is the price of its newest HEAD row (by an identity `seq`, which never ties under a frozen clock): a deferred constraint trigger on `product_variants.reference_price` and on HEAD inserts into `price_history`. A set price never goes back to empty.
3. **Look first** (append-only). `price_history` refuses UPDATE, DELETE and TRUNCATE, as `audit_log`.
4. **Look first** (permission matrix). `addPrice` uses `price.add` (Head only, global); reading prices uses `catalog.manage`.
5. **Look first** (money). A product without subtypes gets a new price on its hidden default; `addPrice` reaches the default row.
6. **Look first** (design-system departure, D23). Five Admin pages: the segmented track stays and scrolls sideways inside itself at phone width.
7. **Look first** (money). The same price again, and a price for an inactive subtype or product, are recorded with their note.
8. The note of a new price is required, trimmed, 1 to 200 code points.
9. `price_history` has a nullable unique `client_key`; a repeat returns the first row to its maker only.
10. PURCHASE rows name a purchase and HEAD rows none (CHECK); the FK of `purchase_id` comes in 3.2.
11. No version check on `addPrice`: the subtype row is locked `FOR UPDATE`; the later of two prices is current.
12. The Prices list shows active and inactive subtypes, active first; the hidden default shows as its product alone.
13. "Set on" is shown in Tashkent time through the formatters.

Choices made during the build:

- **Look first** (a test changed because a decision changed). `product-variants.db.test.ts`: the passing price writes now carry their HEAD row, and "an update of `reference_price` to empty passes" is gone, because decision 2 refuses it; `price-history.db.test.ts` (c) proves the refusal. The 0013 backfill test now migrates to 0013 only, since 0014's backfill needs a Head that database has none of; 0014's backfill has its own tests. `products.db.test.ts` and `tests/helpers/catalog.ts` write the HEAD row beside a price. No refusal was removed.
- The Prices list and the history are tables that scroll inside their panel at phone width, as every catalog list since 1.5 (design-system.md, Phone width), not cards as the plan said: the same pattern on every Admin list (spec review of the diff, Should fix 2).
- The product page's change history also lists its hidden default's `price.add` rows through the new `also` record of `listChangeHistory` (04 rule 9; plan review, Should fix 5).
- The price page sits at `/prices/[variantId]` under Admin; the product and subtype pages link to it ("Price history") and keep the price read-only.
- The Uzbek and Russian source names: HEAD is "Rahbar" / "Руководитель", PURCHASE "Xarid" / "Закупка".

### 1.10 Excel import: products, subtypes, departments (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (money). A price cell is read through `parseSom()` only: a text as typed; a number cell only when `Number.isSafeInteger(n) && n > 0`, then `parseSom(String(n))`, so `MONEY_MAX` holds. A fraction, 0, a negative or a date is "Wrong format", never rounded.
2. **Look first** (money). An imported price is the Head setting a price: a HEAD row with no note. A product with subtypes has `reference_price` null; its first subtype is the default made real with its row's price, the others new rows, each price its HEAD row.
3. **Look first** (a dependency installed for the first time). ExcelJS 4.4.0, on the stack line (13, "Excel and PDF"); MIT. `"overrides": { "exceljs": { "uuid": "^11.1.1" } }` clears GHSA-w5hq-g745-h8pq (moderate, through `uuid@8`); ExcelJS's round-trip tests pass with it.
4. **Look first** (design-system departure, D23). The import is a page of its own, `/catalog/import/<kind>`, not a dialog.
5. **Look first** (narrows 04 rule 7). The import creates new products with their subtypes and new departments only; a taken name is a row error. Proposed `/spec-change` for 04 rule 7: "Excel import. New products with their subtypes, prices, departments and existing stock can be imported from an Excel template. Subtypes of a product already in the catalog are added on its page."
6. **Look first** (bends developer-rules rule 12). Rows are checked with one query per table, then written one after another through the form's own write path in one transaction (about 8 statements per product row). Proposed `/spec-change` for rule 12: "No query runs inside a loop, except an Excel import, which writes each row through the form's own write path inside its one transaction."
7. Nothing is kept between preview and save: the browser sends the file again, and the save checks every row again under its locks.
8. References match by the unique indexes' comparison: category and company by name, measure by name or short name (a cell that fits two measures is "ambiguous"), branch by code. Unknown or inactive is a row error; the import creates no reference entry.
9. Type: Product or Service in any language, or GOODS/SERVICE; empty is Product.
10. A product's columns are filled on its first row; a later row leaves them empty or repeats them; a different value is an error naming the first row. Several rows of one product each need a subtype.
11. The header must be the template's titles in uz, ru or en; columns are read by position.
12. At most 500 data rows, 900 KB per file (under the 1 MB body limit of a server action), 20 MB unpacked by the declared and the real sizes; an entry that is encrypted or not stored/deflate is refused (plan review, correction 3).
13. `catalog_imports` holds the import's client key and who imported which file; entries made by an import have no client key; each has its own `*.create` audit row.
14. Photos are not imported. Empty rows are skipped; only the first sheet is read; a formula by its cached value; a whole number in a text column is its digits.
15. The template is a route, 404 to anyone but the Head; the page actions call `authorize()` before the file is read (plan review, correction 1).
16. A department name held by an active or inactive department of that branch is taken (plan review, correction 2).

Choices made during the build:

- The action's input check is a Zod `transform` that adds one issue per row error carrying `params.fieldError`; `fieldErrorKind()` of `src/server/action-input.ts` returns a named kind that is one of `FIELD_ERROR_KINDS` (tested) and keeps "Wrong format" otherwise. The plan said `superRefine`; the transform also gives the action the read rows. Eight new field kinds: unknown, ambiguous, duplicateInFile, differsInFile, notTemplate, fileTooLarge, tooManyRows, noRows.
- The preview reads on `db` without a transaction, not in a read-only transaction as the plan said: the lint fence of rule 3 forbids a query opening one, and the preview writes nothing and is checked again at save (spec review of the diff, Should fix 5).
- One client key is unique across kinds: a repeat finds the first import whatever kind is sent (spec review, nit 2).
- `catalog_imports.row_count` is the file's data rows; the toast says "N rows imported", not "N products".
- The file button is the page's own label over a hidden input: the browser's button writes its text in the browser's language (CLAUDE.md rule 13).
- Matrix tests of `importProducts`, `importDepartments` and `previewImport` called directly, and a fence test that the shared write bodies are imported only by the catalog actions (permission review, Must fix 1 to 3, Should fix 1); a line in `.claude/rules/server-actions.md`.
- The template route's matrix test reads its 404 as the refusal "forbidden" of a global permission.

### 1.11 Excel import: prices (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (money). An imported price is a price added by hand: through `setHeadPrice()` and `recordPriceAdd()`, shared with `addPrice`: the new `reference_price`, one HEAD row with the row's note and the Head as `set_by`, one `price.add` audit row of the same shape.
2. **Look first** (money). Each row needs a note, required, trimmed, 1 to 200 code points, as by hand (04 rule 4; 1.9 decision 8).
3. **Look first** (money). The same price again, and a price for an inactive product or subtype, are recorded, as by hand (1.9 decision 7).
4. **Look first** (permission matrix). The prices import, its page, preview and template use `price.add` ("Add a new price for a product"); products and departments keep `catalog.manage`. The import page now checks the kind's permission with `authorize()` instead of reading the catalog counts. Nobody gains or loses access: both are Head only.
5. **Look first** (bends developer-rules rule 12, as 1.10 decision 6). One query resolves and locks every row's subtype (`FOR UPDATE`, in id order); each price is then written through the form's own path in the one transaction.
6. A row names its subtype by product and subtype name (04 rule 3). A named cell matches only real subtypes, so a real "Default" is importable; an empty cell matches only the hidden default of a product without subtypes. Every condition is on the locked `product_variants` row.
7. Every row error fails the file (04 rule 7), each a field error of its row, never a bare refusal (plan review, correction 1); two rows on one subtype are refused by the database too.
8. The template has the titles only.
9. One `catalog_imports` row of kind `PRICES` per import holds the client key; the history rows carry none.
10. The page and its button live under Prices.

Choices made during the build:

- `readPriceRows()` also returns `named`, every row whose names could be read, so the preview checks the names of a row with a wrong price or note too.
- The Import prices button shows on `/prices` when there is a subtype to price, to whoever can open `/prices` (today the Head only, as for the import); a screen does not decide a permission (permission review, nit 3, answered).
- Two existing tests used `prices` as the unknown kind; they now use `stock`, because 1.11 made `prices` a kind. Nothing was weakened.

### 1.12 Product suggestions (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (permission matrix). Seeing suggestions is `catalog.suggest` on the branch: the Head every branch, a Manager the suggestions of their own branches (a colleague's too), Principal and Finance none; another branch's is "Not found". No Manager right guards it.
2. **Look first** (permission matrix). Adding and declining are `catalog.manage`, the Head only (04 rule 8; 03 row 1).
3. **Look first** (file access contract). The suggestion's photo passes to the new product: both rows hold the same file. `SUGGESTION_PHOTOS` answers `catalog.pick` while a product holds the file, else `catalog.suggest` on the suggestion's branch, so the order of `FILE_OWNERS` decides nothing. The product guard skips `refusePhoto()` only for `acceptedPhotoId`, read from the locked suggestion row, never from the input; `createProduct`, `updateProduct` and the import never set it.
4. **Look first** (spec text). New screens beyond the 17 of `11-screens-and-ux.md`: `/suggestions`, `/suggestions/new`, `/suggestions/[id]`, `/suggestions/[id]/add`. The Manager reaches them from a link on the home page; the Head from a row on `/catalog` (Admin is marked there). Proposed `/spec-change`: add the row "Product suggestions | `/suggestions` | Manager, Head" to the Screens table of 11 and change "The app has 17 screens" to "The app has 18 screens".
5. Fields: name (catalog name rule, required), measure as text (required, 1 to 30), photo (optional), note (optional, up to 500); the decline reason required, up to 500. The database checks the same limits.
6. Columns beyond 14: `client_key` (rule 8) and `decided_at` (from the injected clock).
7. A suggested name any product holds, active or inactive, is refused with the field error `errors.field.inCatalog` ("already in the catalog, perhaps inactive"), a new error kind instead of the plain `taken`, so the Manager reads why. Two pending suggestions of one name are allowed.
8. Notifications: `PRODUCT_SUGGESTED` `{ name, branch }` (the branch's code) to every active Head but the actor; `PRODUCT_SUGGESTION_DECIDED` `{ name, outcome }` to the suggester; both carry the suggestion's branch.
9. A suggestion is decided once: the row lock and the PENDING check (`wrong_status`), and the guard trigger (no delete; PENDING to ADDED or DECLINED only; what was sent never changes). No version column.
10. The Head may suggest too, for any active branch.
11. A suggestion for an inactive branch is refused (`errors.field.inactive`), the branch locked FOR SHARE, as a new department.

Choices made during the build:

- **Look first** (permission layer). `decideList()` (domain) and `authorizeList()` (server) answer a list of a branch permission that names no branch: allowed when the role has a grant in some branch and a Manager's guarding right is on; the list then filters with `branchFilter()` inside its SQL. A permission of "own requests" is refused by it. `listSuggestions` with a branch view asks `authorize()` on that branch instead, so another branch is "Not found".
- `roleMay()` (domain) tells a screen whether a role may use a global permission, so the suggestion page shows Add and Decline without a `role === "HEAD"` in the screen.
- The add's input is the create's own (`createProduct.input` with `suggestionId`), so the product's checks are the same; the client key is the new product's.
- The decline reason is typed on the page, then the confirm dialog asks (the plan said the dialog holds the reason; the shared dialog has no field).
- The note and reason fields are plain textareas with their own ids: `Field` gives its id only to controls that read it.

### 1.13 Seed: catalogs (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed or changed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (price rule). A seed product with subtypes is written in its final shape: `has_variants` true, its real subtypes, no default row, `products.reference_price` null, and one `HEAD` row with no note per subtype; audit `product.create` (`referencePrice` null) and `subtype.create` with `before` null. The same state as the Excel import of 1.10 (decision 2), which passes a null price for such a product; the hand path keeps the product's price (review correction 3).
2. **Look first** (price rule). Every seed subtype has a price; a product without real subtypes holds the same price on `products.reference_price` and its hidden default, as `createProduct` writes it. Prices are `BigInt` literals, sent to `pg` as such and written in the audit as `toString()` (as `auditValue`); no `Number()` touches one. Each `HEAD` row is credited to `seed_head` at the seed's moment, with no note.
3. The catalogs are written with SQL in `scripts/seed-catalogs.mjs`, called by `seed()` inside its one transaction (the 0.14 handover). The audit `after` copies the create actions' fields; a test compares them with rows the real actions write.
4. A row is found by its table's unique key (the normalised name; a measure by name or short name; a department by branch and name; a subtype by product and name). Found rows are never changed.
5. A found product is kept whole: nothing is added to it; each subtype the seed lists that is found under it counts as kept (review correction 2).
6. A new product that would point at an inactive measure, category or company, or a new department at an inactive branch, refuses the whole seed ("Nothing was written").
7. The seed takes each catalog's advisory table lock (`hashtextextended(<entity>, 1)`) after the first-Head lock, in the order units, categories, extra cost types, companies, departments, products, subtypes.
8. **A change to the 0.14 handover** ("add a line created …/kept … and add it to the expected lines of the CI step"): `db:seed` prints no catalog line and the CI step is unchanged (review correction 1: a change under `.github/` is the owner's). `seed()` now returns `{ lines, catalogs }`: the printed lines and the created and kept count per catalog. The per-catalog lines are proposed to the owner in the report of pull request #43.
9. Names in Uzbek, generic goods; company names carry "(demo)"; tax IDs `30000000x`, phones in `+998 90 000 95 xx` and `96 xx`. No real brand.
10. No photos, no `client_key`, no minimum stock, no Manager rights rows.
11. Every seed value is in the form the create actions store; a test runs them through the domain validators.
12. README and `docs/deploy.md` keep the quoted output and gain one sentence about the catalogs.

Choices made during the build:

- The catalogs live in their own file, `scripts/seed-catalogs.mjs`, which the Dockerfile's run stage now copies beside `seed.mjs` (`tests/image-files.test.ts` demands every file `db-seed.mjs` reaches).

### 2.1 Orders: names and the built parts (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 3 applied), with the change the permission review made to decision 3, and those of the build. The Look first items come first.

1. **Look first** (money rule). `overspend_guard_min_amount` is stored as a JSON text of whole so'm (`"100000"`, CHECK `^(0|[1-9][0-9]{0,14})$` of migration 0018) and read as a `bigint`; `settingsFrom()` and `storedSettingValue()` of `src/domain/settings.ts` are the only conversions. A JSON number is read by JavaScript as a float (CLAUDE.md rule 6).
2. **Look first** (money rule). The amount may be 0 (only the percent counts) up to `MONEY_MAX`; the guard's one switch stays `overspend_guard_percent = "off"`; while it is off the amount field is hidden, its value kept and not sent (08, Overspend guard).
3. **Look first** (branch wall). The eleven request notification types are sendable with `{ actor, count, branch }` and the waiting ones with `{ count, hours }`. `branch` is one branch's code: an action on ticked orders of several branches sends one notification per branch with that branch's id and count (`orderActionNotices()`), so no recipient learns another branch's orders (03 rule 1; permission review). `actor` is the user's name for every type; `hours` is the setting in force; "submitted again" uses `REQUEST_SUBMITTED`.
4. Internal codes keep "request" (D43): permission keys, `CREATE_REQUESTS`, `RequestStatus`, the `requestStatus` namespace, the notification type names. Only the menu id and its keys (`shell.menu.orders`, `settings.ordersAndMoney`) are renamed.
5. The school name hint says "Shown in the menu."; 2.14 decides the PDF header.
6. Russian "заказ" / "Заказы" (the owner corrects Russian, D12).
7. The domain-import lint rule moves to task 2.2 (progress has the note).

Choices made during the build:

- Settings are read as `value::text` and parsed once with `JSON.parse` (`selectSettingRows()`, `parsedSettingRows()`): Drizzle's `jsonb` column runs `JSON.parse` again on what `pg` already parsed, so a stored `"100000"` came back as a number and a school name of digits would have made `settingsFrom()` throw. Any later read of a jsonb column that can hold a top-level JSON string goes the same way.
- `parseSomOrZero()` and `isSomOrZero()` in `src/domain/money.ts` beside `parseSom()`, for an amount where 0 has a meaning.
- The "no request word" test reads only the visible text of an ICU message (argument names and branch keys left out); "ariza" is matched at a word's start, so "inventarizatsiya" is not caught.

### 2.2 Domain: order totals (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (money rule). A set's goods are the sum of each order's round(quantity × price), never round(Σ quantity × price) (08, Numbers the system calculates, last paragraph).
2. **Look first** (money rule). Half up on a signed percent is half away from zero (decimal.js `ROUND_HALF_UP`): +12.5 → +13, −12.5 → −13. Money products are never negative (08 rounding paragraph).
3. **Look first** (money rule). The hint threshold is compared exactly before rounding: |typed − reference| × 100 > threshold × reference, in bigints; 20.02% over 20 shows "+20%" (05 Price hint).
4. **Look first** (money rule). The hint compares against the reference price only; no reference price, no hint (05 Price hint, field 11; 00-definitions).
5. **Look first** (money rule). The functions take only complete, valid plans and throw `RangeError` otherwise; the quantity passes `^[0-9]{1,11}(\.[0-9]{1,3})?$` and more than 0 before decimal.js reads it; price and extras more than 0. Whether a measure allows decimals, and what a draft without a price shows, are the form's (2.5).
6. **Look first** (money rule). A real difference that rounds to 0% (threshold 0) shows as 1% with its sign, never "+0%"; no typed price gives no hint; the threshold must pass `isPercent`, else `RangeError`.
7. **Look first** (money rule). No cap on totals: bigint is exact at any size; `MONEY_MAX` stays the form's limit.
8. The quantity enters as text, money as bigint; they meet only inside decimal.js (CLAUDE.md rule 6).
9. A private decimal.js clone, precision 64, `ROUND_HALF_UP`: the global's 20 digits would cut an 11 + 15 + 3 digit product.
10. `orders.priceHint` with an ICU `sign-always` number in three languages (CLAUDE.md rule 13; D12): uz "katalog narxidan +35%", ru "+35% к цене каталога".
11. The domain fence refuses every `..` segment (`(^|/)\.\.(/|$)`) and `@/`, not npm packages; test files are left out (review correction 1).

Choices made during the build:

- `priceHintPercent` returns a bigint, and the label takes it as it is: next-intl's number format prints a bigint exactly (a test formats a percent above 2^53). The message's TypeScript type says `number`, so a caller casts (spec review, Should fix 2).
- The payment type check reuses `isPaymentType` of `src/domain/settings.ts` (spec review, Should fix 1; developer-rules rule 1).
- decimal.js `^10.6.0`, the range style of the other dependencies; `npm audit --omit=dev --audit-level=high` passes, with no finding for decimal.js (the four moderate findings are drizzle-kit's, as on `main`).

### 2.3 Domain: the state machine (15.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 3 applied). The Look first items come first.

1. **Look first** (open question 5). Take back keeps the number; a taken-back order is `DRAFT` with its number, and its next Submit keeps the revision. Proposed `/spec-change` for `14-data-model.md`: "number UNIQUE (empty until the first submit; a taken-back Draft keeps it)".
2. **Look first** (open question 6). The creator is the owner, the Head included; the Head then holds that order's cash count. Proposed `/spec-change` for 03 rule 7: "An order has one owner: the user who created it, a Manager or the Head."
3. **Look first** (approval order). Submit again goes to `PENDING_HEAD` for every order, one the Head created included (06 Allowed moves; rule 4). The "Waiting for Principal" exception keys on the creator and stands on Draft → Submit only: a draft the Head created and then moved to a Manager (03 rule 7) still skips the Head step when the Manager submits it, as 06 says literally ("when the Head is the creator"; permission review).
4. **Look first** (permission matrix). `request.send_to_settlement`: Head all branches, Manager own orders, no Manager right; `CLOSE_ALONE` off sends orders there (08 Closing 1). Proposed `/spec-change` for the 03 matrix: add the row "Send an order to settlement | Yes, any branch | Yes, own orders | No | No".
5. **Look first** (approval order). Take back and Submit again are the owner's only (the table's "Owner"), the Head included only as owner; Submit, Cancel, Close exact match, Send to settlement are "Owner or Head". Manager moves of an order need `CREATE_REQUESTS`. The way out for the Head is moving the order (03 rule 7). Proposed `/spec-change` for the rows Take back and Submit again: "Owner or Head".
6. **Look first** (approval order). Close exact match is refused to anyone, the Head included, when the owner is a Manager whose `CLOSE_ALONE` is off (`ownerClosesAlone`); Send to settlement stays open.
7. **Look first** (spec gap). A taken-back Draft with a number has no Cancel (the table lists none) and cannot be deleted. Proposed `/spec-change` for the Cancel row: "Draft with a number, any "Waiting for" step, Sent back | Cancel | Owner or Head | Cancelled | Reason".
8. **Look first** (approval order). The screen offers Submit and Finance's Close without checking the submit checks or close readiness; the server refuses and names the orders (08 Closing 3; 05 Checks at submit).
9. **Look first** (enums). The move codes are the twelve `ORDER_ACTIONS`; 2.4 adds the non-move event types.
10. **Look first** (approval order). Refusal order per order: another branch or another user's Draft `not_found`, then `wrong_status`, then `forbidden`, then `not_ready`; every failing order is named and nothing moves.
11. **Look first** (approval order). One action may move orders from different statuses when each has a row for it; each takes its own row's `to`.
12. Close from Open and from settlement are two codes (`CLOSE_EXACT`, `CLOSE`); so are Send back and Send back for correction.
13. Reasons: trimmed, 5 to 500 code points; Send back for correction needs one.
14. No orders, more than 200 or the same order twice: nothing offered, the action refused.
15. The machine reads no clock, database or version.
16. File `order-moves.ts` beside `request-status.ts`; internal names keep "request" (D43).

Choices made during the build:

- The facts the screen cannot know before the action (Finance's close readiness) are checked by `checkMoves()` only; `allowedActions()` checks the rest of the same `judge()`, so the two never disagree on anything else.
- The generated test runs 92 160 combinations (10 statuses × 12 actions × 6 role-and-right settings × 128 relations and facts) against a hand-written oracle, in about a second.

### 2.4 Orders schema and many orders in one action (16.10.2026)

The plan's decisions as the plan review of 15.10.2026 confirmed them (corrections 1 to 5 applied), and those of the build. The Look first items come first.

1. **Look first** (approval order). Refusal order per order: `not_found` (branch wall, then draft wall), `stale_version`, `wrong_status`, `forbidden`, `not_ready`; every failing order is named with its first code, the action's code is the first any order has (correction 2: an order that is both forbidden and stale is `stale_version`). New code `not_ready` with `errors.notReady`; a missing or short reason is `invalid_input` on the field `reason`, for the whole action, before any order is judged.
2. **Look first** (approval order, CLAUDE.md rule 12; 06 rules 1 and 6). The plan, its cached `planned_total` and its extra costs change only while the order was `DRAFT` or `RETURNED` before the write; Finance's payment type also at `PENDING_FINANCE` (`orders_guard`, `order_extras_guard`).
3. **Look first** (branch wall). Composite foreign key (`department_id`, `branch_id`) → `departments (id, branch_id)`.
4. **Look first** (spec gap, rule 11). A never-submitted draft has no events; it is deleted with its extras (`ON DELETE CASCADE`, the guard lets the cascade through). A numbered order is never deleted.
5. **Look first** (enums). `order_action_type` and `order_event_type` hold the twelve move codes; "Created by Head" is the Submit event's `payload` `{ "headStepAuto": true }` (correction 5). A later task adds a value with `ALTER TYPE … ADD VALUE`.
6. **Look first.** `order_events.action_id`, `from_status` and `to_status` are NOT NULL (correction 4).
7. **Look first** (money rule). `stock_balances.avg_cost` is left to 3.1, with the average formula.
8. **Look first** (approval order). `createdByHead` is the creator's current role (`users.role` of `created_by`); a role change in between at worst gives a demoted creator's order the Head step.
9. **Look first** (changes decisions 0.8 no. 1 for this form). Step order lock, repeat, authorize, version, status: branch and owner are read once under the lock; a repeat answers only after its own `authorizeOrders()` on the stored orders with the permission of the move as made, and only for the same user and the same action type (permission review). The lock is taken on every sent id before the branch check: a user can hold another branch's rows for one short transaction, refused as `not_found`, and learns nothing (permission review, Should fix 3; kept, as the review of the plan confirmed).
10. Lock order by `orders.id`.
11. One result shape for the first call and a repeat: `{ actionId, orders: [{ id, status }] }`, rebuilt from the stored action and its events.
12. `orders.client_key` UNIQUE for the draft create of 2.5.
13. `version` and `revision` start at 1; `progress` NOT NULL default `OPEN`.
14. The plan columns are nullable while `DRAFT` and required outside it; Urgent needs its reason outside `DRAFT`; `planned_total` ≥ 0 (correction 1: 0.001 × 400 so'm rounds to 0).
15. `reference_photo_file_id` UNIQUE (decisions 0.12 no. 5).
16. `authorizeOrders()` in `authorize.ts`: one actor read, `decide()` per order.
17. "Already approved by … at …" is read by 2.10 from the newest event.

Choices made during the build:

- The history tables also refuse TRUNCATE, as `audit_log` and `price_history` do.
- `behindDraftWall()` lives once in `src/domain/order-moves.ts`; the state machine and the wrapper call it (spec review, Should fix 1).
- The lock query joins the ids with `sql.join`: drizzle's `inArray(orders.id, …)` names the table and fails under the alias `o`.
- `UPLOAD_STATUS` answers `not_ready` with 409, as every code needs a status there.

### 2.5a Drafts: rules, actions and queries (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (task split). 2.5 is split into 2.5a (rules, actions, queries) and 2.5b (the grid); every test of the old Done-when is a server rule and sits in 2.5a.
2. **Look first** (05 Drafts 2 and 3). A draft is added once it names branch, subtype, department and quantity; the merge happens at the add only; a later edit into an existing trio is refused `draftExists`. `updateDraft` refuses an empty branch, subtype, department or quantity (`required`, correction 1).
3. **Look first** (developer-rules rule 8). `order_draft_adds` holds a merged add's `client_key` with `qty_after`, `version_after` (correction 2) and `total_after` (spec review of the build): a repeat returns the stored first answer, never one rebuilt from the current row.
4. **Look first** (05 field 11). Suggested price: the subtype's reference price, else its last purchase price, else empty; written into `planned_price` when none is typed. The hint compares with the reference price only.
5. **Look first** (05 field 10). Decimals only where the measure allows them; a change of subtype re-checks the stored quantity (`wholeOnly`); a merged sum past numeric(14,3) or a total past `MONEY_MAX` is `tooLarge`, never `unexpected`.
6. **Look first** (decisions 1.7 item 1). Any order, a draft included, locks its product's type and measure (`FOR SHARE` against the edit's `FOR UPDATE`); deleting the only draft lifts it.
7. **Look first** (draft wall). Another user's `DRAFT` is `not_found` for everyone but its owner and the Head; edit is the owner's or the Head's; delete is the owner's only, the owner check before the version check (permission review).
8. **Look first** (branch wall). A draft's branch changes only to an active branch, with a department of it, passing `request.create` for the actor (`not_found`) and for the owner (`branchId: notAllowed`); a numbered order's branch is refused.
9. **Look first** (permission matrix). The grid lists `DRAFT` and `RETURNED` orders, paged 25 on the server; a Manager sees own rows (with `CREATE_REQUESTS` off too, read-only); the Head own rows, every owner's with `owners=all` (any other value falls back to own); Principal and Finance are refused the list (role checked before branch, `seesDraftsGrid()`).
10. **Look first** (action wrapper). "Apply needed-by to all ticked" is one transaction on up to 200 drafts on the exported 2.4 helpers; no `order_actions` or event row (a draft edit is no move).
11. **Look first** (file access). The reference photo answers `data.view` plus the draft wall (`draftOwnerId`), so the owner keeps it with `CREATE_REQUESTS` off; it has its own permission-matrix test.
12. **Look first** (spec contradiction). Proposed `/spec-change` for 05 Drafts 3: "Autosave. Once its product, department and quantity are given, a draft saves itself after each change and shows "Saved"."
13. **Look first** (money). At most 20 extra-cost rows per order (`DRAFT_EXTRAS_MAX`); each amount more than 0.
14. **Look first** (accepted risk). `order_draft_adds` and `orders.client_key` go with a deleted never-submitted draft (cascade); a retry is only sent before the first answer, and a delete needs that answer.
15. Urgent reason: 1 to 200 code points, checked on the row as it will be; Normal clears it.
16. Needed-by date: any valid date in a draft (`isBusinessDate()`); "not in the past" is checked at submit (2.7).
17. Payment type defaults to `default_payment_type`; the company to the product's default company while that company is active.
18. Comment at most 1000, requested-by at most 120 code points, trimmed, empty as null.
19. `planned_total` is written on every draft write by `draftTotal()`, null while quantity or price is missing.
20. Inactive branch, product (also under an active subtype), subtype, department, company and extra-cost type are refused when picked.
21. No audit row, event or notification for a draft write.
22. `RETURNED` orders and numbered drafts are edited, never merged or deleted.
23. Money and quantity cross the wire as text.
24. No change to `src/server/action.ts`; the trio's advisory lock is taken in `write`, a 23505 on `orders_one_draft_key` is `draftExists`.
25. `.claude/rules/requests.md` still names `src/features/requests/**`; a process change for the owner.

Choices made during the build:

- `createDraft` finds the draft to merge with `SELECT … FOR UPDATE` and the full match (`lockTrioDraft()`), so a draft moved or deleted meanwhile drops out and the add makes a new one (spec review, Must fix 1); a line in `.claude/agents/spec-reviewer.md` now checks this pattern.
- `deleteDraft` checks the version in its `check` step under the lock, since the wrapper's version step would raise the version of a deleted row.
- `getDraft` turns a `not_found` of `authorize()` into `null`, so every not-found looks the same.
- `order_draft_adds` has no append-only trigger: the cascade of a deleted draft needs the delete, and no code updates it.
- `plainQuantity()` drops trailing zeros, so a first answer and a repeat both say "20"; `inStock()` shows "0" without a stock row and nothing for a service.
- `tests/helpers/together.ts` `commitWhileWaiting()` holds a change until the action waits on a row lock (read from `pg_stat_activity`).

### 2.5b Drafts grid on `/orders` (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (corrections 1 to 5 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (money: ticked totals). The totals under the grid come from `tickedDraftsTotals()` of `src/domain/drafts.ts`, which calls `ordersTotals()`; a ticked draft without quantity or price is left out whole, its extra costs included, and counted ("N without a price"). Money text is read with `BigInt()` only, after a digits check.
2. **Look first** (money: a new formula). `extrasSum()` in `src/domain/order-totals.ts`, which `orderExtras()` now calls; the extras cell shows it, never total minus goods.
3. **Look first** (permission matrix: read-only grid). A Manager with `CREATE_REQUESTS` off sees his rows as text, no add row, no Apply, no delete; `draftRowRights()` and `addsDraftsIn()` ask `decide()` as the server does.
4. **Look first** (draft wall on screen). Delete only on the person's own never-submitted draft; the Head edits another owner's draft but cannot delete it.
5. **Look first** (spec contradiction). 05 field 7 is named "Requested by", and the rule of 2.1 (`tests/notification-texts.test.ts`) forbids the word "request" in any text. The column is labelled "Department" / "Boʻlim" / "Отдел". Proposed `/spec-change` for 05 field 7: "| 7 | Department | Department picked from this branch; shows its responsible person | Required. An optional text field names a specific person. |".
6. **Look first** (design system). The totals of the ticked drafts stand under the grid (05 "Under the list"), with the count beside them; the selection bar above keeps the count, the date, Apply and Clear. The design system puts selection totals in the bar; the spec wins.
7. Ticks belong to the page shown; a page, branch or owners change clears them.
8. Autosave: selects, priority and the extras dialog save on change; text cells on blur or Enter, once per text. One save at a time per row, the next with the answered version (`row-save-queue.ts`); every save reloads the row with `getDraftAction`.
9. Urgent waits for its reason; Normal saves at once and clears it.
10. "Add" needs branch, product with its subtype, department and quantity; one client key per add, a second click while pending sends nothing.
11. The add row's branch is the top bar's branch when active and allowed, the only branch when there is one, else a select.
12. Branch, product, subtype, department stay editable; a branch change waits for a department of the new branch and both go in one save.
13. `stale_version` reloads the row and says so.
14. Principal and Finance see "Your order list comes here" with no button; an empty grid of a view-only Manager says where drafts appear, not "add below".
15. The extras dialog edits up to 20 rows and saves once on "Done".
16. The reference photo uses the 0.12 upload, opens in a new tab, "Remove" saves without it.
17. The Head's "My drafts / Everyone's" is a segmented control kept in the address.
18. Oldest first, no sort control; a new draft on a later page sends the person to that page.
19. "Sent back" has RETURNED's look (info, `undo`); "Taken back" info with `history`.

Choices made during the build:

- The subtype is picked inside the product picker (one hit per subtype), and the subtype cell is text: one pick gives the `variantId` the action takes, for adding and for changing.
- Needed-by is typed as `08.10.2026` and read by `parseTypedDate()`: a native date field shows the browser's format, against 11 rule 10.
- A ticked row is shaded `--muted`, not `--today` (the token is for "now" and the selection bar).
- The save queue is `src/features/orders/components/row-save-queue.ts`, plain TypeScript with its unit test; `canApplyToTicked()` in `grid-rules.ts`.
- Each Playwright project has its own drafts Manager (`E2E_DRAFT_USERS`), whose never-submitted drafts the test deletes first, in the e2e database only.
- The table's scroll box is `relative`, so its hidden file inputs stay inside it (they made the page scroll sideways at 375 px).
- Two lines added to `.claude/rules/ui.md` and one to `.claude/rules/server-actions.md` from the reviews.

### 2.6 Drafts: keyboard and phone (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed or changed them (corrections 1 to 4 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (developer-rules rule 8; decisions 2.5a item 14). An add that gets no answer is sent again with the same input and client key until an answer comes. While it retries, the grid holds its refreshes and disables delete, so a draft made by the lost try cannot be shown, deleted and made again by the retry. What stays is the risk 2.5a accepted: a delete from a second device during the outage brings the draft back once.
2. **Look first** (developer-rules rule 9). An edit is retried with the same version and needs no client key. A retry answered `stale_version` counts as saved only when the reloaded row holds every field the retry sent (`rowHoldsSent()`, which fails closed on extra-cost rows) and its version is the one this write made (`sentVersion + 1`; permission review, Must fix 1). Otherwise it takes the stale path of 2.5b item 13. A failed reload also takes the stale path (spec review, Should fix 3): rare, and it never loses data on the server.
3. Tab moves across, in the browser's order; Enter moves to the same column of the next draft, Shift+Enter up; Enter on the last draft goes to the add row, where Enter adds when the row is complete and otherwise goes to the first empty field.
4. Enter on a select moves; Space or Alt+Down opens it. Buttons, the tick box and the open product list keep Enter for themselves.
5. Cards below 640 px, the design system's phone width; the same DOM restyled, each cell with its column name for the eye (`aria-hidden`), every control 44 px.
6. The totals of the ticked drafts stick to the bottom of the window (above the tab bar on a phone), folded to the count and grand total on a phone with "Show details".
7. Delete and "Apply to ticked" are not retried automatically.
8. The add row is locked from its first try until an answer; after the online tries run out ("Not added") its fields stay locked to the input the key was made for: "Add" sends the same again, "Start over" drops the key and reads the list again (both reviewers, Should fix 1).
9. The grid's network text is "No connection. Trying again…"; other screens keep `errors.network`.
10. Offline: wait for the `online` event (checking every 30 s) without limit. Online with no answer: five tries after 2, 4, 8, 16 and 30 s, then "Not saved" with "Try again". Nothing is kept in browser storage.
11. "The same drafts" at 375 px are the same three products and departments, added by the 375 project's own Manager (plan review, decision 12).

Choices made during the build:

- `src/components/retry-wait.ts` (the waits, `retryWhileLost()`), `sent-guard.ts`, `grid-keys.ts`, `save-state.tsx`: plain parts with their own unit tests.
- A render loop found on `main` (each typed cell got a new `onDirty` callback every render; "Maximum update depth exceeded" on `/orders`) is fixed with one stable callback per cell; the e2e tests assert that no such error appears.
- On a phone the product list is as wide as its field (it made the page scroll sideways).
- Two lines added to `.claude/rules/ui.md` from the build and the reviews.

### 2.7 Submit and the order numbers (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed or changed them (corrections 1 to 5 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (approval order). The submit checks: every required field of 05 Order (branch, subtype, department, needed-by, quantity, price, payment type; an Urgent order its reason), the quantity against the measure's decimal rule (field 10), and every catalog entry the order itself holds active: branch, product, subtype, department, brand or company, each extra cost type. Not the product's measure or category (review correction 1: the measure is automatic from the product and the category is no order field; decisions 1.7 keep such a product orderable). The owner's active flag is not checked.
2. **Look first** (approval order). Needed-by "not in the past" compares with `businessDate(now())` in Tashkent: today passes, yesterday fails.
3. **Look first** (approval order). A DRAFT that already has a number (taken back, 2.11) is refused at Submit with `not_ready` until 2.11 decides its re-submit: `order_revisions` is append-only with UNIQUE(order_id, revision).
4. **Look first** (money). `planned_total = orderTotal()` of `src/domain/order-totals.ts`, written once at submit.
5. **Look first** (numbers). Year = `businessYear(now())`, two digits `year % 100`; within a submit by `created_at`, then `id`; one counter upsert per branch in branch-id order after the orders' lock; locks always orders → branches → counters.
6. **Look first** (notifications). "Orders submitted" to every active Head but the actor, one per branch; a Head-created order skips the Head step, so the branch's Principal gets "Head approved".
7. **Look first** (spec wording). The branch code locks at the branch's first order with a number; guarded in `updateBranch` and by the trigger `branches_code_locked` (raised as `check_violation` with the constraint name). Proposed `/spec-change` for 04, Catalogs table, Branches: "It locks at the branch's first submitted order."
8. The notification link is `/orders?branch=<id>&action=<actionId>`; 2.8 builds the filter.
9. A draft using an inactive entry of item 1 is marked on its cell when the grid loads, and again as the submit error.
10. `not_ready` carries its cells in an optional `fields` of `OrderFailure`; the order of `ORDER_REFUSAL_CODES` is unchanged.
11. Moved to 2.11 with item 3.
12. The snapshot holds ids and values, money as whole-so'm strings, not names.
13. Submit is never retried automatically. Its client key is kept only after a call with no answer and only while the same drafts stay ticked; any answer or any change to the ticks drops it (review correction 4; spec review of the build, Should fix 1).

Choices made during the build and its reviews:

- `stock_at_submit` is copied in SQL as `numeric(14,3)` (correction 3); the `beforeMove` hook of `orderMoveAction` writes number, `submitted_at`, `planned_total` and `stock_at_submit` while the row is still DRAFT (correction 5).
- `submittedNumbers` has the draft wall inside the SQL, since a taken-back DRAFT keeps its number (permission review, Must fix 1); a rule line added to `.claude/rules/server-actions.md`.
- The Submit matrix has cases where only the branch wall refuses (the user's own draft in a branch he is not assigned to; permission review, Must fix 2).
- `commitWhileWaiting` takes a number of waiters; S14 commits the held counter row only when both submits wait on it (spec review, Must fix 1).
- Submit is a small secondary button in the selection bar (design system, Lists; spec review, Should fix 2).
- Left for 4.10: a Head-created draft moved to a Manager would skip the Head step on that Manager's submit (permission review, Should fix 1); noted in progress.

### 2.8 Order list: group rows, ticking and filters (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (correction 1 applied to item 8), and those of the build and its reviews. The Look first items come first.

1. **Look first** (approval order). The list shows every status but `DRAFT`; drafts, never submitted or taken back, stay in the drafts grid. `RETURNED` is in both. The SQL has `status <> 'DRAFT'` for everyone, which is also the draft wall.
2. **Look first** (spec wording). 05 Group rows 5 ("The Manager's own view counts every stage") is the Manager's home summary of 6.1, not a second group key. Proposed `/spec-change` for 05 Group rows 5: "On the Manager's home, a summary counts every stage of the Manager's own orders: 'Tata pens: 30 requested'."
3. **Look first** (money). Group sums are `groupSummary()` of `src/domain/order-list.ts`: `ordersTotals()` of the member orders, the quantity summed with decimal.js outside `quantityOf()` (a group may pass 11 whole digits). SQL only filters, groups, orders and pages.
4. **Look first** (money). The price hint of a submitted order compares with today's reference price and `price_hint_percent`; a group shows the hint farthest from the catalog price, the positive one on a tie (`groupPriceHint()`).
5. **Look first** (approval order). The action bar asks `allowedActions()` on the server (`tickedSummary`) and shows a button only for a move with a server action; in 2.8 none (Approve 2.10; Send back, Reject, Cancel, Take back 2.11), so it shows count, totals and "Clear".
6. **Look first** (dates). One date range with its kind (created, submitted, approved, closed), Tashkent days inclusive through `businessDayStart()` and `nextBusinessDate()`; "approved" is `approved_at`, written when Finance's approval opens the order (2.10).
7. The group key is branch, `variant_id`, status.
8. "Select all on this filter" ticks the first 200 in the list's order and the bar says "200 of 340 ticked".
9. The list's ticks and the grid's are separate. The list's ticks survive a change of page; a change of filter or sort clears them (review correction 1). The grid's ticks belong to its page shown.
10. Sorts `neededBy` (default), `submitted` (earliest submit, then the lower counter as an integer), `product`; no sort by amount. Inside a group: submitted_at, then the counter.
11. Number range: same branch code and year, counters compared as integers; two prefixes keep `from` only and say so.
12. `?branch=` wins for the list, else the top bar's branch ("As in the top bar" in the branch choice). The grid keeps the top bar's branch. The list pages with `?page=`, the grid with `?draftsPage=`; each pager keeps every other parameter, and so does the Head's "My drafts / Everyone's".
13. Filters are single choices; `action=` filters on `order_events.action_id` with a removable chip.
14. Urgent is pinned on top for the Head, Principal and Finance, not the Manager.
15. An opened group shows its orders of the current filter, read with the page.
16. `tickedSummary` counts unknown, unseen and now-Draft ids alike as `missing`; the screen unticks them and refreshes. A repeated id is refused.
17. A tick that would pass 200 orders ticks nothing and says so (`tickFits()`).

Choices made during the build and its reviews:

- `readSnapshot()` (`src/server/read-snapshot.ts`): the list's count, heads, orders and extras, the ticked orders and their extras, and Select all's count and ids each read in one read-only REPEATABLE READ transaction (spec review, Must fix 1 and Should fix 1, 2); a rule line added to `.claude/rules/server-actions.md`.
- The filter choices: owners of the listed orders, departments of the visible branches, every category (a global catalog); inactive entries stay, marked.
- Two e2e tests of 2.5b changed with the layout, not weakened: the Principal now has the order list (a table), so "no table" became "no draft row and no drafts grid"; the phone totals test scrolls to the grid, which now stands below the list.
- The test helper `insertOrder()` takes needed-by, quantity, price, payment type and the dates; its planned total is `orderTotal()`.

### 2.9 Order page (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (branch wall). "With N other orders" counts only the other orders of the same action that the reader may see now (branch wall and draft wall inside the SQL, on `branchFilter()`), never `order_actions.order_count`; none visible, no such text (03 rule 1 over the literal example of 06 rule 11).
2. **Look first** (approval order, 06 rule 4). At Draft and Sent back no step is finished; otherwise only the moves after the newest Submit or Submit again count, and no step after the current one is shown finished (a reopened order stands at Open, Closed empty).
3. **Look first** (03 rule 6). A Head-created order's one Submit with `payload.headStepAuto` finishes Draft and Head with the Head's name and time; History says "Created by Head". The stepper keys on the event's payload, never on the creator.
4. **Look first** (permission matrix: the action bar). The bar asks `allowedActions()` on the server and shows a button only for a move with a server action: in 2.9 Submit on a Draft, with the confirmation of 11 rule 6. The waiting line shows only when `allowedActions()` is empty, so an approver at his own step sees an empty bar until 2.10 and 2.11.
5. **Look first** (03 rules 2 and 3). The waiting line: Head; the branch's active Principal by name, or "none is assigned"; Finance of the branch (Waiting for Finance, Waiting for settlement); the owner's name (Draft, Sent back, Open); "Finished. Nobody acts on it." (Closed, Rejected, Cancelled).
6. **Look first** (draft wall). A Draft has a page for its owner and the Head only; another branch, another owner's Draft, an unknown and a malformed id are one `notFound()`; a never-submitted draft shows "Draft without a number".
7. The price hint is shown to every user who may see the order, as on the list.
8. The hint compares with today's reference price through `priceHintPercent()`; no reference or planned price, no hint.
9. Waiting for settlement stands at Closed with Open finished by Send to settlement; after Send back for correction at Open. A Closed exact match has Open and Closed finished by the one Close (exact match); after settlement Open by Send to settlement and Closed by Finance's Close (review correction 1).
10. Tabs in the address (`?tab=history`), Details by default; no Purchases or Money tab before 3.5 and 4.3.
11. History newest first; times `08.10.2026 14:32` in Tashkent; the actor's current name; the reason from `order_events.comment`, the note from `order_events.note`.
12. Stock at submit and now are 2.10's; the colour labels phase 3/4's.
13. A Head-created draft moved to a Manager would put the Manager's name on the Head step: 4.10's case.
14. One active Principal per branch (`user_branches_active_principal_branch_id_key`), so the name is unique.
15. The bar stays fixed at the bottom with only the waiting line.

Choices made during the build and its reviews:

- `createdByHeadSql` and `ownerClosesAloneSql` moved to `src/features/orders/order-facts.ts`, shared by `tickedSummary` and `getOrderPage`; outside `queries/`, whose exports the registry test counts as queries.
- The "with N other orders" count is a drizzle subquery on aliases with `branchFilter()` and the page's SQL draft wall, not a second hand-written wall (permission review, Should fix 1).
- The details are inline in the page; the planned `order-details.tsx`, `order-page-wire.ts` and `not-found.tsx` were not needed (no bigint crosses to the browser; the app's not-found page serves).
- The percent of the hint is passed to next-intl as the bigint, as the list and the grid do (decisions 2.2, build: next-intl prints a bigint exactly).
- The e2e test has its own Manager and Finance user per project (`E2E_PAGE_USERS`) and submits through the page's own Submit.

### 2.10 Approvals (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (state machine, permission matrix). One `approveOrders` action for the three steps; each order's permission is its status row's (`request.approve_step1/2/3`); ticks at mixed steps refuse the whole action, the other step's orders `forbidden`.
2. **Look first** (06 rule 1). Finance changes the payment type only inside its own Approve, per order, written in `beforeMove` while the order is still PENDING_FINANCE (`orders_guard`); the total does not change; a type from any other actor or on any other step refuses the whole action as `forbidden`; an unchanged type writes and logs nothing; a change is logged `{ paymentType: { from, to } }` and shown in History.
3. **Look first** (06 rule 7; branch wall). "Already approved by X at T" only for an order the actor may still see, refused `stale_version` or `wrong_status`, its version above the one sent, its newest event an Approve by another user, and the actor's role approving that step (permission review, Should fix 2); otherwise the plain refusal line. Behind a wall: `not_found`, no name.
4. Stock now is read when the page or list loads, in the same snapshot; stock at submit is `stock_at_submit`; a service shows "–"; 0 reads "0".
5. Notices: Head approved → the branch's active Principal; Principal approved → its active Finance users; Finance approved → the owners of that branch's orders and every active Head; one per branch and recipient; never the actor.
6. Ticks are cleared after every answer; a refusal names each order above the list and marks it in its opened group until the next answer.
7. A replaced Principal needs no data move (03 rule 3).
8. `approved_at` is written from the clock by Finance's approval (review correction 1); time in Tashkent through the shared formatters (correction 2).

Choices made during the build and its reviews:

- Each ticked order is sent with the version the screen last showed it at (a ref per id, filled from the groups and from "Select all"), read when the call goes out.
- `tickedSummary` also returns each ticked order's number, status and payment type, for the dialog.
- The refusal lines take their texts as three callbacks (`ApproveTexts`), so the helper needs no typed translator.
- The registry lists `approveOrdersAction` under `request.approve_step1` with a note naming all three; the matrix tests all three steps.
- Approve is Small in the desktop selection bar beside Clear (design system, one size in a row).


### 2.11 Send back, reject, cancel, take back; what changed (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build and its reviews. The Look first items come first.

1. **Look first** (approval order; 06 Take back; decisions 2.3 item 1). A taken-back Draft is submitted with Submit and keeps its number, revision and first `submitted_at`.
2. **Look first** (constraint widened; 14 order_revisions). `order_revisions.submission`; the key is (order, revision, submission), migration 0022. The newest copy of a revision is its highest submission, never its latest time (correction 1).
3. **Look first** (06 rule 5). What changed compares the newest copy of the revision before with the newest of the current one, from rev 2, for everyone who sees the order; the plan fields of `orders_plan_frozen`, each extra cost by type (summed), and the planned total. A taken-back resubmit keeps rev 1 and shows none.
4. **Look first** (06 rule 10; money). `planned_total = orderTotal()` and `stock_at_submit` are written at every submit; `submitted_at` only at the first (correction 2: reminders of 8.1 count from the step's newest event).
5. **Look first** (notifications). Send back, Reject: the owners and every active Head, one per branch, de-duplicated, never the actor. Submit again: every active Head. Take back, Cancel: nobody.
6. **Look first** (permission matrix). Take back and Submit again the owner's only; Cancel owner or Head (decisions 2.3 item 5).
7. **Look first** (06 rule 7). "Already sent back / rejected / cancelled / taken back by X at T" as for Approve; the approver's verbs only to a role that decides that step; Cancel and Take back to any reader who still sees the order.
8. **Look first** (approval order; permission review, Must fix 1). Only the first Submit of a Head-created order skips the Head step: `created_by_head` of the lock is true only while the order has no number. A taken-back order goes to the Head.
9. **Look first** (tests changed because a decision changed). The 2.7 test "a numbered Draft is refused until 2.11" became "a taken-back Draft is submitted with its own number"; the 2.4 schema test of the revision key follows item 2; the 2.4 wrapper test's numbered Head Draft now goes to the Head (item 8); the e2e owner bars of 2.9 and 2.10 count Take back and Cancel. Each still proves its rule.
10. The note per Send back order: trimmed, up to 500 code points, an empty one dropped, stored in `order_events.note`.
11. The grid offers Submit or Submit again only when the state machine allows it on every ticked row; mixed ticks offer neither. The list bar has no Submit again.
12. Cancel of a taken-back Draft stays impossible (decisions 2.3 item 7).
13. The reason box counts characters; Confirm waits for 5; the server checks again.

Choices made during the build and its reviews:

- `approve-lines.ts` became `move-lines.ts` with one `alreadyDecided(verb)` text; `orders.approve.alreadyApproved` moved to `orders.moves.already.APPROVE`.
- `ConfirmDialog` takes `confirmDisabled`.
- What changed uses the existing `edit` icon; no icon was added.
- Two e2e Managers of their own (`E2E_MOVE_USERS`), reset to Uzbek each run.
- A rule line in `.claude/rules/server-actions.md`: a first-pass shortcut is checked again when a task opens a way back.

### 2.13 Copy as new and stale drafts (16.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (permission matrix). Copy as new needs `request.create` in the branch of every ticked order: the Head, and a Manager with `CREATE_REQUESTS` there, on any order of the branch they can see (05 "Any order"). Principal and Finance get no button and are refused. The source passes the branch wall and the draft wall of `guardOrders`.
2. **Look first** (draft merge; 05 Drafts 2). The copy is the copier's draft in the order's branch; it merges into the copier's never-submitted draft of the same branch, subtype and department, also within one copy, in the order the ticked orders were sent. A Sent back or taken-back numbered draft is never merged into (05 Drafts 5). The answer names each merge: "Added to your draft: now 20".
3. **Look first** (money). A new draft keeps the order's typed price, extra costs and payment type as they stand now; a merge adds only the quantity, and the existing draft keeps its own price, extras and payment type. `planned_total` is `draftTotal()` of the row every time. The company is copied as it is, an empty one included (review correction 2).
4. **Look first** (developer-rules rule 8). One client key per ticked order, stored in `orders.client_key` or `order_draft_adds.client_key`; every key known gives the first answers to their maker only, while `request.create` still allows each draft's branch; some known and some new is `conflict`.
5. **Look first** (rule 9 reading). Each ticked order's sent version is checked; the source is never written, so its version is not raised and no `order_actions` or `order_events` row is written.
6. A deactivated product, subtype, department, company or extra cost type is copied as it is and the draft is marked; Submit refuses it. An inactive branch, or a draft that names no subtype, department or quantity, refuses that order (`not_ready`).
7. Not copied: number, revision, history, approvals, stock at submit, the reference photo. A past needed-by is kept; Submit checks it.
8. "Overdue": Waiting for Head, Principal or Finance, Sent back, and Open while buying is not finished, with needed-by before today's Tashkent date from the injected clock; today is not overdue. Nothing is blocked (review correction 1; tested with two approvals of an overdue order). Submit again of a Sent back order still checks the date: that is the submit rule (05 Checks at submit), not a block of a waiting order.
9. The hint "shows the new suggestion" is the existing price hint against the reference price ("-23% vs catalog price", S18); no new text.
10. No event, notification or audit row for a copy (a draft write; decisions 2.5a item 21).
11. Copy as new is offered in the order list's bar and on the page of a numbered order, not in the drafts grid.

Choices made during the build:

- **Look first** (tests changed because a requirement was added). The e2e owner bars of 2.9 (`order-page.spec.ts`) and 2.10 (`approvals.spec.ts`) count one more button, Copy as new, and assert it is shown: the owner may add drafts in the branch (item 1). Each still proves its rule.
- A third wrapper, `src/server/copy-action.ts`, on the lock, guard and failure helpers of `order-action.ts`: `runOrdersAction` writes action rows and raises versions, `runDraftsAction` raises versions and has no key. Each create runs in a savepoint, so a database refusal (the one-draft index) leaves the transaction usable and every failing order is named.
- The pick checks of `createDraft` (company, extras, photo) moved out of `insertDraft()`, which now writes the fields as given.
- The trio advisory locks are taken once, sorted, before the creates; the key locks of the repeat are taken sorted too.
- The Overdue label follows the Urgent label of the same rows (icon and word, warning colour), not the status-label component: it is a flag beside the status, as Urgent is.
- Own e2e owners `E2E_COPY_USERS`, so the copies land in drafts no other spec reads.
- A repeat puts the ids sent through the branch wall and the draft wall again (permission review, Must fix 1); a rule line in `.claude/rules/server-actions.md` now asks for it.
- A key spent on `createDraft` and sent again to Copy as new (or the other way) gives the first action's answer: both write the same kind of row, the answer goes only to the same user in a branch still allowed, and keys are made anew per call by the browser. No action type is stored for it (permission review, Should fix 1, not taken: it would add a column for a case no screen sends).

### 2.14 Download: Excel and PDF (17.10.2026)

The plan's decisions as the plan review of 16.10.2026 confirmed or changed them (corrections 1 to 6 applied), and those of the build. The Look first items come first.

1. **Look first** (a dependency installed for the first time). `@react-pdf/renderer` 4.9.0, on the stack line (13 "Excel and PDF"); MIT; `npm audit --omit=dev --audit-level=high` shows only the four existing moderate findings of `drizzle-kit`. No `serverExternalPackages` needed: the download passed its browser test on `next dev` and on a production build (`next build` and `next start`).
2. **Look first** (a new dev dependency). `pdfjs-dist` 6.4.299 (Apache-2.0, Mozilla), devDependency only, to read the PDF's text in tests (`tests/helpers/pdf-text.ts`), as the Done-when asks.
3. **Look first** (money, CLAUDE.md rule 6; review correction 1). Money in the Excel file is a number cell, `Number(amount)` only from 0 to `MONEY_MAX` (999 999 999 999 999, the 15 digits Excel keeps exactly), refused above; no formulas, the totals rows are values of `ordersTotals()`. Quantities from their `numeric(14,3)` text. Formats `#,##0` and General.
4. **Look first** (branch wall). `data.export` (every role, branch scope); rows from `listWhere()` with the branch wall and the draft wall in the SQL; a `branch=` of another branch is 404. The names in the filters line are read inside the same walls; an id they do not name prints "—" and still filters.
5. **Look first** (approval order). Who approved each step is `orderSteps()`: only moves after the newest Submit count; a Head-created order's Head step is the Head's Submit; a Rejected or Cancelled order keeps its finished steps.
6. **Look first** (which orders a total covers; review correction 5). The totals under the rows cover every order of the file, with exactly the fields of the list's totals bar: goods, extra costs, grand total, and each payment type.
7. Every order of the filter is in the file, no page and no 200 cap, in the list's order.
8. Columns beyond the spec's list: measure beside quantity; the step's name and time as two Excel columns (one cell of two lines in the PDF); "rev n" on the number from rev 2; extra costs as their sum.
9. **Fonts** (review correction 2). From the OFL variable file of google/fonts (`ofl/golostext/GolosText[wght].ttf`, sha256 `17bb58fb…2063`; the OFL names no Reserved Font Name), made once in the session with fontTools 4.67 and opentype-feature-freezer:
   - `fonttools varLib.instancer GolosText[wght].ttf wght=400 -o r.ttf` and `wght=600 -o s.ttf`;
   - `pyftfeatfreeze -f tnum r.ttf GolosText-Regular.ttf` and the same for SemiBold: tabular figures are the default digits;
   - U+02BB, missing from Golos Text, is mapped in the cmap to the glyph of U+2018 (the same turned-comma shape), so Uzbek "oʻ, gʻ" print;
   - the SemiBold file's names are set to "Golos Text SemiBold" / PostScript `GolosText-SemiBold` (typographic family "Golos Text"): with the same PostScript name as Regular, react-pdf embedded a new font copy for every text run.
   The files and `OFL.txt` are in `src/features/orders/download/fonts/`, copied into the image by the Dockerfile (checked by `tests/image-files.test.ts`).
10. The PDF header (decides decisions 2.1 item 5; review correction 6): the letterhead strip with the on-dark one-line logo made a PNG by sharp, once per process; the school name before the title when set; the filters line, "Downloaded by …, dd.mm.yyyy HH:mm" (the injected clock) and "Page n of m" on every page; the Status word of Rejected and Cancelled in muted grey (review correction 3). No signature lines.
11. The language is `chooseLocale()` of the user's locale and the cookie, as the screen (review correction 4); words through next-intl's `createTranslator`, formats through `bindFormatters()`.
12. A GET route handler, not a server action; it writes nothing (D5 kept).
13. The buttons are links with the list's effective filters (the top bar's branch included), shown over an empty list too. Both use the `download` icon of the set already built (the plan named `picture_as_pdf`; one icon keeps the icon list unchanged).
14. File names `orders-YYYY-MM-DD.xlsx` / `.pdf`, the Tashkent date of the injected clock.
15. `docs/design-system.md` still says "the formal request PDF (tasks 2.14 and 3.5)" and that Golos Text "covers Uzbek Latin (oʻ, gʻ with U+02BB)"; neither is true now. The shared text is not changed by a task (D23). Proposed wording: "The order list PDF (tasks 2.14 and 3.5)", and "It covers Cyrillic and Uzbek Latin except U+02BB, which the browser draws from a fallback font and the PDF fonts map to U+2018".

Choices made during the build:

- **Look first** (a test changed). `tests/permission-registry.ts` counts `authorizeList()` as a route file's own check beside `authorize()` and `requireUser()`: the download route names no branch unless filtered. The route calls it before `orderDownload()`, which asks again with the `branch=` filter. Nothing that passed before fails less.
- The Russian title of the files is "Заказы", the word of `orders.title`: "Заявки" is the word for requests, which `tests/notification-texts.test.ts` forbids in this flow.
- A step not finished is an empty Excel cell, not an empty text.

### 2.15 Orders: branch wall and matrix (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first** (branch wall). The reads that take ticked ids (`tickedSummary`, `newestMoves`, `submittedNumbers`) leave another branch's order out as they leave out an unknown id; they do not refuse the read. The actions refuse the whole action (03 rules 1 and 8).
2. **Look first** (branch wall). Every mixed case has an allowed counterpart, saved together: the Head over two branches where the Head acts (step 1, Cancel, Copy as new, and the owner's moves on his own orders), Finance of both branches at step 3, a Manager of both branches for the owner's moves, two own-branch orders for the Principal (03 rule 2). Where both orders are "allow" for a role, the mixed call itself is that case (review correction 2).
3. **Look first** (S7). The forged action is the page's own Approve request, rewritten by Playwright's `page.route` (one of two ticked EA ids changed to an EB order's id): the Next.js 16 action body is JSON text and stays valid (review correction 3).
4. **Look first** (S7, CLAUDE.md rule 13). A translated `not-found.tsx` under `src/app/(app)/`, the design system's full-page error built with `EmptyState`, for every `notFound()` of a signed-in page.
5. **Look first** (money and numbers). The seed's totals are data; its numbers and needed-by dates are made in its SQL; `tests/seed.db.test.ts` checks each against `orderTotal()`, `orderNumber()`/`businessYear()` and `nextBusinessDate()`, every event against `ORDER_MOVES`, and each revision copy against `writeSnapshots()` (review correction 4). Fixed client keys make a re-run in any year add nothing. The seed prints no new line; `ci.yml` is unchanged. `scripts/seed-orders.mjs` is in the Dockerfile (review correction 1).
6. **Look first** (permission matrix; found by this task). A repeat of an action of `runOrdersAction` (a known client key) answered the first result whatever ids were sent, also another branch's: now the sent ids pass the branch wall (`data.view`) and the draft wall first, or the repeat is "Not found" (`.claude/rules/server-actions.md`, last line; permission review, Should fix 2). Only seeing is asked, because the orders' status has moved since.
7. The e2e setup gains one Manager per project of EA and EB (`e2e_wall_phone`, `e2e_wall_desktop`) instead of the plan's one Manager of EB: each project's orders stay apart under the owner filter, as in the other specs.
8. Actions and queries on one record or on a filter have no mixed case; their alone matrix stays.

Choices made during the build:

- An order of the seed whose product, subtype or department is not found as listed is left out and the seed goes on: the existing test of a hand-made catalog has a "Ruchka" without subtypes.
- Seed history: one hour between moves, the last an hour before the seed moment, so the events sort by time.
- The seed's actors are not checked against the state machine at run time (permission review, Should fix 3): the seed creates its users with the roles and branches the moves need; a seed user changed by hand later is not a path the seed guards. Not fixed.

### 3.1 Stock ledger (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (money rule). `avg_cost` and `unit_cost` are `bigint` whole so'm; `nextBalance()` computes with decimal.js and rounds the average half up once per change (developer-rules rule 6; 09 Stock value: value never affects settlement).
2. **Look first** (stock rule). One table of how each type meets the average: RECEIPT, DIRECT_ENTRY (Decided ahead 12), TRANSFER_IN priced and entering the average; ISSUE, WRITE_OFF, TRANSFER_OUT out at the average; RETURN in at the average (Decided ahead 11); CORRECTION either way at the average; REVERSAL priced or at the average as its caller says. A return or correction into empty stock comes in at 0, and a later receipt blends it in at 0; 5.6 may give it a cost through the table.
3. **Look first** (stock rule). A priced removal worth more than the stock leaves the average at 0, never negative. Proposed `/spec-change` of 09 Stock value, third bullet, add: "If the result would be below 0, the average is 0."
4. **Look first** (stock rule). The reset to 0 holds for every movement that brings the stock to 0; CHECK `qty > 0 OR avg_cost = 0`. Proposed `/spec-change` of 09 Stock value: move "If stock reaches 0, the average resets to 0" to its own bullet, for any movement.
5. Every movement stores the unit cost it moved at (14-data-model `unit_cost`).
6. The sign of `qty_delta` by type is a database CHECK (09 Movement types; rule 5). Reversal guards are left to 5.7 and 3.7 (plan review, D44).
7. `postMovement()` refuses a service and a quantity the measure does not allow, and takes the product row FOR SHARE; `STOCK_USES` joins `PRODUCT_USES` (decisions 1.7 item 1).
8. Below zero: `StockShortError`, an `ActionError("conflict")` carrying branch, subtype and the available quantity.
9. The balance row is made by the first movement. Build: `postMovement()` first locks an existing row FOR UPDATE and inserts (`on conflict do nothing`) only when there is none: with the insert first, the insert itself waited on a held update and the lock could be removed unseen (the same-moment test passed without it).
10. `purchase_id` and `document_line_id` exist without a foreign key until 3.2 and 5.1.
11. `stock_movements.seq` (identity) orders movements, also those sharing one clock instant.

Choices made during the build:

- `postMovements()` posts the lines of one document in (branch, subtype) order, so two documents cannot deadlock on balance rows (the reason of decisions 2.4 item 10). Its test proves the order; a test of two opposite documents was dropped, because it passes without the sort.
- The permission review's should-fix items (branch from the locked record, `createdBy` from the wrapper, the type-to-permission map, `available` shown only for an own branch) are written as the caller's contract in the header of `src/server/stock-ledger.ts`; a check of a reversal's branch and subtype is left to 3.7 and 5.7, as the plan review decided.

### 3.2 Purchases schema and domain (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied). The Look first items come first.

1. **Look first** (branch wall). `purchases.branch_id`, not in the data model, held by composite keys to `purchase_trips (id, branch_id)` and `orders (id, branch_id)`: a record, its trip and its order are of one branch. Proposed `/spec-change` of 14-data-model.md: `purchases            trip_id, order_id, branch_id, variant_id, qty, unit_price, comment,` with `-- branch_id: the trip's and the order's branch, held by two composite keys`.
2. **Look first** (stock rule). The movement's key to its purchase is (`purchase_id`, `branch_id`, `variant_id`): a receipt or reversal moves only the subtype bought in the trip's branch. `price_history` keeps a plain key (it has no branch).
3. **Look first** (money rule). Actual quantity counts every live record of the order, whatever subtype; goods are round(qty × price) half up per record, then summed; the functions read records only, never a stored total.
4. **Look first** (progress). `progressAfterBuying`: Done at the plan or more from any state; Done short stays while 0 < received < planned; Done short left with 0 received becomes Open; Not bought stays while nothing is received and otherwise becomes Open (review correction 1); everything else Open. Finish order needs 0 < received < planned; Not bought needs nothing received.
5. **Look first** (split). Lacking = max(planned − received, 0); oldest `submitted_at` first, then the lower number by year and counter as numbers (`0999` before `10000`, review correction 2); the rest to the newest even when it lacked nothing; an order given 0 gets no record.
6. The comment rules of a record stay in code (3.3); the database checks amounts only (spec review of the plan, Should fix 2).
7. A trip, its extras and its files are append-only; only a record has the cancel fields (Decided ahead, question 3).
8. The cancel reason must not be blank; its length rule comes with the cancel action of 3.7.

Choices made during the build:

- `Exact` (the decimal.js clone of `order-totals.ts`) is exported and shared with `purchases.ts`, so planned and actual money round alike; `ORDER_PROGRESS` lives in `src/domain/purchases.ts` and the `order_progress` enum reads it (same SQL).
- `trip_files.file_id` is UNIQUE (the file contract of 0.12); its `FILE_OWNERS` entry comes with 3.3, which first inserts into the table. Until then a trip file is held by no record and only its uploader may download it.
- The tests of `price_history` name a real purchase in their PURCHASE rows (`tests/helpers/purchases.ts`), since its key exists now; no assertion changed.
- An UPDATE of `qty` cannot reach `purchases_qty_check`: the cancel-only trigger refuses it first, so the CHECK is tested on insert only.

### 3.3 Record a purchase (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (money rule, comment). A record needs its comment when its price differs from the planned price, at price 0, when the received quantity after it goes above the plan, or when its payment type is not the order's; a part record (60 of 100) and differing extra costs need none (`purchaseCommentNeeds()`). Proposed `/spec-change` of 07, Purchase record, Comment: "Required when the price differs from the plan, when the received quantity goes above the plan, on a substitution, on price 0, or when the payment type changed."
2. **Look first** (money rule, gift). A record at price 0 writes no PURCHASE price row and keeps `last_purchase_price` (both CHECK > 0); its receipt enters stock at cost 0 (09 Stock value, first bullet). Proposed `/spec-change` of 07, What saving a record does, step 3: "The subtype's last purchase price is updated, except for a record at price 0 (a gift)."
3. **Look first** (progress). A record only while the order is Open and its progress OPEN; Done, Done short and Not bought are refused `wrong_status` until 3.5's reopen.
4. **Look first** (money rule, cash). `receipt_required_for_cash` applies to a trip whose payment type used is Cash; a cash extra cost on a Transfer trip does not make it one.
5. "Same as planned": the plan while nothing is received; then the quantity still lacking, the planned price and no extras; with nothing lacking, the planned quantity.
6. The subtype bought is the ordered one; substitution is 3.6.
7. Dates are business dates: not after today, not before the Tashkent date of `approved_at`; an Open order without `approved_at` is refused.
8. The last purchase price is the record saved last, `last_purchase_at` its saving time.
9. The supplier is optional, defaults to the order's company while it is active; an inactive company or extra-cost type is refused. Any company kind may be the supplier (04: one list serves both).
10. No audit row: the record has its history event, the price its `price_history` row. The owner confirms on issue #9.
11. No notification for a record.
12. The trip takes the action's client key.
13. One order per action in 3.3; 3.4 applies `describeTickedWall()`.
14. Anyone who may not record the order gets Not found at `/orders/[id]/purchase`.
15. Received/Used and the actual total on the order page from status Open on, computed from the records.

Choices made during the build:

- `ORDER_EVENT_TYPES = [...ORDER_ACTIONS, "RECORD_PURCHASE"]` feeds both enums and the wrapper's `type`; `ORDER_MOVES` and `allowedActions()` are unchanged.
- The field checks that need the database run first in the action's `write()` and throw `invalid_input`; the wrapper is not widened. Two field kinds: `inFuture`, `beforeApproval`.
- `orderRecords()` lives outside `queries/` (it authorizes nothing; its callers have).
- The page action does not revalidate: after a record that finishes the buying, a re-render of the form is Not found and cancelled the client's `router.push`.
- Icons reused (`add_photo_alternate`, `description`, `done_all`); no new icon.
- Permission review: the form's query filters status and progress in its SQL (draft wall); more cases for the button and the receipt download.

### 3.4 One trip, many orders (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (money rule, shared date). The trip's one date is not in the future and not before the approval date of any of its orders: the newest approval wins (07 Purchase record, Date bought; One trip 1).
2. **Look first** (branch wall, one owner). A trip of orders of two branches or two owners is refused whole for everyone, the Head included (`invalid_input`, `orders: errors.field.tripOneOwner`), checked first in `write()`, so a per-order refusal of the wrapper is named before it. The Head picks one owner on the form (07 One trip).
3. **Look first** (split). A group row's one quantity is split by `splitGroupQuantity()`; each order's quantity can be changed before saving; the server checks each line on its own; an order left at 0 is not sent and gets no record (07 One trip 2; 3.2 item 5).
4. **Look first** (money, last purchase price). Records are written in `inSplitOrder()` (oldest submit, then the lower number), whatever order the browser sent; a subtype's last purchase price is its last record above price 0 in that order; `product_variants` are updated in variant-id order and stock through one `postMovements()`, so two trips cannot deadlock. Each record above price 0 writes its own PURCHASE price row.
5. **Look first** (money, comment). Each line's comment need is `purchaseCommentNeeds()` against its own order's plan, received quantity and planned payment type.
6. Ticked orders of one subtype are one group row (2.8's key: branch, subtype, status); the form makes a block of them.
7. A trip may hold orders of different subtypes (07: "ticks Open orders").
8. The subtype bought stays the ordered one until 3.6; "Give straight to requester" is 5.4.
9. The Head with orders of several owners picks one in a select; the default is the owner with the most ticked orders, then by name.
10. A Manager's form holds only own orders and a count of the left-out ones; no other owner's order is named.
11. "Record purchase" is offered when every ticked order is Open with buying open, all of one branch, and the user may record at least one of them.
12. One `order_actions` row, one event per order (the wrapper).
13. A fee that turns up at the shop is an extra cost on one order's line; nothing is split.
14. `describeTickedWall` gains `oneBranch`: where the matrix lets both orders through, the trip is refused whole; the allowed counterpart puts both in one branch.
15. The ids travel in the address (`/orders/purchase?ids=`); 200 ids are about 7.4 kB.
16. After saving, the trip form returns to `/orders`; the one-order page to the order page.

Choices made during the build:

- `getPurchaseForm` keeps 3.3's answer for what the user sees but may not record (only a colleague's orders, or RECORD_PURCHASES off): `forbidden`, as the permission matrix expects; the pages show Not found for it and for `null` alike. The plan's test line "only a colleague's orders: null" was built as this refusal.
- "Same as planned" is on every order line (review correction 1); each line has its own button, the group has none.
- The trip's payment type defaults to the first order's in the split's order, the supplier to the company every order shares while active, else none.
- The 3.3 tests were moved to the new input shape (the order's own fields into `lines[0]`, field paths `lines.0.<field>`); no assertion changed.

### 3.5 Purchases tab, order progress and the actual columns of the download (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first** (progress; a merged decision and its tests changed). Finish order on an Open order with something received gives Done short below the plan and Done at or above it; nothing received is refused (Not bought is the way). This changes decisions 3.2 item 4; `finishRefusal()` is replaced by `finishedProgress()` and its two `NOT_SHORT` assertions are now Done. Reason: a reopened Done order with no further record could otherwise never be finished. Proposed `/spec-change` of 07 Order progress: row Done "Received the planned quantity or more. Automatic; after a reopen with no further record, \"Finish order\" sets it."; row Open "Received less than planned and not finished by hand, or reopened."
2. **Look first** (permission matrix). The three buying actions need `purchase.record`: the Head, the owner with `RECORD_PURCHASES` on (03 "Record purchases"; "the Head finishes it").
3. **Look first** (progress). Reopen buying works on Done, Done short and Not bought while the status is Open, not after Send to settlement; no reason. Proposed `/spec-change` of 06 Rules 3: "Send back, reject, cancel and the Head's reopen of a Closed order need a reason of at least 5 characters. Reopening an order's buying (section 7) needs none."
4. **Look first** (money rule, actual price). The download's actual price is round half up(actual goods ÷ actual quantity), divided exactly with `Exact`; empty with nothing received. Proposed `/spec-change` of 08 Numbers the system calculates, a new row: "Actual price | Actual goods ÷ actual quantity, rounded half up; shown only where one price per order is needed (the download)".
5. **Look first** (database). `orders_finish_reason_check` (a trimmed reason of 5 to 500 exactly with Done short or Not bought) and `orders_progress_status_check` (a finished progress only from Open on).
6. **Look first** (money, download). "From Open onward" is Open, Waiting for settlement and Closed; before, the five cells are empty; an Open order with nothing received shows 0, no price, 0, 0 and the planned total as difference. The difference is planned − actual, a signed number cell bounded at ±`MONEY_MAX` (`signedMoneyCellValue()`).
7. One reason for every ticked order, 5 to 500 (`isMoveReason`), stored trimmed in `finish_reason` and the event.
8. Refusals: `wrong_status` for the progress or status, `not_ready` for the received rule, every order named in one answer.
9. No notification for the three actions.
10. The totals under the download's rows stay those of 2.14 item 6.
11. The Purchases tab exists from status Open on.
12. Event names `FINISH_ORDER`, `MARK_NOT_BOUGHT`, `REOPEN_BUYING`, payload `progress: {from, to}`.
13. The buttons reuse `MoveButton`; `ORDER_MOVES` is unchanged (progress is not a status).
14. The progress label is on the order page only, not in the list rows.
15. **Look first** (the wrapper). An optional `inspect()` step of the orders wrapper, inside the transaction after the lock and `check()`.
16. Icons from the set built: `shopping_cart` (buying open), `done_all` (Done), `check_circle` (Done short), `block` (Not bought), `warning` (over plan), `cancel` (a cancelled record); info and muted tones only for the progress.

Choices made during the build:

- **Look first** (PDF layout). The PDF prints the measure beside each quantity instead of in its own column, in 6.5 pt, and lets the word "so'm" go to a second line in a narrow money cell while the digits stay on one line, so the five new columns fit A4 landscape. The Excel file keeps every column.
- **Look first** (a defect found, not fixed here). A PDF made after a Russian-language PDF in the same server process loses letters (seen on `main`: "Orders" printed as "rdrs"). The S2 download test is its own file (`route-actual.db.test.ts`); the cause, inside @react-pdf/renderer 4.9.0, is not found yet. Proposed fix task after 3.5.
- `ProgressLabel` lives beside the status labels in `src/components/status-label.tsx` (the one status-label component), not in a purchasing file as the plan said.
- `insertOrder()` of `tests/helpers/orders.ts` takes `progress` and `finishReason`; `describeTickedWall()` takes `prepare` to set a ticked order's scene before anything is read.


### 2.7b Confirm before Submit in the drafts grid; the S19 test (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied). The Look first items come first.

1. **Look first** (a test changed because the scenario reads otherwise; D48). The S19 approve test makes three orders of quantity 10, given explicitly (correction 1), and asserts quantity and count on every row it reads (correction 2): 20/2 for the Head, 20/2 for the Principal, 30/3 after the last approval; events and numbers are 3, not 30. The old test made thirty orders. Seen to fail when the row counts orders instead of summing quantities.
2. **Look first** (existing e2e tests changed; `11` rule 6). The three grid Submit steps of `drafts.spec.ts` and the Submit again step of `send-back.spec.ts` confirm in the dialog; each asserts what it asserted, and Submit again gains a Cancel step.
3. New pluralized keys `orders.submit.confirmTitle`, `confirmResult`, `confirm`; Submit again reuses `orders.moves.title/result/button.SUBMIT_AGAIN`, so one move says one thing everywhere; the page's singular `orders.page.bar.submitTitle` stays for the page.
4. The ids and the move are kept when the dialog opens and exactly those are sent: the count shown is the count sent.
5. Pending saves are still awaited inside `submit()` after Confirm; the client-key rules of 2.7 item 13 are unchanged.
6. The dialog closes on any answer and in `finally`; on a refusal the marks, the list on top and the focus on the first failing cell are those of 2.7 (seen in the browser: the focus lands on the failing cell).

Choices made during the build: the Playwright confirmation test uses two products of its own (`ruler`, `eraser`), because the 2.7 tests read every order of their products.

### 2.11b The two findings of 2.11's last review (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied). The Look first item comes first.

1. **Look first** (approval order; decisions 2.11 item 8). `createdByHeadSql` is fixed in place (`c.role = 'HEAD' and number is null`) and stays a second text beside `lockOrders()`, which is raw SQL over the aliases `o` and `c` with `for update of o`, where the Drizzle column does not resolve. `order-facts.db.test.ts` reads both on the same orders and holds them together; the file's head comment names it.
2. The test reads the fact through the fragment, selected with Drizzle over `orders` as the order page and the list select it, beside `lockOrders()`: neither query returns `createdByHead`, and no button differs (review of #61, finding 2).
3. The migration test has its own file, its own fresh database and two journal cuts (up to 0021, then up to 0022), so 0023 to 0026 never run over its hand-made rows. It writes two old rows of one order (revisions 1 and 2) and also checks that 0022 left no default (23502).

### 3.6 Substitution (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (stock and money). The subtype bought takes the stock receipt, the last purchase price and the PURCHASE price row; the ordered subtype's prices stay (07 What saving 2 and 3; Substitution).
2. **Look first** (comment). A substitution needs its comment: `purchaseCommentNeeds()` returns `SUBSTITUTED`; the price is still compared with the order's planned price (07 Comment).
3. **Look first** (read by 4.4). An order is Substituted when a record that is not cancelled bought another subtype (`isSubstituted()`); cancelled records do not count (08).
4. **Look first** (which subtypes). The ordered subtype, or another active subtype of the same active product; the ordered one stays allowed after a deactivation of it or its product (04 rule 2).
5. **Look first** (where checked). In the action, under a `FOR UPDATE` lock of every subtype bought in id order; no database trigger (not in "Constraints the spec names"; D44).
6. The select lists the ordered subtype first, then the others by name (review correction 1); a product with only its hidden default shows none.
7. A group block has one select that sets each of its lines; each line keeps its own.
8. "Substituted" shows on the order page header from Open on and on the record in the Purchases tab; not in list rows; the download keeps the ordered subtype.
9. Own refusal text `errors.field.otherProduct` (07 Substitution, last sentence).
10. The event payload `purchase` gains `variantId`; the history line is unchanged.
11. No notification for a substitution.
12. Icon `swap_horiz` through `npm run icons`; no new dependency.
13. A "From 3.6" line on 4.4 in the build plan.

Choices made during the build:

- The subtype tests are their own file, `substitution.db.test.ts`, not `record-purchase.db.test.ts` as the plan said.
- The same-moment test holds black's row in a third transaction while both trips wait on it; with a share lock instead of `FOR UPDATE` it fails with a deadlock (checked).

### 3.7 Cancel a purchase record or a trip (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (stock). A cancel is a priced `REVERSAL` at the record's own price on its branch and subtype bought, `reverses_movement_id` its RECEIPT; the average is `nextBalance()`'s priced-out formula, floored at 0 and 0 at stock 0 (09 Stock value 3; decisions 3.1 items 3 and 4). A goods record without its receipt is `unexpected`.
2. **Look first** (stock). Blocked means the whole action is refused, a trip included: every order whose record's subtype would go below 0 is named `not_ready` with `errors.field.stockShort`, whose text names both ways out; the check is `postMovement()`'s own (07 Fixing a mistake 2; D44).
3. **Look first** (progress). After a cancel the progress is `progressAfterBuying()` of the remaining records; the finish reason is kept only at Done short or Not bought (`finishReasonAfter()`, review correction 1).
4. **Look first** (status). "While the order is Open" is status `PURCHASING`, whatever its progress (`purchaseCancelAllows()`).
5. **Look first** (permission). Both actions need `purchase.cancel`: the Head in any branch, the owner with `CANCEL_PURCHASES` on.
6. **Look first** (money). A cancel sets the subtype's last purchase price back to its newest PURCHASE `price_history` row (by `seq`) whose record is not cancelled, or to empty, when the price in force was the cancelled record's; a price set otherwise stays (00-definitions, Last purchase price). Proposed `/spec-change` of 07, Fixing a mistake, first bullet, appended: "The subtype's last purchase price goes back to its newest purchase that is not cancelled, or to empty."
7. Cancel trip cancels every record of the trip not cancelled yet; it is offered when the trip has two or more, of orders all Open and all the user's to cancel; a trip with none left is `wrong_status`; an order of the trip no longer Open refuses the whole trip (review correction 2).
8. One event type `CANCEL_PURCHASE` for both actions.
9. `PURCHASE_CANCELLED` once per action and branch to every active Head but the actor, with the count of records.
10. The cancelled count shows on the order page only; settlement's is 4.5.
11. No audit row.
12. New field kind `stockShort`; icon `cancel` reused.
13. Secondary buttons on the record; the dialog's confirm is the danger kind.
14. Texts with counts use ICU plurals.
15. A trip holds one record per order (3.4).

Choices made during the build:

- The last-price rule compares with the price in force before the action: the newest row of a record live until now. The first build compared with the newest row of any record and left a price of an earlier cancelled record in place (its test caught it).
- `lockRecords()` reads and locks only records on the sent orders behind no wall; for a trip, the trip's live records on other orders are counted without a lock, and any makes the trip `invalid_input` (permission review, Should fix 1 and 2). Another branch's record or trip is `not_found`, tested for both actions (Must fix 1; a check line in `.claude/rules/tests.md`).
- Cancel trip has no ticked-wall test (`describeTickedWall`): a trip cannot hold orders of two branches (`purchases_trip_branch_fk`), and the cross-branch case is its own test.

### 3.8 The three colours (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (progress). "While an order's buying is still Open" is `progress = 'OPEN'`: Number and Total are grey then, coloured at Done, Done short and Not bought. A reopened Done order above its plan is grey again until finished (08 The three colours, bullet 1; 07 Order progress).
2. **Look first** (money label). A set's Number and Price carry the count of orders with the worst colour ("More 2 orders"), on every group row and ticked set; Total carries the summed difference. Proposed `/spec-change` of 08 The three colours, third bullet, appended: "On a group row or ticked orders, Number and Price carry the count of orders with that colour; Total carries the summed difference."
3. **Look first** (money formula). Price amount = round(planned price × actual quantity) − actual goods; green (every live record at the planned price) shows 0; orange can show 0 when prices cancel out. This replaces the 0.10a build choice "Price follows Total's sign rule … above 0 is Cheaper": the component now accepts Price orange at 0. Proposed `/spec-change` of 08, Price row: "Price amount = round(planned price × actual quantity) − actual goods; green shows 0; orange can show 0 when prices cancel out."
4. **Look first** (money label in a set). Number and Price of a set take the worst colour among the orders that have one, grey only when none has; Total of a set is grey while any order's progress is Open.
5. **Look first** (money label). Colours exist from Open on (`BUYING_STATUSES`); orders before Open are left out of a set and its summed difference; a set with none has no labels. Not bought: Number orange (planned quantity), Price grey, Total orange (planned total).
6. Orange is drawn amber (0.10a decision 7; 11 rule 11).
7. The labels sit under the total on a group row, under the price on an order row, at the top of the action bar's totals and under the totals on the order page.

Choices made during the build:

- `liveRecords()` of `src/domain/purchases.ts` is exported (was the private `live()`), so "not cancelled" stays written once.
- The list reads its members' records with `recordsOfOrders()` (one parameter per id, as `extrasOf()` already does for the same ids) instead of a `recordsOfListed()` subquery: a page holds at most 25 groups, and the same ids already go to the extras.
- The wire form of the colours (`WireColours`, money as decimal text) is shared by the list and the order page (`wireColours()` in `src/features/orders/list-wire.ts`).

### 3.9 Buying on a phone (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 4 applied). None is of a Look first kind.

1. At phone width the visit (date, payment type, supplier, receipt) comes on the last step, under that step's block and right above Save: the receipt is taken at the till, and the shared fields belong to no one order's step (11 smooth feel 3; 07 One trip 1).
2. A group row is one step with its orders' lines under it, so the split can be changed before saving (07 One trip 2).
3. Phone width is below 640 px (`sm`), the breakpoint of the app's other phone layouts.
4. Save is only on the last step at phone width; Next checks nothing. The server is the one check; a refused save opens the first step with an error (`firstStepWithError()`), and the trip-wide alert sits outside the steps.
5. "The camera opens directly" is the `capture="environment"` image input that "Take photo" opens on the tap; a browser opens a file input only from a user gesture.
6. A group-row step has no "Same as planned" of its own; each order line under it keeps its own.

Choices made during the build:

- The Head's owner select moved above the form at every width (review correction 1), so the DOM order is the order on screen; on a computer it is no longer inside "The visit".
- Hidden steps are hidden by CSS (`max-sm:hidden`) only: every line stays registered and sent, and no width is read in JavaScript, so the server render matches.
- A step move scrolls the form into view and focuses the step's first heading (`tabIndex={-1}`); choosing another owner returns to step 1 without moving the focus off the select.
- Next has no icon: the icon set has no forward arrow and the button's icon comes before its words.

### 3.10 Price prompt for the Head (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied: `PRICE_PROMPT_PERCENT` beside the other numbers in `src/domain/prices.ts`; gifts left out in the SQL and in `pricePrompt()`; the prompt and the click read `product_variants.reference_price`).

1. **Look first.** The average is the plain mean of the records' unit prices, not weighted by quantity (Decided ahead 2: "the average unit price of those records").
2. **Look first.** "More than 20%" is compared exactly on the unrounded mean by `priceHintPercent(sum, n × reference, 20)`; the average shown and set is rounded half up to whole so'm, the percent half away from zero, as the price hint.
3. **Look first.** 20% is a fixed constant, not the setting `price_hint_percent`: 04 rule 4 and 10 say "more than 20%" with no setting. Proposed `/spec-change` if they should be tied: "04 rule 4: … by more than the price-hint percent (a setting, 20% by default)".
4. **Look first.** A gift (0 so'm) is not a recent purchase: it is no real purchase price (04 rule 4).
5. **Look first.** Per subtype and branch, against the one school-wide reference price (Decided ahead 2; A14); two branches can prompt for one subtype with two averages.
6. "Within the last 90 days": trip date (Tashkent) on or after today − 89 days (`recentPurchaseSince()`); the last 3 by trip date, then `created_at`, then id.
7. Records count for the subtype really bought (07 Substitution).
8. **Look first.** PRICE_DIFFERS is sent when a purchase action (a trip, a cancel of a record or a trip) makes a prompt appear, once per action, its count the subtypes newly prompting; nothing on a standing prompt, a new reference price or the window passing. Proposed `/spec-change` wording for 10 Notifications: "Recent purchases differ from the reference price by more than 20% | Head, once when a purchase or a cancel makes it so".
9. The actor is never told (notify()): a Head who records the trip sees the prompt on `/prices` only.
10. The prompts live on `/prices`; the notification links there.
11. The click is `addPrice` with the average and a note from the message files (`prices.prompt.note`, in the Head's language); no server re-check of the amount, since `price.add` may set any price.
12. Inactive subtypes and products give no prompt (04 rule 2).
13. One client key per prompt row until it is saved (`useAction` with `create`).
14. No paging; the largest difference first, then product, subtype and branch code.

Choices made during the build:

- The shared SQL `recentPurchasePrices()` and `promptsOf()` live in `src/features/purchasing/price-prompts.ts` beside the notice; the query file exports only `getPricePrompts()`, which authorizes (every export of a `queries/` file is in the permission registry).
- The notice finds the action's records through its history events (`order_events.payload.purchase.id`) and reads "before" in the same transaction: the trip's records left out, or the cancelled ones counted as live. Both actions hold the subtypes FOR UPDATE since their write step, which serialises two actions on one subtype.
- The English text says "current price" (the word of the Prices page), not "reference price".

### 4.1 Money schema and domain (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied: `overspend()` reads the two settings as stored and tests in bigint; `isExactMatch()` receives the count from `orderCashCount()`; the crossing tests at count + 1 and at the count).

1. **Look first.** Exact match, "the payment type is the planned one": every live record's trip and every extra of it carry the order's planned payment type; extra costs compare as sums; Number and Price green are `orderColours()`; not substituted is `isSubstituted()`.
2. **Look first.** Cash spent: a record's goods count when its trip is Cash, each extra by its own payment type; goods are `actualGoods()`, extras `extrasSum()`.
3. **Look first.** One row per order in an action: `UNIQUE (money_action_id, order_id)` (08: "split into rows, one per order").
4. **Look first.** The database refuses a money row whose order's owner is not the action's Manager (`money_rows_one_manager`, on insert only).
5. **Look first.** Overspend guard: the Head is needed when over × 100 > percent × planned and over > amount, both strict, in whole numbers; "off" never. The percent shown has one decimal, half up; `null` when the planned total is 0.
6. **Look first.** No crossing: Cash returned ≤ count, Paid back ≤ −count, against the count before the action; the other kinds have no limit.
7. **Look first.** Manager's cash balance: both sums over orders that are not Closed; owed is a positive amount.
8. Settlement net: Paid back − Cash returned, as a direction and a positive amount.
9. **Look first** (spec contradiction). `money_actions.comment` is nullable for the approval's cash action only; 4.3 and 4.5 require the comment (08 Money ledger: "and a comment"). Proposed `/spec-change` for 08 Money ledger: "one date, an optional document number, an optional file and a comment (empty on the cash action saved with the approval)".
10. "One kind per action" is checked by the actions of 4.3 and 4.5.
11. Prefilled cash rows: one per order with planned cash above 0, one block per owner, in the given order; dropping rows of 0 is 4.2's.
12. `money_rows_one_manager` reads the owner on the row's insert only; the writers lock the orders first, and the owner move (4.10) needs a balance of 0.

Choices made during the build:

- `money_rows_one_manager` leaves an unknown action or order to its foreign key, so the key's own error is the one given.
- The input type `CashRecord` sits in `src/domain/money-ledger.ts`; `PurchaseRecord` of `purchases.ts` is unchanged.
- No `FILE_OWNERS` entry for `money_actions.file_id` yet: no action writes that column before 4.3, the first that attaches a file (plan, Left out; permission review Must fix 1, answered in the report).

### 4.2 Finance approval with cash (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied: the dialog's rows come from `plannedCashOf()` under the selects, so a row set to 0 stays; the cash also asks `money.record`; the earlier `order_actions` insert is checked against every `write`/`inspect` and tested for a refusal and a retry).

A. **Look first** (spec text to make plain). The table has rows only for orders whose planned cash is above 0 (Cash orders under the current selects). Proposed `/spec-change` for 08 When Finance approves: "one row per order whose planned cash is above 0 (its planned total when its payment type is Cash, else 0), prefilled with it".
1. **Look first.** An order not in `cash` gets no cash; the server never prefills by itself.
2. **Look first.** No server check of the payment type and no upper limit on cash given (08 Money ledger 3).
3. **Look first.** `occurred_on` is the approval's day in Tashkent from the clock; no comment, document number, file or supplier.
4. **Look first** (spec text to make plain). An owner given cash gets one `CASH_GIVEN` ("approved N orders in CHL and gave you 650 000 so'm in cash") instead of `REQUEST_FINANCE_APPROVED`; the amount is that owner's cash in that branch. Proposed `/spec-change` for 10 Notifications, row "Cash given, cash returned, paid back | Owner": add "; at Finance's approval it replaces the owner's 'Finance approved' notice".
5. **Look first** (branch wall). One Manager's cash in two branches in one call is refused whole (`invalid_input`, `cash: errors.field.cashOneBranch`).
6. **Look first** (domain). `approvalCashRows({ id, ownerId, amount })` drops rows of 0 and empty blocks; `plannedCashOf()` is the prefill; `actionTotal()` the sum of an action's rows.
7. **Look first** (domain). `totalsByPaymentType()` in `order-totals.ts`; `ordersTotals()` uses it.
8. The orders wrapper writes `order_actions` before `write` and passes `actionId`. Checked: no `write` or `inspect` reads `order_actions` (Approve, Send back, Reject, Cancel, Take back, Submit, Submit again, the purchasing actions); `noticePriceDiffers()` reads `order_events` in the notify step, after the events.
9. No cash amount in the approval's history event; the money rows are the record (4.3 shows them).
10. Lock order: orders by the wrapper, then the money rows by Manager and order.

Choices made during the build:

- The `CASH_GIVEN` amount is a money param shown through `MONEY_PARAMS` and `format.money` on `/notifications` (0.11 decision 9). No `branch_id` on notifications (0.11 decision 4): the amount is the recipient's own cash, so a reader who later loses the branch learns nothing about anyone else. **Look first** (branch wall).
- The dialog's interactions (a row set to 0 stays, a wrong amount disables Approve, the result line follows the rows) are tested in Playwright at both widths, not in a Vitest component test as the plan said: the unit project has no DOM.
- `money.record` and `request.approve.step3` are the same row of the matrix today, so the `money.record` check is reached alone only if they ever differ (permission review, Should fix 2); both matrix entries assert that a refused call writes no cash action (Should fix 1).

### 4.3 Money tab and money actions (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 4 applied: one domain function each decides when money is recorded and when an action is cancelled; the edge case "The Manager bought before cash was given" has its own test; no refusal of a later date; the items numbered in order).

1. **Look first** (status move). Money is recorded on orders Open or Waiting for settlement (`moneyRecordAllows()`); any other status is `wrong_status` (a Draft is "Not found" behind the draft wall).
2. **Look first** (money). Prefill (`moneyPrefill()`): Cash given = `plannedCash()` whatever was given before (edge case "Finance gives cash for several orders"; D43); Cash returned = the count above 0; Paid back = the count without the minus below 0; Bank transfer and the card kinds are empty.
3. **Look first** (money). No crossing for every Money tab action, against the count before the action under the orders' lock; no payment-type check and no limit on Cash given and the information kinds.
4. **Look first** (branch wall). One Manager's orders in two branches in one call are refused whole (`errors.field.moneyOneBranch`).
5. **Look first** (branch wall). A file only when the call saves one action (one Manager); otherwise `errors.field.fileOneManager`.
6. **Look first** (branch wall). `MONEY_FILES`: `data.view` on the one branch of the action's orders; were the rows ever in two branches, the file stays held and only the Head may have it (permission review, Should fix 1; the plan said "only the uploader", which would have left the file free for another record).
7. The owner's notice for the three cash kinds only, one per Manager and branch; `CASH_GIVEN` gains `via` (`approval`, `money`), a stored one without it reads as `approval`; nothing for the information kinds or a cancel.
8. The date: Finance's choice, today in Tashkent by default, no limit (review correction 3); the comment 1 to 1000; the document number up to 100; no supplier.
9. The cancel's reason is 5 to 500, as every move's.
10. The cancel sends exactly the action's orders with their versions (`invalid_input` otherwise); an own order with another branch's action id is "Not found".
11. The Money tab is seen by every role that sees the order, from Open on; Record money and Cancel only for Finance of the branch.
12. Each order's history event names the money action, its kind and the order's amount (`payload.money`); a cancel's names the action, with the reason as its comment.
13. A cancelled action keeps its file; an action entered again takes a new upload.

Choices made during the build:

- The crossing check runs in the write step, after every other check has passed, and throws `OrdersRefusal("not_ready")` with `fields.amount`: a refusal there hides no other order's failure, and rolls back the `order_actions` row.
- `Failures` of `src/server/order-action.ts` keeps the `fields` a check or inspect step gives with a code (the cancel's Closed order names "the Head reopens it first"); before, the wrapper dropped them. The whole suite passes with it, so no earlier answer changed.
- Record money sits on the order page's action bar (as the plan says), not in the Money tab; the tab carries Cancel per action.
- `moneyRowsOf()` is one reader of money rows for the action and the dialog; the Money tab reads its rows with their action's fields in its own query and counts them through the same `orderCashCount()`.

### 4.4 Close on an exact match (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied).

1. **Look first** (a status move's reach and a task's scope). 4.4 builds the Manager's Send to settlement (action, buttons, the notice to the branch's Finance users); 4.5 keeps the Finance screen and Send back for correction. A "From 4.4" line under 4.5 in the build plan says so.
2. **Look first** (the state machine). Close needs exact match and an owner who closes alone for the Head too: the order of a Manager whose `CLOSE_ALONE` is off goes to settlement even when the Head ticks it (decisions 2.3 item 6; 08 Closing 1). No change to `src/domain/`.
3. **Look first** (the wrapper). Exact match is read in a new `facts` step of the orders wrapper, under the lock and before the status check, so the state machine decides the move with the real fact; only on orders behind no wall.
4. The "summary of their differences" (07 Finishing) is the bar's three labels and totals of the ticked orders plus the count of exact matches.
5. Close writes `orders.closed_at` from the injected clock; 4.8 decides whether a reopen clears it.
6. Close's notice: the owners, every active Head and the branch's active Finance users, never the actor (10 Notifications, "Closed, reopened").
7. Neither move takes a reason (06 Allowed moves names none).
8. A Done short or Not bought order closes only on an exact match, as `isExactMatch()` reads it; otherwise it goes to settlement.

Choices made during the build:

- The permission-matrix test of Close counts `not_ready` as passing the permission: the generator's "HEAD still allowed" case ticks the order of the Manager whose `CLOSE_ALONE` is off, which the machine sends to settlement (item 2); `close-exact.db.test.ts` proves that refusal.
- Send to settlement's notice goes to the Finance users only, no Head (10 Notifications, "Sent to settlement").

### 4.5 Settlement screen (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied: a row of another kind is refused by a test; Send back for correction has its role, branch and version refusals tested; the net is `settlementNet()` over the typed rows).

1. **Look first** (money). The settlement action holds only Cash returned and Paid back rows, on orders Waiting for settlement; other kinds in settlement go through Record money (4.3).
2. **Look first** (money). Each row is checked with `crossingRefusal()` against the count before the action under the lock, so a Receive on an owed order or a Pay on a holding one is refused too.
3. **Look first** (money). The settlement action needs a comment; date, document number and file as 4.3.
4. **Look first** (branch wall). The screen and the action take one branch: `UNIQUE (client_key, manager_id)` allows one action per Manager per browser id. The action refuses rows of two branches whole, also across Managers (permission review, Should fix 1).
5. **Look first** (a block's figures; spec text to make plain). A block exists for a payment type used by a live record, extra or money row of its kinds; a type only planned has none. Transfer and card "planned" are the planned total when the order's planned type is that type, else 0; "received" and "charged" are `paidBy()`; the card's difference shows Left or Over. Proposed `/spec-change` for 08 Closing 2: "a block for each payment type used in a purchase, an extra cost or a money row".
6. **Look first** (approval order). Send back for correction clears the transfer and card confirmations, the transfer note and the overspend acknowledgment, and the order's event carries `settlementCleared: true` (permission review, Should fix 2). Proposed `/spec-change` for 08 Closing 4: "…with a reason; its settlement confirmations and the overspend acknowledgment are cleared".
7. **Look first** (notification). Send back for correction tells owners and Heads with its own type and text.
8. **Look first** (notification). The settlement action sends each owner one `CASH_SETTLED` with the net.
9. **Look first** (money). A confirmation is read through `blockConfirmed()` from today's figures: a transfer ticked while it matched counts as not confirmed once it differs without a note. Accepted limit: a stored note still counts after a later row changes the difference.
10. "Confirmed" can be unticked while the order is Waiting for settlement; the history keeps both.
11. A transfer note may be given when the amounts are equal too.
12. "No receipt" shows on an order with a live record whose trip has no file; a label only.
13. The cancelled records link to `/orders/[id]?tab=purchases#purchase-<id>`; the Purchases tab gained the anchors.
14. Card money returned reuses Record money with the kind preset.
15. The screen's address is `/orders/settle`.

Choices made during the build:

- `getSettlement()` reads behind `data.view` first and then asks `request.settle` per order, as `getPurchaseForm()` does, so another branch's order is "not found" for every role and a role that sees but may not settle is "forbidden" (the matrix's expected answers).
- One upsert statement writes the confirmations of every ticked order.
- One Save writes the cash rows of every Manager of the screen (08 Money ledger 1: "saves one action per Manager, all in one transaction"); the date, document number, comment and file sit once under the Manager blocks.
- The confirmation boxes show what the server holds and change after its answer.
- `tests/e2e/catalog.spec.ts` looks for the page's own Activate button: its dialog's button of the same name failed the plan commit's CI once while closing.
- `settlement.spec.ts` reads English, as `order-page.spec.ts` sets the users they share (the CI run of the screen's commit showed English to a test that expected Uzbek).

### 4.6 Finance closes (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied: `readyToClose()` reads the actual total through `actualTotal()` over the records mapped by `asPurchaseRecord()`; the readiness test uses S12's numbers with the amount setting at 50 000 and the default 100 000).

1. **Look first** (money). The overspend acknowledgment is part of readiness now (08 Closing 3, "any required Head acknowledgment"): `overspend().needsHead` with the guard settings read under the lock, and `order_settlements.overspend_ack_at` not null as the acknowledgment. The Head's button and its notices are 4.7; until then an order above the guard cannot close.
2. **Look first** (money). One pure `readyToClose()` in `src/domain/money-ledger.ts`: cash count 0; a Bank transfer or Corporate card block, when `settlementBlocks()` returns it, `blockConfirmed()`; an unused type needs nothing.
3. Close is offered to Finance on every order Waiting for settlement in their branches; readiness is the server's, and a refusal names each order that is not ready with one line, not one line per cause.
4. On the settlement screen Close acts on every order the screen shows; fewer are closed by ticking fewer on the list.
5. `closed_at` and the `REQUEST_CLOSED` notice as `closeExactOrders`: owners, active Heads and the branch's active Finance, one per branch, never the actor.
6. Finance's Close dialog carries no warehouse sentence; that sentence is the Manager's (08 Closing 1).
7. A "From 4.6" line under 4.7 in `docs/build-plan.md`, so 4.7 builds no second check.

Choices made during the build:

- `LockedOrder.readyToClose` is optional beside `exactMatch`, and `orderState()` reads it as false when no step read it.
- `settlementFactsOf()` also returns each order's records, so readiness and the screen read one place.
- The database test of S12's readiness writes `overspend_ack_*` straight into `order_settlements` (the button is 4.7) and sets the guard amount with an upsert of the `settings` row, restored afterwards.

### 4.7 Overspend guard (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 to 3 applied: the above-the-guard notice is tested with an order under the guard beside one above it and with two branches; the matrix covers a Manager holding every right; a test proves that Send back for correction makes the Head needed again).

1. **Look first** (approval order, money). The Head is told "Overspend above the guard" at Send to settlement, for the sent orders above the guard under the settings of that moment, one notice per branch to every active Head, never the actor; the link is the action's list, which also holds the sent orders under the guard.
2. **Look first** (approval order). "Acknowledge overspend" is allowed only Waiting for settlement (`settlementAllows()`), on orders above the guard now and not yet acknowledged, all or nothing. It moves no status, like Confirm of 4.5.
3. **Look first** (money). One rule, `overspendNeedsAck()` in `money-ledger.ts`, read by the button, the notice, the settlement line and `readyToClose()`.
4. The comment is the action's reason, 5 to 500 characters (06 rule 3), also stored in `overspend_ack_comment`.
5. **Look first** (money, approval order). A change of the guard settings sends no notice; an order that a lowered setting puts above the guard blocks Close and no Head is told (Finance's line names it). Proposed `/spec-change` for `10-notifications-analytics-reports.md`, Notifications, row "Overspend above the guard": "Overspend above the guard, at send to settlement or when a change of the guard settings puts a waiting order above it | Head".
6. "Overspend acknowledged" goes to the active Finance users of each order's branch, one notice per branch.
7. Finance's settlement screen shows the overspend line (amount, percent, and the Head's name once acknowledged); the Head's home list is Phase 6.

Choices made during the build:

- `orderOverspend()` beside `overspendNeedsAck()`: the settlement line needs the amount and percent of an acknowledged order too.
- The settlement line shows "—" for the percent when the planned total is 0 (`overspend()` gives no percent then).
- The browser test signs in the shared `e2e_head` without changing his language and finds the confirm button by its label in all three languages.

### 4.8 Reopen (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied: the Done-when test asserts that the plan is unchanged after the reopen and after the cancel; the reopen of an order with no settlement row asserts that no row is made).

1. **Look first** (approval order). Reopen clears `orders.closed_at` (left open by 4.4, item 5). A reopened order is Open, so the "closed" date filter does not find it; the next Close writes the date again; both moves stay in History.
2. **Look first** (money). "Settlement confirmations" are the transfer and card confirmations and the transfer note. Reopen clears them and the overspend acknowledgment with the same update as Send back for correction; the row is updated, never deleted; the event carries `settlementCleared`.
3. **Look first** (approval order). The reopened order keeps its buying progress. "Finance settles it again" runs through the existing Open rows (Send to settlement, then Finance's Close); no move from Closed straight to Waiting for settlement is added.
4. **Look first** (who is told). "Closed, reopened" goes to the owners, every active Head and the branch's active Finance, never the actor, one notice per branch, as Close.
5. "Its counts are recalculated": the counts are read from the rows on every read, so the reopen writes no count.
6. No "Already reopened by …" line: a second Head at the same moment gets the plain "changed a moment ago" refusal.
7. The Reopen button is secondary, not danger: it ends nothing.

Choices made during the build:

- The Done-when test sets both guard settings to 0 (every overspend needs the Head) so that the order stays above the guard after the cancel and Finance's `not_ready` can only mean the cleared confirmation and acknowledgment.
- The browser test is in `close-exact.spec.ts`, signs in the shared `e2e_head` without changing his language, and finds the confirm button by its label in all three languages, as `overspend.spec.ts` does.

### 4.9 Money with managers (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections applied: owners are grouped whatever their role, with a database case of a Head-owned order; Closed is left out by `managerCashBalance()` only).

1. **Look first** (permission matrix). A new permission `money.managers`: Head all branches, Finance own branches, Manager and Principal no. 03 has no row for the page; 11 Screens names Finance and Head; `data.view` would let the Manager and the Principal in. It guards this page only: the report "Money with managers" of 10 Reports, which every role gets for its own branches, must not reuse it (permission review of 4.9).
2. **Look first** (a formula in `src/domain/`). "The date since when" is the order's first live cash movement (a Cash given, Cash returned or Paid back row of an action not cancelled, by its date; a live record whose `cashSpent()` is above 0, by its trip's date); a Manager's is the oldest of the orders behind his balance. Known limit: a count that went back to 0 and away again shows the older date. Proposed `/spec-change` if the owner prefers the other reading, 08 Money with managers: "the date since when is the date the order's cash count last moved away from 0".
3. One balance per owner across the branches the viewer sees; Finance of one branch sees only that branch's orders of a Manager in two.
4. Every status but Closed counts; Draft is not read (no money reaches one); an order with count 0 is not listed.
5. Oldest first by the since date, ties by name then id; orders inside the same, then by number.
6. The page follows the top bar's branch choice; a chosen branch that is not the user's is refused, as the order list does.
7. A deactivated owner is listed with the plain word "inactive".
8. Each block opens to its orders, each a link to its page; no new order-list filter.
9. The seed's money orders move through the real path (the state machine's moves, money actions dated the Tashkent day of their order action and naming it, `approved_at`, `closed_at`); the Closed one is Not bought with a reason before Send to settlement; no purchase, so no stock movement.
10. The since date is shown as a date only; age buckets are Analytics' (Phase 6).

Choices made during the build:

- The seed's Skotch order uses the department "IT xonasi": the seed Draft already holds Skotch for "Oshxona", and `orders_one_draft_key` allows one Draft per subtype and department (the new order is created as a Draft first).
- The seed test's set of statuses gains Open and Closed and its title says ten orders: the Build line of 4.9 asks the seed for them. Its move test now also accepts the writes that move no status (type in `ORDER_EVENT_TYPES`, status unchanged) and asks `checkMoves()` for each status move.
- The disclosure is a native `<details>` with the `expand_more` icon; the screen needs no client code.

### 4.10 Move orders to another Manager (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections applied: the purchase cancels are refused only for a record that changes a cash count, with a test that a Transfer record of a moved order can still be cancelled; the spec contradiction of item 3 carries its proposed `/spec-change` wording).

1. **Look first** (approval order). The statuses that can be moved: Waiting for Head, Principal or Finance, Sent back, Open and Waiting for settlement (`ownerMoveAllows()` of `src/domain/order-moves.ts`). Not a Draft: the list drops drafts, a never-submitted draft is one per owner (`orders_one_draft_key`) and a Head-created one would skip the Head step at its first Submit by the new owner (03 rule 6). Not Closed, Rejected or Cancelled: nobody works on them.
2. **Look first** (money). "Cash count is zero" means exactly 0 (`orderCashCount()` under the orders' lock): a count below 0, the Manager owed, is refused too.
3. **Look first** (money; spec contradiction). A cancel of a money action, or of a purchase record or trip that changes a cash count (`cashSpent()` above 0), is refused (`wrong_status`, `errors.field.movedSince`) when one of its orders has a `MOVE_OWNER` event at or after the moment it was written (`movedSince()` of `src/features/orders/moved-since.ts`); a move back leaves the event, so the refusal stays. Otherwise the cash would land on the count of an owner who never held it. Proposed `/spec-change` for 08 Money ledger: "Actions are never deleted; a wrong one is cancelled whole, with a reason, while none of its orders is Closed and none was moved to another owner after it was written. When one of its orders is already Closed, the Head reopens that order first; when one was moved, Finance corrects the count with a new action." and the same addition to the cancel of a purchase record and of a trip in 07 Fixing a mistake.
4. The chosen user is an active Manager in `user_branches` of every ticked order's branch, else `invalid_input` on `managerId` for the whole action; an order the chosen Manager owns already is `not_ready` (03 rule 7: "another Manager").
5. Nobody is notified and no reason is asked: 10 Notifications has no row for a move, and 06 names the moves that take a reason.
6. The button is on the order list only.
7. Its own permission `request.move_owner` (the Head only) and its own action and event type `MOVE_OWNER` (migration `0032_move_owner`); not a row of `ORDER_MOVES`.
8. Past money actions keep their Manager, past purchases their creator.

Choices made during the build:

- `moveOwnerChoices()` authorizes `request.move_owner` on each ticked order's branch, read from the order, so another branch is "Not found" as the matrix expects; an id that is no order is "Not found" too.
- "At or after" in `movedSince()`: two writes of one moment are taken as the move coming last, the side that keeps the count right.
- The cash records of the purchase guard come from `cashRecordsByIds()`, which shares one statement with `datedCashRecordsOf()` (`src/features/purchasing/order-records.ts`), so "cash spent" is read one way.
- The history line names both owners from the event's payload `{ owner: { from, to } }`, read in the same query as the events.
- The browser test inserts its own two invented Managers of EA: the seed has one Manager per branch.
- A Manager whose rights are switched off is still offered as the new owner (permission review, Should fix 1, not built): the plan review confirmed any active Manager of the branch (decided item 4), 03 says a switch only takes rights away, and leaving such Managers out would add a rule no spec line names (D44). The Head sees each Manager's switches on the user page.
- `moveOwnerChoices()` reads the ticked orders with the branch wall and the draft wall in its SQL and answers "Not found" for any of them it cannot see before it asks the permission (permission review, Must fix 1): otherwise a colleague's draft or another branch's order answered "forbidden" where an unknown id answered "Not found".

### 5.1 Stock documents schema (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (correction 1 applied), and those of the build. The Look first items come first.

1. **Look first** (stock rule; data model). A reverse is stored on the original document: `reversed_by`, `reversed_at`, `reverse_reason`, set exactly when the status is REVERSED, the reason not blank; the opposite movements point at the original lines and at the movements they undo. Proposed `/spec-change` of 14-data-model.md, `stock_documents`, third line: `reason, comment, client_key UNIQUE, created_by, decided_by, decided_at, reversed_by, reversed_at, reverse_reason`.
2. **Look first** (stock rule). Every reversal moves the opposite quantity at the reversed movement's own unit cost (`reversalOf()`), so the value taken out or put in is given back exactly; the rule 09 Stock value gives a cancelled purchase. `MOVEMENT_RULES`' comment points at it (plan review, correction 1).
3. **Look first** (data model). `reason` is the enum `stock_document_reason` of the two fixed lists, checked by type: direct entry EXISTING_STOCK, GIFT, OTHER; write-off DAMAGED, EXPIRED, LOST, RETURNED_TO_SUPPLIER, LOST_IN_TRANSFER, OTHER; empty otherwise. The comment rules stay in 5.8 and 5.11.
4. **Look first** (stock rule; constraint added). A movement is reversed at most once: a unique index on `stock_movements.reverses_movement_id` replaces the plain one. The 3.1 constraint test that reversed one movement twice now gives each reversal its own target; what it asserts (a REVERSAL goes either way) is unchanged.
5. **Look first** (stock rule). The movement's key to its line is (`document_line_id`, `variant_id`); the branch stays free for a transfer's TRANSFER_IN in `to_branch_id`.
6. One line per subtype per document.
7. The number is given at the create, from the branch's counter (the sender's for a transfer) in the Tashkent year of the creating moment, not of `doc_date`; a pending write-off is numbered from the start.
8. Only POSTED and RECEIVED documents are reversed; who may reverse which type is 5.7's and 7.x's (Decided ahead, question 19).
9. `client_key` is NOT NULL UNIQUE; a document made inside another action gets its key from that action.
10. `takeNumbers()` is the one writer of `number_counters`; submit's `numbersOf()` calls it with scope ORD.
11. Lines keep `qty >= 0`; a posted 0 is refused by `stock_movements_qty_delta_check`.

Choices made during the build:

- The reason and the reverse CHECKs wrap their test in `COALESCE(…, false)`: a NULL reason or a NULL `reverse_reason` would otherwise make the CHECK pass.
- Permission review, Must fix 1: `postLines(tx, { documentId, postedBy })` locks the document and reads its type and branch itself; a status other than POSTED or IN_TRANSIT, or a line that already moved, is `wrong_status`. Must fix 2: the header of `stock-documents.ts` states who makes and reverses each type, which inputs come from the browser, and that an approved write-off or count carries `decided_by` (`createDocument()` takes `decidedBy`). Must fix 3: `lockDocument()` returns type, status, branch, receiving branch and creator, for the caller to authorize before `reverseDocument()` in the same transaction; a transfer is of its sending branch.
- A database link between a movement's branch and its document's branches is not built (permission review, Should fix 2): the helpers take the branch from the locked document, and a trigger for it is a guard no rule asks for (D44).
- The same-moment numbering test was run once with the held side's counter write left out and seen to fail (the second side never waited).

### 5.2 Stock on hand (17.10.2026)

The plan's decisions as the plan review of 17.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (stock and money formula). A row's value is quantity × moving average cost, rounded half up once per row to whole so'm: `stockValue()` in `src/domain/stock.ts`, read on the server, never computed in SQL or the screen. No page or branch total on this screen; the stock report of 6.x decides its branch total and reuses `stockValue()` for its rows.
2. **Look first** (spec contradiction). Every role sees the value column: 09 Stock screens names it for Stock on hand, a screen of every role; "shown in reports only" of 09 Stock value is read as "never on an order or in settlement". Proposed `/spec-change` of 09 Stock value, first sentence: "Value is shown on Stock on hand and in reports, never on an order, and never affects settlement."
3. A balance at 0 stays listed (the minimum of 5.10 needs these rows).
4. One row per branch and subtype, with the branch code.
5. `branch=` in the address wins, then the top bar's choice, then all branches seen, as `/orders`; another branch shows the same empty list. The "Not found" page of a stock address comes with 5.3.
6. Stock of a deactivated product stays listed; inactive categories are offered marked.
7. The empty screen has no create button before 5.4.
8. Fixed order: product name, default subtype first then subtypes by name, branch code.
9. Phone layout: the catalog lists' table scrolling inside its panel.

Choices made during the build:

- Search never matches the hidden default subtype's stored name "default" (plan review, correction 1).
- `stockCategoryChoices` has no branch, so its permission test is a test per role and an inactive user, not the own/other-branch matrix.
- The by-hand Done-when check ("the stock from phase 3 purchases is listed") is also a database test: `recordPurchase` receives 40 at 5 000, and the branch's Principal and the Head see 40 worth 200 000.

### 5.3 Item card (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (stock reading). The running balance is the stored `stock_movements.balance_after`, written by `postMovement()` under the lock from the domain's arithmetic; it is never summed again in the query or the screen. A database test checks it equals the sum of every earlier change, and the newest equals the quantity on hand.
2. **Look first** (part of a Build line handed on). A document's number is plain text on the card; the link to the document moves to 5.12, which gains a "From 5.3" line: 5.12 decides the address (a document page or the documents list filtered to that number). 11 Screens has no address for one document and no document is posted before 5.4. Proposed `/spec-change` of `11-screens-and-ux.md` (Screens): a row "Warehouse document | `/warehouse/documents/[id]` | All", or of 09 Stock screens: Item card: "a link to the source document (its row in Documents) or order".
3. Newest first by `seq` descending; the moment shown is the movement's `created_at` in Tashkent time, not a document's `doc_date`.
4. `[id]` is the subtype; the branch is `branch=` in the address, else the top bar's choice read as `/warehouse/stock` reads it, else the user's only branch, else "Not found". A visible branch that never held the subtype shows the card at 0 with "No movements yet". Another branch, an unknown id or a service: "Not found". A deactivated subtype's card opens.
5. A purchase's movement (its receipt, or the reversal of a cancelled purchase) links to `/orders/<id>?tab=purchases`.
6. 50 movements per page (`ITEM_CARD_PAGE_SIZE` in `src/domain/stock.ts`).
7. A row shows moment, movement type, source, change and balance; who made it is left out.
8. No value and no photo on the card (09 names value for Stock on hand and reports only; plan of 5.2, items 1 and 2).
9. The draft wall on the order joined through a purchase hides only the order's number and link, never the row, so the running balance stays whole.
10. Every movement type has its label now, "Direct entry" included (the card half of 5.8's Build line; 5.8 keeps S15). A unit test checks every type of `MOVEMENT_TYPES` has a label in uz, ru and en.

Choices made during the build:

- The draft-wall test turns a purchased order into a DRAFT by a direct update: the schema allows it, so the test stays (plan review, decision 9).
- The movement's change is shown signed: "+3" in, "-3" out (the formatter's minus).

### 5.4 Issue to a department and the issue note PDF (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (permission matrix). "Give straight to requester" needs `stock.issue` on the trip's branch as well as `purchase.record`: a Manager with `ISSUE_STOCK` off sees no tick, and a ticked save is `forbidden` with nothing saved (03 Manager rights: with it off "the Manager can view stock but not give items out").
2. **Look first** (stock rule). A short line is refused as that line's field (`errors.field.stockShort`) with the amount left (`available`, set only after `authorize()` passed on the branch); the screen names the item from its own line. Several short lines: the first the ledger meets is named (09 Issue 1).
3. **Look first** (stock rule). An issue takes only active subtypes of active goods products (04 rule 2); the tick's issue uses the subtype bought, which the purchase already checked.
4. **Look first** (lock order). `issueStock` takes products FOR SHARE, then subtypes FOR SHARE in id order, before the ISS number; a ticked purchase takes subtypes FOR UPDATE, balances, then the ISS number. Two same-moment tests (same subtype; different subtypes, held at the counter) prove no deadlock.
5. Received by is required on the form; the tick's receiver is the order's "Requested by", else the department's responsible person, else empty (the note prints "—").
6. The date is any day up to today in Tashkent.
7. One ISSUE per ticked record: dated the date bought, the record's quantity and subtype bought, the order's department (even if deactivated since), `created_by` the recorder, `client_key` the purchase record's id.
8. At most 100 lines (`ISSUE_LINES_MAX`); each subtype once.
9. The note is `GET /warehouse/documents/[id]/note`: `data.view`'s branch filter in the SQL, then `data.export` on its branch; a Principal or Finance user of the branch may download it.
10. No confirmation dialog for an issue (11 rule 6 does not list it; 5.7 reverses).
11. "New issue" is a button in the header of Stock on hand; the Manager home button is 6.1's.
12. The PDF parts moved to `src/server/pdf.tsx`; the fonts stay in `src/features/orders/download/fonts` (the Dockerfile copies that folder).
13. No notification and no audit row for an issue (the minimum notice is 5.10's).
14. An issue in an inactive branch is refused (`branchInactive`).
15. The note is A4 portrait: five columns, a few lines.

Choices made during the build:

- The tick's texts say "department" ("Give straight to the department"), not "requester": the text rule of build plan 2.1 (`tests/notification-texts.test.ts`) refuses the word "request" in every language; Russian keeps "заказчику".
- `BranchSelect` asks before a switch while any form on the page has unsaved changes (`hasUnsavedChanges()`); the issue form is keyed by the branch, so the old branch's lines leave on the switch.
- `/warehouse/documents/new` answers only `type=ISSUE`; any other type is "Not found" until its task.
- `issueBranchChoices` is tested by hand rather than by the matrix generator: a list without a branch is refused before any branch is read, so the generator's "other branch: Not found" does not apply.

### 5.6 Return from a department (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (stock rule; Decided ahead 4, question 11, left it to this task). A return into a stock whose quantity under the lock is 0 comes in at the unit cost of that department's newest ISSUE movement of the subtype in the branch that no REVERSAL undid; none: 0. Into a stock above 0 (an average of 0 included, free items) it comes in at the current average, unchanged. Built as `StockMovement.emptyCost`, stored in the RETURN line's `unit_cost`. Proposed `/spec-change` for `09-warehouse.md`, Stock value: "A return from a department comes back at the average of that moment. Into an empty stock it comes back at the cost of that department's newest issue of the item, or 0 when there is none."
2. **Look first** (stock rule). "More than that department ever received" is more than its net received amount of the subtype in the branch: the signed sum of every movement on the lines of its ISSUE and RETURN documents, REVERSAL rows included, negated (`departmentReceived()`). "Give straight" issues count.
3. **Look first** (permission matrix). A return needs `stock.return_reverse` (Manager right `RETURN_REVERSE`); `ISSUE_STOCK` off does not stop it.
4. `returnStock` takes the department FOR UPDATE before reading the received amount; two returns of one department serialize. Lock order: branch, department, products, subtypes, balances, number counter.
5. One over line without a comment refuses the whole return; the comment is the document's; each over line is named with its received amount.
6. Date default today, not in the future; branch prefilled when one.
7. No "Received by" on a return.
8. Active departments and active subtypes of active goods products only.
9. No PDF, no notification, no audit row.
10. At most 100 lines (`DOCUMENT_LINES_MAX`, shared with the issue), each subtype once.
11. No confirmation dialog on save.
12. `/warehouse/documents/new` reads `type=ISSUE|RETURN`; the phone step helper is `document-steps.ts`.

Choices made during the build:

- The search lists every active goods subtype, the stock 0 when none, and puts the products the department holds first within the page of 20.
- Changing the department with lines in the form asks first and clears the lines (their received amounts are the old department's).
- The server's `overReturn` field text is not shown under the quantity: the line's own warning names the amount.
- The issue's same-moment helper moved to `tests/helpers/held-while.ts`.

### 5.7 Reverse a document (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed or changed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (permission matrix; Decided ahead, question 19). `reverseAllows()` in `src/domain/stock-documents.ts`: an issue and a return by their creator or the Head; a Manager also needs `RETURN_REVERSE` (`authorize("stock.return_reverse")` on the document's branch). Every other type answers no until 5.8, 5.11, 7.2 and 7.4 add theirs (the Head only).
2. **Look first** (stock rule; changed by the plan review). Reversing an issue line that is more than the department's net received amount (`departmentReceived()`, `overReturn()`) is allowed: the dialog warns with the amount it holds and the reverse's reason serves as the comment, as for a return (09 Other documents, Return). The only refusal is stock below zero. Proposed `/spec-change` for `09-warehouse.md`, Issue to a department 3: "A posted issue can be reversed by its creator or the Head. The original is then marked "Reversed". Reversing more than the department holds of an item shows a warning, as a return does; the reason is the comment."
3. **Look first** (lock order; changed by the plan review). The reverse takes the document's department FOR SHARE, then `lockDocument()`, then the ledger's balances; a return (department FOR UPDATE) and a reverse of the same department wait for each other.
4. The reverse is not a create: no `client_key`; a second reverse is `wrong_status` under the document lock. The reason is 5 to 500 characters (`isMoveReason()`), stored trimmed.
5. No notification, no history event, no audit row; the document keeps who, when and why.
6. The Reverse button is on the item card's rows of an issue or return (the only place a document shows until 5.12); the dialog lists every line, since one press reverses all.
7. A reverse is allowed in an inactive branch or for an inactive department or product; the ledger still refuses stock below 0.

Choices made during the build:

- A reverse refused for short stock names the line by its id (`lines.<lineId>.qty`, new field kind `reverseStockShort`) with what is left; the dialog turns it into the item's name from its preview.
- Uzbek and Russian say "Storno qilish" / "Сторнировать" for Reverse: the first Uzbek wording, "Bekor qilish", is also the dialog's Cancel button. The item card's REVERSAL label in Uzbek became "Storno" to match.
- The dialog has its own reason hint (`warehouse.reverse.reasonHint`): the orders' hint speaks of orders.

### 5.8 Direct entry by the Head (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (money: the cost of a line). The cost per unit is required, whole so'm, 0 or more (a gift may be free); it is prefilled with the subtype's own reference price, and with none the field starts empty and must be typed (no fallback to the last purchase price, as decisions 1.8 item 4). Worked: 10 at 1 000 in stock and a gift of 10 at 0 give an average of 500.
2. **Look first** (permission matrix; Decided ahead, question 19). The reverse of a direct entry stays in `reverseStockDocument` (`stock.return_reverse` on the document's branch); `reverseAllows()` says yes for DIRECT_ENTRY to the Head only, whoever is recorded as its creator. No new permission name.
3. Reversing a direct entry writes an audit row `direct_entry.reverse` (entity `stock_documents`) from the reverse action's history step; an issue and a return still write none (5.7 item 5).
4. The entry's audit row is `direct_entry.create` with the number, branch, date, reason, comment, status and lines (subtype, quantity, unit cost).
5. Any active branch; an inactive one is refused (`branchInactive`).
6. Date: today by default, any past day, never a future one; the number's year is the Tashkent year of the moment of saving.
7. Lines: at most 100, one per subtype, active goods products and subtypes only, quantity by the measure.
8. Comment: at most 1 000 characters, required and not blank for "Other" (`directEntryCommentRefusal()` in `src/domain/stock-documents.ts`, asked by the form and the action: plan review, correction 1).
9. No confirmation before saving (a direct entry is reversible) and no notification.
10. The form lists every active goods subtype, in stock or not, with the branch's stock beside it.

Choices made during the build:

- The reason starts at "Stock we already had", the main use at launch (09 Direct entry intro); it is a segmented control of the three reasons.
- A refused `reason` opens the form's first step (`document-steps.ts` counts it as a header field).
- The 5.7 test "the Head is refused on a posted direct entry" became "the Head reverses a direct entry": it stood for "no type but an issue or a return yet", which this task's Build changes (Decided ahead, question 19).
- The Stock on hand button uses the existing `inventory_2` icon; no new icon.

### 5.9 Direct entry from Excel (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (money: the cost of an imported row). An empty cost cell takes the subtype's own `reference_price`, read from the subtype row locked FOR SHARE; empty with no reference price is `required`; a typed 0 is allowed. A cell is read without a float: a text by `parseSomOrZero()`, a number cell only as a safe whole number 0 or more, by its digits (`cellCost()` in `src/domain/imports.ts`). Worked: 10 at 10 000 in stock and an import of 10 with an empty cost and a reference price of 12 000 give an average of 11 000.
2. **Look first** (permission matrix, branch wall). One file is one branch, chosen on the page; the action is authorized on that branch under `stock.enter_direct`. `catalog_imports.branch_id` is set for STOCK only (CHECK `catalog_imports_branch_check`), so the repeat answers only its maker in that branch.
3. The reason is EXISTING_STOCK (edge case "The school already has stock on launch day"), the date `businessDate(now())`, no comment. Other reasons go through the form.
4. More than 100 rows become several documents of up to `DOCUMENT_LINES_MAX` lines, the lines in the order of their subtype ids, in one transaction: one ascending lock order for the balances.
5. Each document's `client_key` is made on the server (`crypto.randomUUID()`); the browser's key is on the `catalog_imports` row, and `stock_documents.import_id` links the documents to it, so a repeat answers with the same numbers.
6. The same subtype twice in one file is `duplicateInFile` naming the first row.
7. Names are matched as in the prices import, in the query that locks the rows: the products FOR SHARE in id order by name, then the subtypes of those products FOR SHARE in id order. A product renamed before the save makes its row `unknown`.
8. The page is `/catalog/import/stock`, on the one import page, with a back link to Stock on hand and no Admin nav.
9. The saved message names the document numbers.

Choices made during the build:

- `catalog_imports_branch_check` compares `kind::text = 'STOCK'`: the migrator applies every pending migration in one transaction, and PostgreSQL refuses a new enum value in the transaction that added it ("unsafe use of new value"). One migration, `0034_import_stock`, instead of two.
- `directEntryLineRefusal()` (`src/domain/stock-documents.ts`) holds the line rules of the form's action and the import alike; each reads its cost itself. `lockDirectEntryBranch()` and `recordDirectEntry()` of `direct-entry.ts` are shared the same way.
- A quantity cell typed as a number is read as JavaScript writes it (`String(value)`), never rounded: 2.5 is read, 2.5555 is `tooManyDecimals`, 1e21 `wrongFormat`. Whole units are checked against the measure in the database check.
- The page and the template of a branch-scoped kind are checked with `authorizeList()` (`authorizeImportKind()` in `src/features/catalog/imports/permission.ts`; the template route asks the same two calls itself, as the permission registry wants a route to), since they name no branch yet; the preview and the save with the branch.
- The tests that used `stock` as the unknown import kind use `counts` now: `stock` became a kind.
- The Stock on hand button "Import from Excel" uses the existing `description` icon; no new icon.

### 5.10 Minimum stock and low stock (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed or changed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first** (stock rule). "Low" is quantity ≤ minimum (`00-definitions`: "At or below it"). A minimum is above 0 (`stock_minimums_min_qty_check`, `quantityRefusal()`); "no minimum" (`min_qty` null or no row) is never Low. Setting a minimum makes the balance row at 0 when there is none, so the item is listed on Stock on hand.
2. **Look first** (stock rule; "until restocked"). Restocked = the quantity is above the minimum after a movement or a change of the minimum. `low_notified_at` is set when the notice is sent and cleared at restock; the next movement or change that leaves the item Low sends one again. A receipt that keeps it at or below the minimum is no restock.
3. **Look first** (stock rule). The notice is sent from `postMovement()` through `checkMinimum()`, in the write step of the same transaction: one place covers every movement that lowers stock, now and in 5.11, 7.2 and 7.4.
4. **Look first** (who is told). "Managers of the branch" = active users of role Manager assigned to it, whatever their rights; not the Head, Principal or Finance. The actor is told too (`notify()` with `userId: null`): the notice is about the item's state, and left out the branch's only Manager would use up the one notice on nobody.
5. **Look first** (permission matrix). Setting a minimum is `stock.set_minimums` on the branch: the Head anywhere, a Manager in their branches with `SET_MINIMUMS`. Typing one for an inactive branch, an inactive subtype or a service is refused; clearing is always allowed (`04` rule 2).
6. **Look first** (data model; spec change). `stock_minimums` gains `low_notified_at`, `created_at`, `updated_at`; `min_qty` is nullable and clearing keeps the row (rule 11). Proposed `/spec-change` for `14-data-model.md`: `stock_minimums branch_id, variant_id, min_qty (null = none), low_notified_at KEY (branch_id, variant_id)`.
7. **Look first** (a reading of `CLAUDE.md` rule 8). A minimum has no client key and no version: it is a value that is set, the same value twice is the same state; two at once queue on the locks and the later stays, each with its audit row.
8. "Add to draft" reuses `createDraft` (`request.create`, `CREATE_REQUESTS`): the Head and such a Manager see it. The dialog asks a department of the branch (`listDraftChoices()`) and a quantity, empty at first; a merge shows the draft's new quantity (05 Drafts 2).
9. One notice per item and recipient; params the item's name (the subtype's only when it is real) and the branch code; it links to the item card of that branch; no quantity.
10. The minimum is shown and set on Stock on hand rows and on the item card, in the item's measure.
11. Lock order: product FOR SHARE, balance FOR UPDATE (`holdBalance()`, made at 0 when missing), then the minimum row; `postMovement()` takes the minimum after its balance, item by item in `postMovements()`' order.

Choices made during the build:

- The subtype and quantity rules of a typed minimum are `directEntryLineRefusal()` (an active subtype of an active product of goods, the quantity by the measure, above 0), as for a direct entry's line; no second copy.
- The audit row's `entity_id` is `<branch id>:<subtype id>`, the minimum's key; a clear with no minimum held writes nothing.
- The Low label uses the warning tokens with the `warning` icon (design system: "needs attention").
- The notice's item name joins product and subtype with " — "; the screens join them with ", " as the reverse dialog does.

### 5.11 Write-off (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (approval rule; permission matrix). A write-off the Head makes is posted at once, `decided_by` the Head, and tells nobody: the Head is the one who approves (03 rule 6 for an order the Head creates; `createDocument()`'s `decidedBy`).
2. **Look first** (stock rule). Approval re-checks every line under the ledger's locks; a line the stock no longer covers refuses the whole approval, naming the line and what is left, and the write-off keeps waiting. A waiting write-off holds no stock.
3. **Look first** (stock rule). Asking for more than the stock of that moment is refused (`issueQuantityRefusal()`); equal is allowed. The check that counts is the approval's.
4. **Look first** (status move). PENDING_APPROVAL → POSTED (approve) and → REJECTED (refuse), the Head only, in one function `writeOffDecisionMove()` asked by the action and by the page's `canDecide`; POSTED → REVERSED by the Head only (question 19). REJECTED is final; the asker cannot withdraw.
5. **Look first** (notification params). STOCK_CHANGE_ASKED `{ actor, number, branch, kind }` to every active Head; STOCK_CHANGE_DECIDED `{ number, branch, kind, outcome }` to the asker; `kind` is WRITE_OFF, which 7.4 extends with a word. Both link to the write-off's page.
6. Refuse takes no reason; the document records who refused and when.
7. The comment is required for every reason (question 13), up to 1 000 characters.
8. The date is a field as on the issue: today by default, never in the future, kept at approval; the movements carry the approval moment and its average.
9. Lines: active goods subtypes of active products, at most 100, one per subtype. Approval does not ask again whether the branch, product or subtype is still active (review correction 2; as a reverse): only the stock-below-zero refusal applies.
10. No audit row: the document holds who asked, who decided and when.
11. `/warehouse/documents/[id]` is built for write-offs only; 5.12 opens it to every type.

Choices made during the build:

- The search of items in stock is one reader in `queries/issue-form.ts`, asked with `stock.issue` or `stock.ask_write_off`; the write-off's branch choices live beside the issue's for the same reason.
- The ask's `available` is the stored stock ("4.000"); the approval's is the ledger's StockShortError ("7"), as the issue's and the reverse's. The screens format both.
- The reverse dialog has its own result sentence for a write-off (items come back). It still says "go back into stock" for a direct entry, which is wrong there (a direct entry's reverse takes stock out); left for 5.12, which puts Reverse on the document page.
- The asker taken off the branch, or deactivated, is not told of the decision: `notify()` already sends nothing outside the event's branch (permission review, Should fix 2; a test pins it).

### 5.12 Warehouse documents list and closing a branch (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 4 applied), and those of the build. The Look first items come first.

1. **Look first** (approval-order reading). "Unfinished orders" that block closing a branch are those not Closed, Rejected or Cancelled, except a draft never submitted (DRAFT without a number, `isNeverSubmitted()`): it is outside the approval flow and only its owner can delete it. A taken-back draft keeps its number and counts. Proposed `/spec-change` of `edge-cases/requests-and-approval.md`: "Blocked while it has unfinished orders (any order not Closed, Rejected or Cancelled; a draft never submitted does not count) or stock above 0."
2. **Look first** (stock reading). "Stock above 0" is every `stock_balances` row of the branch with `qty > 0`, counted in subtypes (2.500 kg and 10 pcs do not add up). A waiting write-off holds no stock and does not block.
3. **Look first** (the address handed from 5.3). The item card's number links to `/warehouse/documents/[id]`, the document's own page, now open to every type. Proposed `/spec-change` of `11-screens-and-ux.md` (Screens): a row "Warehouse document | `/warehouse/documents/[id]` | All".
4. **Look first** (lock reading). The block is read under the branch row's FOR UPDATE lock of `setBranchActive`; drafts, submit, issue, return, write-off, direct entry and the stock import hold the branch FOR SHARE and queue behind it. Copy as new reads the branch without a lock, but makes only never-submitted drafts. A Reverse or the Head's Reopen can still put stock or an Open order into a closed branch later; the spec says nothing of what a closed branch allows, so nothing more is refused. Proposed `/spec-change` for the owner, if wanted: "Once closed, no stock moves into it and no order of it is reopened."
5. Direct entries are listed with the other documents and are a type of the filter.
6. The date filter is a from/to range on the document's Tashkent business date; the department filter lists the departments of the branches shown, inactive ones included, with the branch code when several branches are shown.
7. No money on the list or the document page, not even a direct entry's cost per unit (09 Stock value).
8. No status filter and no number search.
9. The seed writes its direct entry and issue in SQL (`scripts/seed-stock.mjs`) with literal quantities, balances and averages; `tests/seed.db.test.ts` checks them against `nextBalance()` and `documentNumber()`.
10. The New buttons of the documents list are those of Stock on hand, from the same choices functions (`NewDocumentButtons`).
11. Tabs "Stock on hand | Documents" above both lists: the one Warehouse (Stock) menu item leaves no other way between them.

Choices made during the build:

- The refusal is `invalid_input` with the fields `orders` (`errors.field.unfinishedOrders`) and `stock` (`errors.field.stockLeft`); the counts travel in `available`, whose comment now names them. The branch page's toast words both with their counts.
- `getWriteOff` became `getStockDocument` (`queries/document.ts`); `WriteOffStatusLabel` became `DocumentStatusLabel`, which keeps a write-off's own words ("Approved", "Refused") and says "Posted" for the other types; its attribute is `data-document-status`.
- The seed's audit total grows by one (79 to 80): the direct entry's own `direct_entry.create` row. The seed tests that count every audit row were changed for that reason, and only by that row (**Look first**: a test changed because a requirement changed).
- The seed's stock is left out when CHL already holds either item, so hand-made stock never meets literal balances.
- `scripts/seed-stock.mjs` is copied into the image's run stage beside the other seed scripts (`tests/image-files.test.ts`).
- The seed tests' cleanup hook (`afterAll`, which drops every fresh database one by one) gets a 60 s limit: with the 27th fresh database it passed the default 10 s. It asserts nothing.

### 6.1 Home: Manager and Principal (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (spec wording; decisions 2.8 item 2). 05 Group rows 5 ("Tata pens: 30 requested") is the Manager home's block "Ordered, every stage": one line per subtype over my orders from submit up to, not including, Closed (Waiting, Sent back, Open, Settlement); Draft, Closed, Rejected and Cancelled add nothing (`REQUESTED_STATUSES`, `requestedBySubtype()`). The English text says "ordered": a built text never says "request" (build plan 2.1).
2. **Look first** (money). "Spending this month" is 08's Actual total over the branch's purchase records that are not cancelled, whose trip date (`purchased_on`) lies in the current Tashkent calendar month (`businessMonth(today())`), summed with `actualTotal()` (`branchSpending()`). No link: no list filter matches "bought this month"; the drill-down is 6.3's.
3. **Look first** (permission matrix). The three buttons show by `mayInSomeBranch()` (`src/domain/permissions.ts`): the role's grant is not "no", an "own orders" grant counts, a switched-off Manager right removes its button. It only hides a link; the target pages and actions authorize again.
4. "Orders due soon": my orders that still wait (the statuses of `isOverdue()`, Open only while buying) with needed-by on or before today + 7 days, overdue ones included; 7 is the domain constant `DUE_SOON_DAYS`, not a setting. The list's `due=soon` filter reads the same lists.
5. The buttons: New order opens the drafts grid (`/orders#drafts-title`); Record purchase opens my Open orders (`/orders?status=PURCHASING&owner=<me>`), since a purchase needs its orders; Issue from stock opens `/warehouse/documents/new?type=ISSUE`.
6. Two taps: a card's Approve, Send back and Reject act on every order of its group row; tap one is the button, tap two the confirmation (11 rule 6); the reason of Send back and Reject is typed between them (06 rule 3). A card over 200 orders has no buttons and points to the list.
7. Cash I hold shows held and owed apart over my orders that are not Closed (`orderCashCount()`, `managerCashBalance()`), with the number of orders whose count is not 0; it links to all my orders, since Open and Settlement orders both hold cash.
8. The home lists follow the top bar's branch, as `/orders`; the Principal's counts by status leave Draft out (the draft wall); urgent cards first.
9. The 3.10 hand-over of the Head's price prompts moves to 6.2 through progress, not through 6.2's build-plan line (review correction 1).

Choices made during the build:

- `readGroups()` stays private: an export of `features/*/queries/` needs a registry entry and a matrix test. `listOrderGroups()`, `orderTotalsOnFilter()` and `countOrdersByStatus()` take an optional executor, so the homes read every number in one snapshot (spec review, Must fix 2) and each still calls `authorize()`.
- `ListOrder` gained `ownerId`, `plannedTotal` (`orderTotal()`), `progress` and `received` (`actualQuantity()`), computed in the list's one pass, so the cards and the open rows need no second read. A group's received sum is `receivedTogether()` (`sumQuantities()` refuses 0).
- `recordsWhere()` (`order-records.ts`) reads records by a condition on the record and its trip, the branch wall in the caller's subquery; `recordsIn()` shares its statement.
- The waiting cards ask `allowedActions()` with facts false: no move of a waiting order reads Close or settlement facts.
- The e2e test of the Principal's branch name asks `getByLabel(…, { exact: true })`: the home's "Filialim …" sections are labelled by their titles, which the loose match found. It still proves the select is absent (**Look first**: a test changed because the page gained content).
- `documents.db.test.ts` (5.12) failed about three runs in four on `main`: the clock was frozen and two documents tied on `created_at`. The direct entry is now made a minute later; the test asserts what it meant.

### 6.2 Home: Head and Finance (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: the seed's trip is of the seed's Tashkent today; the stuck instant is the injected clock's; the stuck test has an order sent back and submitted again), and those of the build. The Look first items come first.

1. **Look first** (approval order). An order is "stuck" when it has stood at a Waiting step (Head, Principal, Finance) for more than the setting `escalation_hours` (48), counted from the newest event that moved it into its current status: a resubmit starts again, a move that changes no status (Move to another Manager) does not; exactly 48 h is not stuck, 48 h + 1 min is. Sent back, Open and Waiting for settlement are not approval steps (06 rule 9).
2. **Look first** (formula). `stuckBefore()` and `STUCK_STATUSES` live in `src/domain/order-steps.ts`; the list's `stuck=1` SQL compares with the instant, as `due=soon` does. `isStuck()` is left to 8.1.
3. **Look first** (money). Finance's exact amount is per owner and branch: cash to give is `actionTotal(approvalCashRows(...))` over `plannedCash()`, the approval dialog's prefill; the settlement amount is `settlementNet(settlementRows(...))` over the cash counts, the settlement screen's prefill net. A money action is one per Manager, a settlement one branch, and a group row can mix Managers; the entry's link (`status`, `owner`, `branch`) holds exactly its orders.
4. **Look first** (approval order). Overspends to acknowledge are the Waiting for settlement orders with `overspendNeedsAck()` under the settings of now (decisions 4.7 item 3), each linking to its order page; the block opens `/orders?status=SETTLEMENT`. No list filter for the guard.
5. The per-branch lists show the top bar's branch, or every branch the Head sees, an inactive one marked: 10 restricts neither, and an inactive branch can have spending this month.
6. The price prompts of 3.10 are a Head home list after the suggestions, read by `getPricePrompts()` unchanged.
7. Write-offs link to `/warehouse/documents/[id]`; the block to `/warehouse/documents?type=WRITE_OFF`.
8. Counts are plain numbers; every amount is the server's.
9. The seed grows by two Settlement orders, a pending write-off, a pending suggestion and one backdated waiting order (Waiting for Principal, three days), so each list can be seen filled by hand. The price prompts stay empty in the seed.
10. The suggestions and price prompts blocks do not follow the top bar: both are global catalog lists.

Choices made during the build:

- Each list of `getHeadHome()` is authorized by its own right (`request.approve_step1`, `request.acknowledge_overspend`, `stock.approve_write_off`, `data.view`); with a branch chosen, `data.view` on it comes first, so another branch is "Not found" for every role. `getFinanceHome()` the same with `request.approve_step3` and `request.settle`.
- `ordersOnFilter()` is a new export (registry and matrix test); `orderTotalsOnFilter()` now reads through it, so the reading exists once.
- `listWhere()` takes `escalation_hours` from `whereOf()`, which reads the settings only when `stuck` is on, in the caller's snapshot; `selectAllOnFilter()` and `orderDownload()` build their condition inside their snapshot now.
- The chip says "Stuck at a waiting step" without the number: the list does not read the setting for its label.
- The seed's purchase is written as `recordPurchase` writes it (trip, record, `actual_total`, progress, the event's `purchase` payload), its actual total and progress as data (the seed computes no formula); a service, so no stock movement. The seed test's move check counts that record as finishing the buying.
- Seed tests changed because the seed gained rows (**Look first**: tests changed because a requirement of 6.2 added seed data, nothing weakened): the audit total 80 → 81, the statuses gain Settlement, six money rows instead of four, three documents and counters instead of two, and the money-with-managers check now expects held 180 000 and owed 150 000 over four orders.
- The 6.1 empty-state fallback of the home page and its `home.empty` texts are gone: every role has its home.
- The Uzbek empty line of the write-offs avoids "so'rov", which the built-text check refuses.
- Permission review: a test of every role on both homes with no branch chosen (Must fix 1); a comment that the SQL is the wall of Finance's entries and the step's `decide()` only narrows (Should fix 1). Should fix 2 (a matrix variant of the wall for `getFinanceHome`) is covered by the plain test with Finance of one branch and orders of another, as for `getMoneyWithManagers`: the matrix helper expects "Not found" for a role refused before any branch is read.

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
