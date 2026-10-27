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
| D23 | 12.10.2026 | ~~The procurement app and the academic platform (`sodiqschoolapp/sodiq-platform`) share one design system, `docs/design-system.md`: everything above its last section ("This app") is the same text, word for word, in both repositories, and a change to it is a process change made in both in the same week. The logo files are `public/brand/`, the exact vectors of the brand book.~~ Replaced on 21.10.2026 by D60. | Owner: "Design codes of both platforms should be exactly the same." The two apps are one family and will share one sign-in. |
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
| D51 | 19.10.2026 | **One reviewer per commit, and the stricter verdict wins.** `review-pr`: before a plan or code review, a run posts `Reviewing <sha>.` and stops at another run's live claim for that sha (younger than 60 minutes, no `[review]` for that sha after it), or at a live claim with a lower comment id than its own. "One verdict per head" now lets a later `changes needed` or `owner decision needed` through after another run's `ready to merge` at the same sha (on a draft the first verdict stands); after a merge it goes out as `[review] after the merge at <sha> @abbosc` with the label `needs-owner`, which wakes no builder. Fix task 6.5a-2. | On #109 (6.5a, 18.10.2026) the bridge fired two review runs a minute apart (the push that ends a task, then marking it ready). One merged at `ready to merge`; the other found a gap (the Orders total opens no list, `10` point 3) and, by the old rule, stood down. The same race lost two findings on #61 (D49). Every finished task was reviewed twice, at twice the cost. |
| D52 | 19.10.2026 | **No test copy.** The live app is set up at task 9.4 and runs in trial mode (demo users, invented data) until the owner is satisfied; the restore drill (9.6) runs during the trial; then the trial ends (`SEED_DEMO_DATA` removed, the database emptied and rebuilt by `npm run trial:reset`) and the real data comes in (9.5). Every merge reaches the one app. Replaces the test copy of D15 and D22; none was ever created (owner, 19.10.2026: "The project is not deployed anywhere"), so nothing is switched off. | Owner, 19.10.2026: "we will have the real production app. We will test everything with that, create mock data and do everything. If everything passes, we will just delete all the created data." Emptying the whole database replaces deleting rows: orders, money and stock rows can never be deleted (`CLAUDE.md` rules 7 and 11). Saves the $17 a month of the test copy. |
| D53 | 20.10.2026 | **CI runs in parts at the same time.** `checks` becomes `lint-and-migrations` (audit, lint, translations, typecheck, migrate and seed twice, schema check, no merged migration edited) beside `tests (1/3 to 3/3)` (`vitest run --shard=N/3`, each on its own runner and PostgreSQL), and a last job still named `checks` that is green only when every part is. `e2e` becomes `e2e (1/4 to 4/4)` (`playwright test --shard=N/4`, each with its own PostgreSQL, app server and e2e database) beside `image` (the App Platform image built, started and checked), and a last job still named `e2e`. Every part has a 25-minute limit. The same tests run on every commit; branch protection and the loop read the same two names. | Owner, 20.10.2026, after sodiq-platform pull requests #169 and #170. Measured on 19.10.2026: `checks` 12.8 to 14.7 minutes (the tests 10.8 to 12.5), `e2e` 17 to 23.4 minutes (Playwright 18 to 20), so a push waited about 23 minutes and the review routine's 15-minute wait for CI ran out on #131. No more Playwright workers on one machine: tests sharing one database and its people can fail at random. |
| D54 | 20.10.2026 | **A reviewer claims a commit only once its CI is green, and waits up to 30 minutes for CI.** The claim of D51 now comes after the wait for CI on a code review (a plan review has no wait), and is live for 40 minutes instead of 60. The review routine waits for CI, and before a merge for a running check, up to 30 minutes instead of 15, the limit of the CI jobs since #128. | On #131 (9.1c, 19.10.2026) a run claimed the commit at 20:38 UTC and waited for CI; `e2e` took 23 minutes, so the run gave up after 15 without a verdict. Its claim stayed live, the hourly run at 21:11 stood down at it, and the green pull request waited until the claim ran out. |
| D55 | 20.10.2026 | **The owner's answers on issue #9.** The owner's reviewer read every decision made without the owner (about 1 190, tasks 0.3 to 9.3) against the spec and the code and brought the owner 35 items. Changed, with the spec change of 20.10.2026 and the fix tasks 4.10b, 7.4b, 7.4c, 2.3b and 8.2b placed before the owner gate (item numbers in brackets are those of issue #9; each names its line in this file under "Recorded in"): (1) a later Cash given is prefilled with the planned cash not yet given (4.3 item 2); (2) a money action or purchase record can be cancelled again once its order is back with the Manager who held it (4.10 item 3); (3) stock still held of an inactive item can be issued, returned, written off and transferred (5.4 item 3); (4) a count adding stock to 0 comes in at the last cost, not 0 (7.4 item 3); (5) PDFs made after a Russian PDF losing letters (3.5 item 9, 6.7 item 4; the defect under 3.5 "Choices made during the build") is left for later: no task now, a known defect of the trial; (6) a failed weekly copy tells the Heads and is retried, in a bucket of its own, and 9.6 restores one (8.2 items 4 and 6; it reverses "A failed copy is a failed tick and a log line, no notification"); (7) receipt photos kept at 2 500 px (0.12 item 8); (8) a console command renews a Head's password, and a second Head is created at 9.5 (1.3 item 2); (9) a taken-back Draft with a number can be cancelled (2.3 item 7); (10) a running period is compared with the same days of the period before (6.3 items 3 and 6); (11) reports start at the switcher's branch (6.8); (12) the Head may Submit again a Manager's sent-back order (2.3 item 5); (13) the owner is told when someone else cancels their orders (2.11 item 5); (14) both Managers are told when orders move (4.10 item 5); (15) a money action's date is not in the future (4.3 item 8); (16) a cash extra cost needs a receipt when the setting is on (3.3 item 4); (17) a transfer In transit can be cancelled (7.1 item 9); (18) a refused write-off carries a reason (5.11 item 6); (19) the Head sees a direct entry's cost per unit (5.12 item 8); (20) the bell shows only notices of the reader's branches now (0.11 item 4); (21) error and uptime alerts on from the trial (9.3 item 3); (22) Money with managers and the Head's price notes for the Head and Finance only (6.9b items 1 and 5). Confirmed as built: calendar quarters (Q14), daily reminders after 24 and 48 clock hours, the suggested quantity of 30 days at the 90-day rate (Q15), the stock value column for every role, 5 wrong passwords lock 15 minutes, a new role means a new account, the acting Principal replaces the regular one, a Head-created order belongs to the Head, orders move only at a cash count of 0, Send back for correction clears Finance's ticks, a count goes to the Head when complete, Excel import adds only (500 rows), Head corrections on a closed branch; and every other decision on issue #9. | Owner, 20.10.2026: "1-21 yes, except 5. If this is again separate task we might lose time. rest ok", then "just stop pdf fix. we can do it later. If there is faster way to fix those, let's do that": 5 is left out, and items 10 and 11 join 8.2b, so five tasks carry the rest. The review covered the whole issue, so the go-live review the owner gate asks for is done for every decision up to 9.3. |
| D56 | 20.10.2026 | **The money and stock audit and its fix.** Two independent sessions read the purchasing, money and warehouse code on `main` at 02b58b6, one from the spec (214 statements of 07, 08, 09 and their edge cases), one from the code (130 actions and functions, the worked examples of 08 recomputed by hand: all match). No wrong rounding, no float on money, no total computed twice, no write outside the wrapper or one transaction, no list without its branch filter. Two findings, both of "Give straight to requester": (1) serious: cancelling such a record reverses its receipt but leaves its issue posted, so when the branch holds other stock of the subtype the stock falls twice (50 notebooks on the shelf, 40 in the system) and the department's received count doubles; the stock rule blocks the cancel only when nothing else is held (`cancel-purchase.ts`, `reverseStock`); (2) minor: `purchases.give_to_requester` is never written (`record-purchase.ts`), so it is always false. Fix task 5.4b, placed before the owner gate after the fix tasks of D55. The review routine stays on Opus. | Owner, 20.10.2026: "A. Yes" (the fix task); "B, no need yet" (Fable 5.1 for the review routine), although finding 1 meets the bar of D48 (one serious gap); the reviews of 3.7 (the cancel) and 5.4 (the tick) passed it. Out of scope: the D55 items and the PDF defect. |
| D57 | 20.10.2026 | **An issue cannot be reversed past what a department returned.** Reversing an issue line that is more than the department's net received amount of the subtype is refused, not only warned (reverses 5.7 item 2): 10 notebooks issued to Maths and 4 returned, a reverse of the issue would put 10 back for 6 still out, so stock would show 4 too many. The return is reversed first. A return keeps its warning (09). Fix task 5.7b, placed before the owner gate. | Owner, 20.10.2026: "first fix that", on the owner's reviewer finding it among the 37 Look first decisions of the D55 fix tasks (5.4b item 2 named it as a gap needing a task). Stock must always be right (`CLAUDE.md`, What matters most 1). |
| D58 | 20.10.2026 | **The owner gate is deleted.** The go-live review it asked for is done: every decision on issue #9 up to 9.3 (D55), the money and stock audit (D56), and the Look first decisions of the fix tasks 4.10b to 5.7b (D57), all with the owner's reviewer. The start routine now takes 9.4. The stop list of `CLAUDE.md` still holds: a secret, a provider account, anything that costs money or production stops the task for the owner, so 9.4 builds its files and then waits for the owner to create the accounts. | Owner, 20.10.2026, after the last fix task (5.7b) merged. Before 9.5 brings real data, the owner tightens the stop list for the live system (`CLAUDE.md`, last paragraph). |
| D59 | 21.10.2026 | **The live app was set up, and `.do/app.yaml` follows it.** The owner created the database cluster `ombor-db` ($15.15 a month, Standard edition, storage autoscaling on), the app `ombor` ($10.00, `apps-s-1vcpu-1gb-fixed`, Frankfurt), the R2 buckets `ombor-files` and `ombor-copies` with one token each, the CNAME `ombor` at the school's DNS (Eskiz), and the typed values, encrypted, at run time. `/health` answered `ok` on the commit of #148 with `UTC`, and `storage-check` printed `storage ok`. The dashboard has no create-from-spec button, so the app was made with the wizard and the spec applied after; the wizard named the attached database `ombor-db`, and App Platform refuses a spec that renames it, so `.do/app.yaml` names the component `ombor-db` and binds `${ombor-db.…}`. The size slug, the database fields and the bindings, written from memory in 9.4, were checked against DigitalOcean's documentation. | Owner, 20 and 21.10.2026, setting up the live app with the owner's reviewer; "ok go" for this change. The sign-in of the four demo users, the alerts (Sentry, UptimeRobot) and the first daily backup are still to be checked (9.4's Done when). |
| D60 | 21.10.2026 | **The app has a look of its own; D23 is replaced.** `docs/design-system.md` is this app's own text and is no longer shared word for word with `sodiqschoolapp/sodiq-platform`: a clean, neutral look (white and light grey surfaces, hairline borders), the school's navy for text, the primary button and active states, the school's orange as a small highlight only (active tab, active menu marker, the one "needs you now" accent), other colour only for meaning, Golos Text only (Bitter is dropped), Material Symbols Rounded, the school's logo in `public/brand/`. Light and dark themes stay. A change to the design system is now a change in this repository only. | Owner, 21.10.2026: the app "should not necessarily use the same design rules (like background, colors etc.) as sodiq platform"; he chose a clean, neutral look with the school's navy and orange kept as brand colours. Spec change `spec/2026-10-21-neutral-brand-look` (`11-screens-and-ux.md` rule 15, `13-technology.md`). |
| D61 | 21.10.2026 | **Look first** (money; changes 6.4b decided item 4). **A price rise is between two trip dates.** The earlier price of "Biggest price rises" is the newest record before the 90 days, else the oldest record in them whose trip date is before the newest record's trip date. Records on the newest record's date are one shop visit, never a rise: their differences already show under "different prices". A subtype with no record on an earlier date has no rise. The rest of item 4 stays as built (the 90 Tashkent days, the newest record, `changeAgainst()`, only above 0, the order by percent). Test: `prices.db.test.ts`, "a rise is between two trip dates". | Owner, 21.10.2026: "we will fix that after redesigning", on issue 6 of the live test: two prices of one shop visit (3 500 → 4 000) showed as a rise of +14 %. |
| D62 | 25.10.2026 | **The Finance step can be switched off; D3 holds otherwise.** The Head switches the setting `finance_step` for the whole school. While it is off, the Principal's Approve opens the order and marks it as having skipped Finance; such an order keeps no cash count, never goes to settlement, and is closed by the owner or the Head once its buying is finished, whatever the difference. Switching off is refused while any order waits for Finance or for settlement; switching on changes only orders approved from then on. Head, then Principal, can still never be skipped or repeated wrongly. | Owner, 25.10.2026: the Finance team does not use the app at the start; "no cash tracking [...] when there is difference it is enough for head to see that, but no action needed". Spec change `06-approval-workflow.md` "Finance step switched off"; task 4.10c. |
| D63 | 25.10.2026 | **Managers add products and subtypes; product suggestions end.** A Manager whose right `ADD_PRODUCTS` (the tenth, on by default) is on adds a missing product (name, type, category, measure, optional photo) or a subtype from an order's product search, usable at once, with no approval. The first subtype of a product that had none also names its existing items, which the hidden default takes, so stock and orders stay right. Managers never set reference prices or edit existing entries. The Head's home lists Manager-added entries until checked. | Owner, 25.10.2026: "managers should be able to create products. it should be simpler like creating products while on the go i mean while creating orders"; subtypes too: "yes subtype also possible"; no Head approval first: "no". Spec change `04-catalogs.md` rule 8; task 1.12b. |
| D64 | 25.10.2026 | **The first real subtype: the existing items are named too.** Whoever adds the first real subtype to a product that has none (the Head on the catalog page, or anyone from an order) also names the existing items; the hidden default takes that name and keeps its orders, stock and price, and the new subtype is a new row. This replaces decisions 1.8 item 1, under which the default took the new name and stock already on the shelf could carry the wrong label. Open question 18 answered. | Owner, 25.10.2026, on the review of the spec change for Managers adding products (remark 1): add the catalog page fix. Spec change `04-catalogs.md` rule 1; task 1.12c (first written as 1.12b Build (6); moved because 1.12b had started before this merged). |
| D65 | 25.10.2026 | **The order sheet and a simpler order page.** Drafts are written in an order sheet of six cells (product with subtype, department, quantity, price, needed-by date, total; the branch only for several branches) with the rest under "More"; a new draft copies the branch, department and date of the one above; one Submit with nothing ticked sends the user's own ready drafts that have no number and leaves the others marked in the sheet; sent-back, taken-back and other owners' rows go only when ticked, and ticked rows stay all or nothing. Drafts still save themselves. The order page shows who acts next and since when on top, one Plan and actual block, the steps in History, and one main action with the rest under "More". | Owner, 25.10.2026: "it should be kinda very very easy and simpler visually. one example is just excel. Maybe we also don't need to have steps to create an order [...] It can be one step. Additionally we should make the order page more user friendly." The six cells: "ok". Spec change `05-order-request-form.md`, `11-screens-and-ux.md`; tasks 2.5c and 2.9b. |
| D66 | 26.10.2026 | **Adding products needs both rights.** A Manager adds a product or a subtype while ordering only while both rights "Add and submit orders" (`CREATE_REQUESTS`) and "Add products and subtypes" (`ADD_PRODUCTS`) are on; with either off the Add line is not shown and the server refuses. This changes the part of 1.12b decided item 1 that did not ask for `CREATE_REQUESTS`. | Owner, 26.10.2026, on the permission review's question of 1.12b: "yes, require both rights". Spec change `03-roles-and-permissions.md` (Manager rights), `04-catalogs.md` rule 8; task 1.12c, Build (2). |
| D67 | 26.10.2026 | **The Head sets which order fields are asked.** One school-wide setting (`order_fields`): for department, needed-by date, price, payment type, priority, brand, requester name, comment, reference photo and extra costs, whether each is required, optional or hidden, and whether it stands in the row or under "More". Branch, product, subtype and quantity are always asked. Price can be optional or hidden only while the Finance step is off; an order without a price has no planned total and shows "No planned price", and switching the Finance step on is refused while price is not required or an unpriced order waits for Head or Principal. | Owner, 26.10.2026: "head should be able to configure which fields to require and ask mainly" (needed by, department, price per unit "optional/hidden"); price: option (a), only while Finance is off; both how it is asked and where it stands: "yes"; school-wide. Spec change `05-order-request-form.md` "Fields the Head sets"; task 2.5d. |
| D68 | 26.10.2026 | **Orders without a department show under "No department".** Analytics and reports by department show orders without a department under "No department" instead of leaving them out, so the totals by department add up to the whole. | Owner, 26.10.2026: "ok go ahead", on the review remark of the field settings spec change that leaving them out hides real spending. Spec change `05-order-request-form.md` "Fields the Head sets" rule 3; task 2.5d. |

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

### 6.3 Analytics foundations (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: no payment type in `analytics_spending`, as an extra cost has its own; every address value through Zod in `period-params.ts`; one WHERE builder, `spendingWhere()`, for a number, its list and its export), and those of the build. The Look first items come first.

1. **Look first** (spec contradiction: `14-data-model.md` Notes, third bullet, and the 6.3 Build line say "materialized views"; developer-rules rule 1 says a formula lives once). The summary is a plain table, `analytics_spending`, rewritten every 5 minutes by the job `analytics_refresh`, each row's amount `actualTotal()` of one record; the pages sum stored whole so'm, which is addition, as 08 rounds each record on its own. Proposed `/spec-change` of `14-data-model.md`, Notes for the build, third bullet: "The analytics summary tables are tables rebuilt every 5 minutes by the scheduler from these tables, their amounts from the shared domain functions, and are not counted above."; and of the 6.3 Build line: "Summary tables, rebuilt every 5 minutes by the scheduler".
2. **Look first** (open question 14). "This quarter" is the calendar quarter holding today in Tashkent.
3. **Look first** (10 point 1). The period before is the whole period of the same kind just before; custom dates of n days compare with the n days just before. A running month is compared with all of the month before (on 18 October: 18 days against all of September).
4. **Look first** (rounding). A change is the difference in so'm and the percent of the period before, half up (away from zero) to one decimal, by decimal.js in `src/domain/analytics.ts`; no percent when the period before is 0.
5. **Look first** (money). Spending is 08's Actual total of the records not cancelled, by trip date (as 6.1 decided item 6); category of the record's own subtype; department and Manager the order's; supplier the trip's. No payment type (review correction 1).
6. **Look first** (10 point 1 with point 3). A breakdown's number is compared with the same key in the period before; a month's point with the month before it (the first point with the whole month before the period); only the change is shown, so every shown number has its drill-down. A month's point counts its days inside the period.
7. The Manager filter is the order's current owner; the list holds users of role MANAGER with a visible branch.
8. The summary rows are derived and rewritten on each run; `CLAUDE.md` rule 11 protects records, not this table.
9. The school year runs from its first day to the day before the next; "this school year" holds today.
10. The branch filter starts at the top bar's branch view; `branch=all` in the address is all of the user's branches.
11. The drill-down reads the summary rows under the same condition as the number; names are read live.
12. Filter lists show inactive catalog entries too, marked; suppliers are companies of kind SUPPLIER or BOTH.
13. Until 6.4 to 6.6, every role's page shows the shared Spending block.
14. The page shows when the summary was last rebuilt (`scheduled_jobs.last_finished_at`), or that it is being prepared.
15. Recharts 3.10.1 (MIT, on the stack line) is installed; `npm audit --omit=dev --audit-level=high` stays clean (the four moderate findings are drizzle-kit's, as before).
16. Custom dates: both required, real dates, from ≤ to; nothing more.

Choices made during the build:

- 17. The chart marks are the theme's foreground colour (navy in light, light in dark): one series each, so no legend; the `--chart-*` tokens of `globals.css` are shadcn's greys, not the design system's, and orange stays for actions.
- An address the parser refuses, a school year not set, or a month key outside the period sends the page back to `/analytics` (this month) and the download to 404; another branch's `branch=` is Not found.
- `refreshAnalytics()` takes `lock table analytics_spending in exclusive mode` first: the scheduler's lock already stops a second instance, and this stops a second caller (the browser test's own refresh) from colliding on the primary key, while readers go on.
- The chart wrappers take each amount as a number for the drawing only; every shown amount is the server's formatted text (`chart-point.ts`). The tables under the charts carry the numbers for the keyboard and screen readers; the drawing is `aria-hidden`.
- Categories are listed by their amount in the period, largest first.
- At phone width the filters fold behind a "Filters" button (`filter-fold.tsx`, a client toggle; from 640 px always shown).
- The Excel file: the title, period and chosen filters above a header row with an auto-filter; money as number cells as in the order list download; a change as a signed number and its percent as text; a date as a date cell.
- Permission review: a department or Manager filter id of a branch the user does not see is "Not found" (`authorizeAnalytics()`, Must fix 1; the rule was already in `.claude/rules/server-actions.md`, so no new line); a browser step for another branch on both pages (Should fix 1); a route matrix case without `branch=` (Should fix 2).

### 6.4a Analytics: Head, Spending and Plan vs actual (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: the owners who are not Managers in one "Other owners" row with `owner=other`; both cancel cases tested; the seed line corrected), and those of the build. The Look first items come first.

1. **Look first** (a task split). 6.4 is split into 6.4a (Spending, Plan vs actual), 6.4b (Prices, Approval speed) and 6.4c (Managers, Warehouse), written into `docs/build-plan.md`; each part keeps 6.4's Read line.
2. **Look first** (money). "Split by payment type" splits each record's Actual total into its goods, `actualGoods()` of the record, under its trip's payment type, and each extra cost under its own (`paymentParts()`); the parts add up to `actualTotal()` of the record. A gift with no extra has no part.
3. **Look first** (money). An order counts in Plan vs actual once its buying is Done or Done short, from Open on; its colour is the Total colour of `orderColours()`. Overspent is the sum of −difference of the red orders, saved the sum of the difference of the orange ones. Closed is not waited for.
4. **Look first** (money). Orders marked Not bought are left out of Plan vs actual (their whole plan would read as saved); the block says so. Proposed `/spec-change` of `10-notifications-analytics-reports.md`, Head, Plan vs actual: "Share of orders whose buying ended Done or Done short, green, orange and red (Not bought orders are not counted); …".
5. **Look first** (period). An outcome falls on the Tashkent date of the order's newest RECORD_PURCHASE, FINISH_ORDER, MARK_NOT_BOUGHT or CANCEL_PURCHASE event.
6. Category of the planned subtype, department and Manager of the order; the supplier filter keeps an order with a live record from that supplier.
7. Every number shows its change; a share's change is in percentage points (`shareChange()`, half up to one decimal), none when the period before ended no orders.
8. The blocks are on the Head's page only; the queries read the user's branches under `data.view`, for 6.5 and 6.6.
9. Branch, department and supplier bars drill down by setting that filter; payment type has its own key; by-branch and by-Manager cells set that filter, "Other owners" sets `owner=other`.
10. Top 10 suppliers by amount in the period; records with no supplier are left out of that chart only.
11. Branches side by side lists every branch of the user with spending in either period, inactive ones marked.
12. The new summary tables are rewritten in the same run and under the same lock as `analytics_spending`.
13. A gift with no extra cost has no payment part.

Choices made during the build:

- The outcome colour is a PostgreSQL enum `outcome_colour` (green, amber, red), not a text with a CHECK as the plan said: `.claude/rules/database.md` asks enums for kinds; the database still refuses any other value (tested).
- The three colour counts carry `OutcomeLabel` (icon, word, amount without its sign; 0 allowed, unlike a set's label): green 0, orange the saved, red the overspent.
- `getHeadSpending()` reads the period's total in its own snapshot, so the Excel total line and the rows never come from two moments.
- The Excel writer: a count cell kind; a total may be absent (top 10 suppliers, the Plan vs actual counts) or name its column (the orders list's signed difference, the records list); an empty table keeps the total's label in the first column (found by the 6.4a route matrix: the total was written over its label).
- Permission review: the route matrix covers every 6.4a block (Must fix 1); the orders list keeps the draft wall in its SQL (Should fix 1); a matrix case for the payment key (Should fix 2).

### 6.4b Analytics: Head, Prices and Approval speed (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: one price formula, `unitPriceOf()`, for the trend, the rises and the spread; "All branches" and "in all" from the set's own sums; the seed numbers worked out from the seed's events), and those of the build. The Look first items come first.

1. **Look first** (money). The price of a set of records is goods ÷ quantity, rounded once half up: `unitPriceOf()`, pulled out of 3.5's `actualUnitPrice()`, which keeps its results. Each `analytics_spending` row stores `actualGoods()` of its record, so SQL only adds whole so'm and quantities. Extra costs are not part of a price; a gift (price 0) is left out of every price number.
2. **Look first** (money). A price is per subtype, the subtype the record bought (07 Substitution); a product without subtypes is its default subtype; services count.
3. **Look first** (money). The price trend: one point per month of the period, the month's `unitPriceOf()`, with its change against the month before (the first point against the whole month before the period); a month with no record has no point. The subtype is the one picked (`variant=`), else the one with the most records in the period.
4. **Look first** (money). Biggest rises: the 90 Tashkent days ending today, whatever the period, the filters applied. Earlier price: the newest record before the 90 days, else the oldest in them (on a date before the newest one's since D61); newest: the newest in them; records by trip date, entry time, id. Rise `changeAgainst(newest, earlier)`, only above 0, the 10 largest by percent (ties by so'm, name) on the page, all in the export. No change against a period before.
5. **Look first** (money). Different prices: per subtype in the period, `unitPriceOf()` of each branch-and-supplier pair (no supplier a pair of its own); listed when the pairs differ; cheapest against dearest by `changeAgainst()`. No change against a period before.
6. **Look first** (approval order). A stay runs from entering Waiting for Head, Principal or Finance to that step's Approve, Send back or Reject; a stay ended by Cancel or Take back is left out; a move with from = to neither starts nor ends one; a Head-created order has no Head stay. `approvalStays()` reads them; the open one is "waiting now".
7. **Look first** (approval order). Clock hours; a stay counts on the Tashkent date it ended; `averageHours(Σ seconds, count)` half up to one decimal for any set, "All branches" included; the change is the difference in hours.
8. **Look first** (approval order). Waiting now: the open stays, grouped by fixed analytics edges (24 h, 48 h, 7 days, strict as `stuckBefore()`), not the reminder settings, read from `analytics_steps` with the injected clock; no period, no change.
9. **Look first** (approval order; proposed `/spec-change`). The shares are of the approvers' decisions in the period, per step and in all, with the change in points. Proposed wording of `10-notifications-analytics-reports.md`, Head, Approval speed: "…; of the approvers' decisions, the share that sent back or rejected, with the most common reasons".
10. **Look first** (approval order). Reasons are grouped by `reasonKey()` (trimmed, one space, lower case), each with its newest spelling and its count of decisions; the 5 largest of send backs and of rejections. A send back's per-order note is not a reason.
11. The supplier filter keeps an order with a live record from that supplier, as Plan vs actual; so "waiting now" is empty with a supplier chosen. Manager the current owner, category the planned subtype's, department the order's.
12. Drill-down keys: `price:<subtype>[:<YYYY-MM>|:nosupplier]` on `/analytics/records` (a pair sets the branch and supplier filters; a rise opens custom dates from the earlier record to today); `step:<status|all>[:<decision>]` with `reason=` and `waiting:<status|all>:<group|all>` on `/analytics/approvals`.
13. `analytics_spending` gains the subtype, quantity, price, goods and entry time rather than a new table. The migration clears its derived rows and the job's `last_finished_at` and `last_tick`, so the page says "being prepared" until the next run rewrites them.
14. Every list keeps the branch wall and the draft wall in its SQL (`stepsWhere()`).

Choices made during the build:

- The draft wall reads the order's live status and owner, not a copy in `analytics_steps` (the plan named a `status` column for it): a Draft taken back after a refresh is hidden at once, as 6.4a's orders list joins `orders`. The column was dropped before the migration was merged.
- "Waiting now" and its list are grouped in TypeScript by `waitingGroup()`, never by a copy of its edges in SQL; the open stays are few.
- `spendingWhere()` and `stepsWhere()` return SQL `true` when nothing filters (the Head with no filter), so a caller can always `and` them.
- The 6.3 constraint test of `analytics_spending` writes the five new columns in its direct insert (a requirement changed: the columns are NOT NULL); nothing it checks changed.
- The separator "·" between two texts is the message `analytics.joined` in the three languages (no text in a screen).

### 6.4c Analytics: Head, Managers (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: no `daysHeld()`, `daysOf() − 1`; cash held with no change marked Look first as a spec contradiction; the job skips Draft and Closed orders as Money with managers does), and those of the build. The Look first items come first.

1. **Look first** (a task split). 6.4c is split into 6.4c (Managers) and 6.4d (Warehouse), written into `docs/build-plan.md`; 6.4d keeps the Read line and takes the Warehouse block, its Done-when number and the phase 6 check by hand on the whole Head page. Phase 6 now has 13 tasks, the plan 104.
2. **Look first** (money). "Number of orders" and "average difference from plan" are of one set: the owner's orders whose buying ended (Done or Done short) in the period, the `analytics_outcomes` rows of Plan vs actual; a Not bought order is in neither.
3. **Look first** (money). The average is `averageSom(Σ difference, count)`, rounded once half up (away from zero: −2.5 → −3), signed; its change against the period before is in so'm only, none when either period has no ended order.
4. **Look first** (money). Cash held is the held half of 08's Manager's cash balance (`managerCashBalance()`, positive counts of orders not Closed), now; owed is not netted and not shown here. Held for: whole Tashkent days from the oldest `cashSince()` of the held orders to today, `daysOf() − 1`. The supplier filter keeps an order with a live record from that supplier.
5. **Look first** (spec contradiction; proposed `/spec-change`). Cash held has no change against the period before, against `10-notifications-analytics-reports.md` point 1 ("Every number shows its change against the period before"): a balance on a past date is kept nowhere. Proposed wording of point 1: "Every number of a period shows its change against the period before; a number of now (orders waiting now, cash held) has none."
6. **Look first** (money). A cancelled record counts on the Tashkent day of its cancel, under the order's current owner, whoever cancelled it; category the bought subtype's, supplier the trip's. Its total in the list is `actualTotal()` of the record read as live (`actualTotal()` leaves cancelled records out).
7. Rows: every Manager with an ended order or a cancelled record in either period, or cash held now, inactive ones marked; owners who are not Managers in one "Other owners" row, last.
8. Drill-down: orders and average open `/analytics/orders` with `manager=` or `owner=other`; cancelled records and cash held open the new `/analytics/cancelled` and `/analytics/cash`; no new `DrillKey`.
9. Two summary tables rewritten by `refreshAnalytics()`; `src/server` does not import `src/features`, so the job reads the money rows and records itself and calls the same domain functions; a database test keeps `analytics_cash` equal to `getMoneyWithManagers()`.

Choices made during the build:

- Migration 0039 clears the job's `last_tick` and `last_finished_at`, as 0038 does, so the page says "being prepared" instead of a rebuild time over the empty new tables until the next run.
- `/analytics/cash` reads its rows whole and pages them in TypeScript: the held total is `managerCashBalance()` of all of them, and the rows are few (open orders holding cash).
- The Excel heading of the cash list names it as "held now" instead of a period.
- Both new tables carry a composite foreign key `(order_id, branch_id)` to `orders(id, branch_id)`, so the branch the wall filters on is the order's (permission review, Should fix 3).
- The Managers block and its two lists are reachable by address by every `data.view` role inside its own branches, as 6.4a's and 6.4b's lists are (plan of 6.4, decided item 8); only the Head's page shows the block (permission review, Should fix 1, not changed).

### 6.4d Analytics: Head, Warehouse (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (correction 1 applied: the lock statement of `refreshAnalytics()` names both new tables), and those of the build. The Look first items come first.

1. **Look first** (stock value). Stock value per branch is Σ `stockValue(qty, average)` of its lines now, from `analytics_stock`, the same per-line formula as Stock on hand (5.2 decided item 1). The stock value report's own line for direct entries (09 Direct entry rule 5) is 6.9's.
2. **Look first** (spec contradiction; proposed `/spec-change`). Stock value, low-stock items and items with no movement are numbers of now with no change against the period before, against 10 point 1: a balance and an average at a past date are kept nowhere. Proposed wording of 10 point 1, replacing 6.4c decided item 5's: "Every number of a period shows its change against the period before; a number of now (orders waiting now, cash held, stock value, low stock, items with no movement) has none."
3. **Look first** (stock). Low-stock items are the lines `isLow()` (at or below the minimum, none never), the set of Stock on hand's "Low stock only"; a count per branch.
4. **Look first** (stock value). Use by department is the value of issues minus the value of returns of each department in the period, each movement at its own cost (`stockValue(|qty|, unit_cost)`), on the document's date; a reversed document is left out with its reversal, so a past period's number can change after a later reversal. Its change is `changeAgainst()` while the period before is above 0, else in so'm only (`useChange()`).
5. **Look first** (stock value). Value written off is Σ `stockValue(|qty|, unit_cost)` of the approved write-offs' movements in the period, on the write-off document's date (the typed date kept at approval, 5.11 decided item 8), as `/warehouse/documents` dates it; a reversed write-off is left out; a count correction is not a write-off.
6. **Look first** (filters). Branch and category filter every number; department filters use by department only; Manager and supplier do not apply to stock. The block says so in one line when such a filter is set.
7. **Look first** (stock). Items with no movement for 90 days hold stock and have no movement of any type in the 90 Tashkent days ending today (`ninetyDaysSince()`, 6.4b's `priceRiseSince()` renamed, one function for both); a movement's day here is the Tashkent date of its `created_at`, since receipts and purchase reversals have no document date.
8. Rows: every branch of the user with a stock line or a counted movement in either period, inactive marked, and "All branches" from the set's own sums; departments with a movement in either period, largest use first.
9. Two summary tables rewritten by `refreshAnalytics()` under its lock with `stockValue()` and `isLow()`; drill keys `stock:<view>` and `moves:<move>` and the two list pages `/analytics/stock` and `/analytics/moves`; `analytics_stock_moves` carries a composite key `(document_id, branch_id)` to the document, as 6.4c's order key.

Choices made during the build:

- `useChange()` lives in `src/domain/analytics.ts`, not in the query file: the permission registry counts every export of a query file as a query, and the rule is a formula (developer-rules.md rule 1).
- `analytics_stock` has a composite foreign key `(branch_id, variant_id)` to `stock_balances`, so a summary line is always a real stock line of its branch.
- A department's negative use is written "N so'm more returned" in its table.
- The stock list links each line to its item card (`/warehouse/items/<subtype>?branch=`), the movements list each row to its document.
- Permission review: use by department, a statement of its own, has its wall checked in the matrix without a filter (Must fix 1); `analytics_stock_moves` has a composite key `(department_id, branch_id)` to `departments`, so a row's department is of its branch (Should fix 1), added to 0040 before the merge. The movement keeps a single-column key: a transfer's TRANSFER_IN lands in another branch than its document, and such movements are not in the table.

### 6.5a Analytics: Principal (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (task split). 6.5 is split into 6.5a (Principal), 6.5b (Manager: My orders, My estimates, My cash) and 6.5c (Manager: Stock planning); phase 6 now 15 tasks, total 106. The Principal's branch test went to 6.5a, the "runs out in" unit test to 6.5c; 6.5b's Done-when (the Manager's own orders in the Manager's branches) is a test of the walls.
2. **Look first** (spec contradiction; proposed `/spec-change`). The Orders block's "by status" counts the orders first submitted in the period (`submitted_at`, kept at a re-submit) by their status now, against the same count of the period before. "Needed-by coming up", "overdue" and My approvals' "waiting now" are numbers of now with no change, against 10 point 1. Proposed wording of 10 point 1, extending 6.4d decided item 2's: "Every number of a period shows its change against the period before; a number of now (orders waiting now, orders needed-by coming up, overdue orders, cash held, stock value, low stock, items with no movement) has none."
3. **Look first** (approval order, history). "My average time to decide" is over the stays decided by this user, the actor of the Approve, Send back or Reject event, stored as `analytics_steps.decided_by`; an earlier or acting Principal's decisions are theirs (03 rule 3), and a stay entered under the old Principal and decided by the new one is the new one's. `averageHours()` of Σ seconds and count, its change in hours.
4. **Look first** (money). A product's spending in "top 10 products" is 08's Actual total of its records from `analytics_spending`, every subtype bought added to its product (07 Substitution); a product with spending only in the period before is left out.
5. "Coming up" is `isComingUp()` (new in `src/domain/order-steps.ts`): still waiting (`isOverdue()`'s statuses, Open only while buying), needed by today to `dueSoonUntil(today)`, overdue left out because the block shows it beside; "overdue" is `isOverdue()`. `ordersWhere()` mirrors both through the domain's lists and `dueSoonUntil()`.
6. "Waiting now" is the orders at Waiting for Principal of the user's branches by `waitingGroup()`, ignoring the period (6.4b decided item 8).
7. The Orders block reads the new summary `analytics_orders` (no Draft, a CHECK holds it) under `ordersWhere()`, with the draft wall on the live status as well; its numbers drill down to `/analytics/order-status`, which reads the same table and condition. `analytics_orders` has composite keys `(order_id, branch_id)` to `orders` and `(department_id, branch_id)` to `departments` (review correction 3).
8. "My branch by month against the period before" is 6.3's block as built; "by department" is 6.4a's `getHeadSpending()` breakdown.
9. The Principal's Warehouse shows stock value, low stock and use by department from `getWarehouse()`; no movement and written off stay on the Head's page; 6.4d's note on the Manager and supplier filters stays.
10. One branch: no per-branch rows; the filters of point 2 apply within it.

Choices made during the build:

- Migration 0041 drops and adds `analytics_steps_left_check` again with `decided_by` in it (Drizzle writes a changed CHECK so); the new check refuses everything the old one refused. The migration clears `analytics_steps` first, as 0038 did with its rows. The 0038 constraint test now writes a decider on its decided stays (**Look first**: a test changed because a requirement changed; nothing it checks was weakened).
- `movesOf()` of the test helpers takes an actor per move; `decided()` takes needed-by, first submit and progress.
- The `mine` key lists the stays the user decided at any step; only a Principal's page links to it. The Excel sheet `warehouse` of the Principal still holds the two Head-only columns (both are of the Principal's own branch).
- Permission review: the live draft wall of `ordersWhere()` is tested for a colleague Manager and Finance (hidden) and the Head (shown) (Should fix 1); the no-filter wall test also checks waiting now, the total and overdue (Should fix 2).

### 6.5b Analytics: Manager, My orders, My estimates, My cash (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: the estimate's prices and percent from the sums, the difference of the shown prices; every number tested against its list; decided item 5 given its `/spec-change` wording), and those of the build. The Look first items come first.

1. **Look first** (approval order). "Average time to full approval" runs from the first submit (`submitted_at`, kept at a re-submit) to the first entry into Open (`PURCHASING` from another status, by time then id), so time sent back to the Manager counts; counted on the Tashkent date it reached Open; `averageHours(Σ seconds, count)`, its change in hours. A later send back for correction or a Reopen does not move it; a rejected or cancelled order never counts.
2. **Look first** (approval order). "Share sent back" is of the approvers' decisions on my orders decided in the period (`analytics_steps`), its change in points; the 5 most common reasons by `reasonKey()`, as 6.4b decided items 9 and 10. Rejections are not in this block.
3. **Look first** (spec contradiction). "By status" counts my orders first submitted in the period by their status now, with the change, the reading and proposed wording of 6.5a decided item 2.
4. **Look first** (money). My estimates per product, over my priced records bought in the period (trip date): planned goods of a record = its quantity at its order's planned price, rounded once per record (`actualGoods()`); planned and actual price = `unitPriceOf()` of the sums on the same quantities; difference = shown planned price − shown actual price (08's sign: above 0 is paid less); percent = (Σ planned goods − Σ goods) ÷ Σ planned goods, half up to one decimal, from the sums; its change in points, none when either period has no record. Gifts and extras out; every subtype under its product; services count. Largest miss either way first; the page shows 10, the export all.
5. **Look first** (money; spec contradiction; proposed `/spec-change`). My cash is each of my orders not Draft and not Closed whose cash count is not 0, held and owed alike, with held and owed totals by `managerCashBalance()`, never netted; a number of now, no change. Proposed wording of 10, Manager, My cash: "The cash count of each of my orders that is not Closed and not 0, held and owed apart (08 Manager's cash balance)."
6. **Look first** (spec contradiction; proposed `/spec-change`). The three blocks read the user's own orders (current owner) whatever `manager=` the address holds; the Manager's page has no Manager filter. Proposed wording of 10 point 2: "Filters. Branch (within the user's branches), category, department, Manager (not on the Manager's page, whose blocks are the Manager's own orders), supplier."
7. The Manager's page shows only the Manager's blocks: the shared Spending block of 6.3 left it (the spec's Manager table has no Spending).
8. Drill-downs reuse the list pages with `manager=<me>`; new keys `approved` (`/analytics/order-status`) and `priced:<product|all>` (`/analytics/records`); My cash's own table is the list behind its totals, the held total also opens `/analytics/cash`.
9. `status-counts.ts` and `top-reasons.ts` hold the SQL two queries share; each takes conditions from a query that has already authorized the user.

Choices made during the build:

- The page's messages are under `analytics.my`, since `analytics.manager` is the Manager filter's label.
- The approved list adds the day into Open and the hours as two columns; its summary line is the count and the average of the listed orders.
- The sheet of reasons is named "Sent back, reasons": ExcelJS refuses a colon in a sheet name.
- **Look first** (a test changed because a decision changed). The browser test "a Manager's Analytics page has no Plan vs actual block" expected the shared Spending block on the Manager's page; decided item 7 removes it, so the test now expects My orders and no Spending block. Nothing it checked about Plan vs actual was weakened.
- `tests/helpers/analytics.ts`: a `Move` takes any action of 06's table (`OrderAction`), for the Settlement and Reopen moves of the refresh test.

### 6.5c Analytics: Manager, Stock planning (18.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (corrections 1 to 3 applied: at least 1 for every Low line after rounding; the department filter not on the rate; decided item 3 given its wording), and those of the build. The Look first items come first.

1. **Look first** (stock rule; open question 15). Suggested order quantity = `rate × 30 + (minimum ?? 0) − on hand`, half up to a whole unit, never below 0, and at least 1 for a Low line (`isLow()`); a net rate below 0 counts as 0. The rate is Σ issues − Σ returns of the 90 days that end today ÷ 90, of every department. Proposed `/spec-change` wording of 10, Manager, Stock planning: "Suggested order quantity is what lasts 30 days at the rate of the last 90 days, on top of the minimum, less the stock on hand, rounded half up to a whole unit; at least 1 for a Low item."
2. **Look first** (stock rule). "Runs out in" = on hand ÷ ((Σ issues − Σ returns of the 90 days that end today) ÷ 90), whole days half up; none when that use is 0 or below (stock 0 included); 0 when on hand is 0 and there is use. Reversed documents are left out with their reversal; write-offs and transfers are not issues. Proposed `/spec-change` wording of 00-definitions and 10: "“Runs out in” is current stock divided by the average daily issues, less returns, of the last 90 days, in whole days."
3. **Look first** (spec contradiction). On hand, Low, "runs out in" and the suggested quantity are numbers of now with no change; each month's use shows its change against the month before (the first month against the whole calendar month before it), the period's use against the period before, by `qtyChange()` (a percent only on a base above 0, else the difference in the item's measure). Proposed wording of 10 point 1, extending 6.5a decided item 2's: "Every number of a period shows its change against the period before; a number of now (orders waiting now, orders needed-by coming up, overdue orders, cash held, stock value, stock on hand, low stock, items with no movement, runs out in, suggested order quantity) has none."
4. "Each item" is a stock line (branch × subtype), goods only, every line of the user's branches; the Manager filter is not read: stock is the branch's.
5. Filters: branch and category for every number; department for each month's use and the period's use only, never for the rate, "runs out in" or the suggested quantity (review correction 2); the block says so when a department is chosen. Manager and supplier not read.
6. The 10 lines that run out soonest on the page (none last; ties Low first, product, subtype, branch); the export holds every line; quantities are never summed across items.
7. The Low tile counts the Low lines the block lists, which are `getStockLines("low")`'s (a database test and the matrix compare the two).

Choices made during the build:

- A line is listed when it holds stock, is Low, has a movement in the period, or has one in the 90 days; a movement only in the period before or the month before does not list it.
- The drill-downs reuse `/analytics/moves` with `key=moves:use`, the line's branch and `variant=`: a month opens its days inside the period, the period's use the period, "runs out in" and the suggested quantity the 90 days without the department filter. With `variant=` the list's summary adds the Σ quantity, the number clicked.
- The subtype filter of `movesWhere()` applies to `use` only, as the plan says.
- Permission review: the query added to `tests/permission-registry.ts`; a matrix case with a department of the branch and no branch filter (Must fix 1); the branch-wall case compares the Low count with the Low list (Should fix 1).

### 6.6a Analytics: Finance, Cash and Cash needed soon (19.10.2026)

The plan's decisions as the plan review of 18.10.2026 confirmed them (correction 1: a step's list keeps an order while its live status is any of the three pending ones, so the steps add up to the in-approval total; correction 2: the worked example and a paid-back-only case in the unit test), and those of the build. The Look first items come first.

1. **Look first** (task split). 6.6 is split into 6.6a (Cash, Cash needed soon; the age-band test) and 6.6b (Payments, Plan vs actual with purchases without a receipt, Settlement speed; Finance's branch-wall test and the read on the seed). Phase 6 has 16 tasks, the plan 107.
2. **Look first** (money). "Given, returned and paid back by month" sums the Cash given, Cash returned and Paid back rows of actions not cancelled, on the action's date, by Tashkent month, never netted; each amount and each month has its change (a month against the month before, the first against the whole calendar month before the period). Bank transfer and card rows are not cash. The Manager filter is the action's Manager.
3. **Look first** (money). Money with managers by age shows held and owed apart, never netted, from `analytics_cash`; an order's age is `daysOf({ first: since, last: today }) − 1` with `since` its first cash movement (`cashSince()`): 0 to 7 days (a `since` after today included), 8 to 30, 31 and more.
4. **Look first** (money). "Approved orders not yet paid": each Open order whose buying is still Open needs its planned cash (`plannedCashOf()`) less the cash handed to its Manager (given + paid back − returned, actions not cancelled), never below 0. A bank-transfer or card order needs none.
5. **Look first** (money; approval order). "Orders still in approval" are the orders at Head, Principal and Finance, each with its whole planned cash; a Returned order is not in approval. The block shows the approved total, the in-approval total with each step, and their sum. The stored status picks the step; the live status keeps the order in its stage.
6. **Look first** (spec contradiction). The age bands and Cash needed soon are numbers of now with no change. Proposed wording of 10 point 1, extending 6.5c decided item 3's: "Every number of a period shows its change against the period before; a number of now (orders waiting now, orders needed-by coming up, overdue orders, cash held, money with managers by age, cash needed soon, stock value, stock on hand, low stock, items with no movement, runs out in, suggested order quantity) has none."
7. Cash shows tiles and a month table, no chart: the bar chart draws one series.
8. The filters: branch, category (the planned subtype's), department, Manager (the action's for money, the owner's for the age bands and the need), supplier (an order with a live record from it, so an order in approval leaves under a supplier filter).
9. Finance's page keeps the shared Spending block until 6.6b.
10. Lists: `/analytics/money` (`money:<kind>[:<month>]`), `/analytics/cash-needed` (`needed:<all|open|approval>[:<step>]`), `/analytics/cash` with `age:<band>:<held|owed>`.
11. The need is three columns of `analytics_orders` (one CHECK, `cash_needed >= 0`), not a table of its own.

Choices made during the build:

- `moneyWhere()` reads the live status against Draft as `cashWhere()` does (permission review, Should fix 2), though a money row exists only from Open on.
- An Open order leaves the approved number as soon as its live status leaves Open or its live buying is no longer Open, before the next refresh.
- `daysOut()` moved to `features/analytics/days-out.ts`: a query file exports queries only.
- Tests changed because the table changed: the 0041 and 0042 constraint tests insert `analytics_orders` rows with the three new NOT NULL columns (0, 0, 0); nothing they check changed.
- Permission review: a matrix case with a department or a Manager id of the branch (Must fix 1); the wall case asserts the totals (Should fix 1); a draft-wall test of the age bands and of the money rows (Should fix 3); a line in `.claude/rules/tests.md`.

### 6.6b Analytics: Finance, Payments, Plan vs actual and Settlement speed (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (correction 1: every number of the three blocks, each row included, shows its change; correction 2: Finance's overspent and saved tables export the columns the page shows, `overspendBranches` and `overspendManagers`), and those of the build. The Look first items come first.

1. **Look first** (money). "Spending by payment type" is `paymentTotals()` over `analytics_spending_payments`, the Head's split. "Bank transfers by supplier" is the spending paid by bank transfer by the trip's supplier, plus a "No supplier" row, not the ledger's Bank transfer rows by `money_actions.supplier_id` (no screen fills that column). Proposed `/spec-change` of the Finance row of 10: "Payments | Spending by payment type; spending paid by bank transfer, by supplier".
2. **Look first** (money). Finance's overspent and saved by branch and Manager are `getPlanVsActual()`, the Head's numbers; Finance's view shows overspent and saved only.
3. **Look first** (settlement). A settlement runs from the first Send to settlement since the order last reached Closed to its next move into Closed, whoever closes; a correction does not end it; a Reopen starts a new one; a close by exact match with no send is none. Days are whole seconds ÷ 86 400, averaged by `averageDays()` (half up, one decimal); the period counts by the Tashkent close date; the change is the difference in days.
4. Purchases without a receipt: records not cancelled whose trip has no receipt file, any payment type, by purchase date, count and actual total.
5. **Look first** (a test changed because a decision changed). Finance's page drops the shared Spending block; the 6.6a browser test now asserts it is absent.
6. Settlement speed: the total and per branch; no per-Manager row.
7. Filters per source: `spendingWhere()`, `outcomesWhere()`, `settlementsWhere()` (supplier: an order with a live record from it).
8. Keys `noreceipt`, `payment:<TYPE>:nosupplier` (refused beside a supplier filter) and `settled`; export blocks `transfers`, `overspendBranches`, `overspendManagers`, `settlementBranches`, `settlements`.
9. `analytics_settlements` is its own table (an order can be settled twice); no draft wall: no move leads from Closed back to Draft.
10. The page was read on the seed as Finance at 1440 and 375 px, with seed passwords made up in the shell for the run.

Choices made during the build:

- `settlementStays()` lives in `approval-stays.ts` beside `approvalStays()`, to share the ordering of same-moment events and `secondsBetween()`.
- `averageHours()` and `averageDays()` share one private rounding (`averageIn()`), one formula (developer-rules rule 1; the plan review's "Not checked").
- The payment types on Finance's page show amount and change, no share: a share of so'm would need a money division no domain function has; the plan's "share" is left out.
- `getFinanceSpending()` holds the three spending numbers in one query (spec review of the plan, Should fix 5).
- Migration 0044 empties the spending tables and clears the job's tick, as 0038 to 0043; an upgrade test runs it over rows the 0043 refresh wrote (.claude/rules/database.md).
- Tests changed because the table changed: the 0036 and 0038 constraint tests insert `analytics_spending` rows with `has_receipt`; nothing they check changed.

### 6.7 Analytics as a PDF (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (correction 1: the link carries the address the page shows, as parsed; correction 2: the items renumbered).

1. **Look first** (open question 16). The analytics PDF follows the order list's plain PDF (05 Download 2 and 3): A4 landscape; the fonts for Uzbek and Russian built in; on every page the letterhead, the period, the summary's time, the filters used, who downloaded it and when, and the page number; the same queries and domain functions as the screen; the user's language; no signature lines. Proposed `/spec-change` wording for 10 point 4: "The whole page downloads as a PDF report, as the order list's PDF (05 Download 2 and 3): A4 landscape, the period, the filters used, who downloaded it and when on every page; each block's numbers and tables as on the screen, each chart as its table; no signature lines."
2. **Look first.** Charts print as their tables (the same numbers; Recharts does not render inside react-pdf).
3. **Look first.** The drill-down lists are left out: the page shows them only after a click, and each has its own Excel.
4. The tables are the Excel sheets of `download/sheets.ts`; their heading lines print once at the top of the file, and a table repeats only the lines it differs in (its name, and the "as of now" line of a number of now).
5. The headline numbers (the tiles) print as label, value and lines, from the same query result with the page's texts and `changeText()` and its variants, built in `page-report.ts`; `pdf.tsx` only draws.
6. The address is the page's, through `parseAnalyticsParams()`; without `branch=` the branch view of the cookie; drill-down keys ignored; a Manager's file names no Manager.
7. Its own route `/analytics/report`, file name `analytics-<YYYY-MM-DD>.pdf`, the business date from the clock.
8. The "Summary updated at" line prints under the period.
9. **Look first** (a known defect inherited). @react-pdf/renderer 4.9.0 loses letters in a PDF made after a Russian one in the same server process (report of 3.5). The analytics PDF uses the same renderer and fonts, so it carries the same risk in production. Not fixed here; the Russian test is its own file (`route-russian.db.test.ts`). The fix task proposed after 3.5 is still to be placed.
10. Prices prints the trend of the subtype the page shows (`variant=`, else the most bought).

Choices made during the build:

- `readAnalyticsPage()` moved from the page to `src/features/analytics/page-data.ts` and takes the branch cookie's value as an argument, so the route can pass the request's cookie (a route test runs outside a Next.js request). It asks `data.view` itself first (permission review, Should fix 1).
- The route reads the school name with `getSchoolName()`, which asks `profile.edit` (every role has it); the school name is no branch data (permission review, Should fix 2: noted, not changed).
- Finance's "spending by payment type" table is `headSpendingSheet(…, "payments")` over `getFinanceSpending()`'s `period`, `total` and `payments`: the same `paymentTotals()` the Excel link of Finance's Payments downloads through `getHeadSpending()`.
- A block's title is kept with its notes and tiles on one page, and a table's caption and column titles with its first rows (`wrap={false}`, `minPresenceAhead`).
- The test the plan named `page-report.test.ts` (unit) is a database test, `page-report.db.test.ts`: the page's queries need the database to give the numbers the report must repeat.

### 6.5a-2 The Orders total of the Principal's page opens its list (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (corrections 1 and 2 applied: the list's line shows the total's label for `status: null`; the key pattern changes for `status:all` only).

1. The key is `status:all` (`{ kind: "status", status: null }`), not the `period` key: `all` already names every value in `step:all`, `waiting:all` and `priced:all`; `period` stays a key of the records lists, and `getStatusOrders()` still refuses it. Its condition is `ordersWhere(actor, period, filters)` with no status term, the condition `getOrderStatuses()` sums its total over (`analytics_orders` holds no Draft, so the sum over `LIST_STATUSES` is that count).
2. The Manager's My orders total gets the same link, with the Manager filter set as its status counts: the same gap of 10 point 3 on the same list. It goes beyond the task's Build line, which names `principal-blocks.tsx` only.
3. No new interface text: the list's line is `principal.list.status` with the total's own label (`principal.orders.total`) as the status.
4. The PDF of the page (6.7) is unchanged: it holds no drill-down lists (6.7 decided item 3).

Choices made during the build:

- The matrix tests `status:all` with a department and with a Manager of the branch in two blocks, so each id of another branch is refused on its own (permission review, Should fix 1).

### 6.8 Reports: orders and spending (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its corrections applied (1: the Purchase register's category is the record's own bought subtype's; 2: a cancelled record's amounts are the domain functions of the record read as not cancelled; 3: per product is the order's planned product, read live; 4: the Order register's wall is tested for each role through `orderTotalsOnFilter()` and `orderDownload()`).

1. **Look first.** Planned vs actual and Spending read `analytics_outcomes` and `analytics_spending` under `outcomesWhere()` and `spendingWhere()`, so they always equal the Analytics page; the page shows the summary's time or that it is being prepared. The Order register (the order list's download) and the Purchase register read the live tables, so for up to 5 minutes an order's actual total there can differ from Planned vs actual and Spending.
2. **Look first.** The Purchase register lists every record of the dates, cancelled ones marked with their reason and in neither the count nor the total; read live, because the summary holds no cancelled record, no extra costs and no payment type. Goods, extra costs, total and the parts by payment type are `actualGoods()`, `actualExtra()`, `actualTotal()` and `paymentParts()` of the one record; the file puts the cancelled records on a second sheet, so a sum of the first sheet's total column is the total.
3. **Look first.** Planned vs actual holds the orders whose buying ended Done or Done short in the dates, by `orderOutcome()`, difference = planned − actual; Not bought left out; per Manager with one "Other owners" line; per product by the planned product.
4. The dates of each report: the Order register by submit date (`dates=submitted`), the Purchase register and Spending by the date bought, Planned vs actual by the day buying ended.
5. Default dates: the first of this month to today (Tashkent, injected clock); `from` after `to` is refused (the page goes back to the defaults, the route answers 404); a broken value is dropped.
6. Only the filters branch, dates and category.
7. The Order register's screen shows its count and planned total and links to the order list with the same filters.
8. One workbook per report: Spending five sheets, Planned vs actual three, the Purchase register two; `writeAnalyticsWorkbook()` added beside `writeAnalyticsExcel()`, which now calls it with one sheet.
9. Spending by supplier lists every supplier and one "No supplier" line, so each table adds up to the total.
10. No "change against the period before" on the reports.
11. The Order register's Download Excel is the existing `/orders/download/excel`; `/reports/download` serves the other three and answers 404 for `report=orders`.
12. 25 rows a page (11 rule 8).

Choices made during the build:

- The branch filter of /reports starts at "All my branches" from the address only; it does not follow the top bar's branch view, as /analytics does (6.3 decided item 9). The plan named only the address.
- The Purchase register reads every record of the dates in one statement and pages in the server after computing the count and total with the domain functions: a sum in SQL would be a second copy of the rounding (`CLAUDE.md` rule 1).
- A quantity is a new cell kind of the Analytics Excel writer (`quantity`, a number cell through `quantityCellValue()`), drawn by the PDF writer with the quantity formatter.
- The page links (`PageLinks`) are drawn by the page, not the feature views: a feature does not import from `src/app/`.
- Permission review: the route's own `data.export` check is in the permission matrix (`GET /reports/download with the branch filter` and `…, the branch wall in the SQL`), and each wall test of the queries checks that every table adds up to the total (Must fix 1, Should fix 1 and 2).

### 6.9a Reports: Stock on hand, Stock movements and Use by department (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its corrections applied (1: the Purchases line is compared with the Purchase register's goods of product records only, a service record beside them; 2: the REVERSAL rows lie in the dates and count in no total, named in the test and the code). The Look first items come first.

1. **Look first** (task split). 6.9 is split into 6.9a (the three stock reports, with the stock value Done when) and 6.9b (Price history, Money with managers, Approval speed): six reports are about 40 files, 6.8's four were 28.
2. **Look first** (reading of 09 Direct entry rule 5). The Stock on hand report's branch table carries, beside the value now, the value that came in during the dates by purchase and by direct entry on two lines of their own, each at its own cost: a value now cannot be split by source under one moving average per subtype and branch. Proposed `/spec-change` of 09 Direct entry rule 5: "The stock value report shows, beside the value now, what came in during the dates by purchase and by direct entry on lines of their own, each at its own cost, so they are easy to tell apart."
3. **Look first** (stock value source). The stock lines and their value are read live from `stock_balances`, as the Stock on hand screen (5.2), so report and screen agree at once; the Analytics Warehouse block can be up to 5 minutes behind. Use by department reads `analytics_stock_moves`, so it equals Analytics' use by department.
4. **Look first** (numbers of now). Stock value and the lines are numbers of now, the dates do not change them (6.4d decided item 2); the dates filter the two in-lines, the movements and the use, and the note says so.
5. **Look first** (one date and one value per movement). A movement's value is `stockValue(|qty|, unit_cost)`, signed; its date the business date of its source: a document's `doc_date`, a receipt's `purchased_on`, a REVERSAL the Tashkent day of its own `created_at`. Purchases counts RECEIPT rows not undone (= `actualGoods()` of the product records), Direct entries DIRECT_ENTRY rows not undone, Use by department ISSUE − RETURN of documents not Reversed; so the three reports add up to each other for the same dates and filters.
6. Stock movements lists every type, a reversal as its own row on its own day and the undone row marked; no table of totals.
7. Use by department's quantities are per subtype; its value per department and in all.
8. Only the filters branch, dates and category; category the product's.
9. Lines and movements 25 a page; the file holds all rows; the tables of totals are not paged.
10. No change against the period before.
11. Rows: every branch of the user with a stock line or a counted in-movement, inactive marked; departments with use, largest net value first.

Choices made during the build:

- The Stock on hand report lists the lines holding stock (quantity above 0); the Stock on hand screen keeps its 0 lines for the minimums (5.2 decided item 3), which a report of value does not need.
- The Excel writer's `quantity` cell takes a signed quantity ("-0.500" is −0.5), for the movements out and a department's negative net use.
- The address tests that used `report=stock` as an unknown report now use `report=prices`: `stock` became a report in this task (a requirement change, not a weakened test).
- The stock lines link to their item card, the movements to their document or order, as the Analytics lists do.

### 6.9b Reports: Price history, Money with managers and Approval speed (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its corrections applied (1: the Money with managers wall test checks that Finance of one branch sees a two-branch Manager's held and owed of that branch's orders only; 2: Price history's default subtype is picked inside the branch wall, with a test). The Look first items come first.

1. **Look first** (permission matrix). Money with managers as a report is under `data.view` for every role in its own branches (10 Reports: "Every report … respects the user's branches"; 03 matrix "See orders, stock and reports"); the `/money` page stays Finance and the Head (`money.managers`). The owner may narrow the report to Finance and the Head.
2. **Look first** (money source). Money with managers reads `analytics_cash` (refreshed every 5 minutes), so it equals Finance's Cash bands and the Head's Managers block; the page shows the summary's time; the live `/money` page can differ for up to 5 minutes.
3. **Look first** (numbers of now). Money with managers is a number of now; age is whole Tashkent days from `since` (`daysOut()`), bands `cashAgeBand()`, held and owed of each band by `managerCashBalance()`, never netted; the owners are `managerBalances()`.
4. **Look first** (Approval speed). The stays of `analytics_steps` decided in the dates; average hours per step is `averageHours()` of each set's sum and count, per branch and for all the user's branches, never a mean of the rows; orders still waiting are not in the report.
5. **Look first** (price source). Purchase prices are `analytics_spending.unit_price` above 0 under `spendingWhere()`; reference prices the `HEAD` rows of `price_history`, school-wide; the `PURCHASE` rows are not read (no branch, cancelled prices kept). This widens the reference-price history (every old price, the Head's note and who set it), until now shown only on the Head's Admin Prices page (`catalog.manage`, plan of 1.9, decision 4), to every role through the report: no branch data, but a wider view the owner should confirm, or narrow the note and the name to the Head (permission review of 6.9b, Should fix 1).
6. Price history is per subtype (`variant=`), else the most bought in the dates under the filters inside the wall; any catalog subtype may be named, its records stay those of the user's branches.
7. One chart point per record (date bought, then entry time), not a monthly average; the chart shows all records of the dates, the table pages them.
8. Reference prices: the one in force on the first day (newest before 00:00 Tashkent, by `created_at` then `seq`) and every one set in the dates, as a table, not a second chart series.
9. Category filters each report as its `*Where()` does: the bought subtype's (Price history), the planned subtype's (Money with managers, Approval speed).
10. Money with managers rows: `managerBalances()`'s blocks in its order, inactive owners marked; the orders 25 a page in that order.
11. Approval speed rows: every branch with a stay decided in the dates, by name, inactive marked; the stays newest decided first.
12. Excel: Price history two sheets, Money with managers three, Approval speed two; money whole so'm, hours the one-decimal text of the screen.
13. No change against the period before; no "waiting now".

Choices made during the build:

- The three views are in a new file, `components/more-report-views.tsx`, which imports `Table`, `CELL`, `NUMBER` and `itemName` from `report-views.tsx` (exported now): `report-views.tsx` would have passed 1 000 lines.
- The address tests that used `report=prices` as an unknown report now use `report=unknown`: `prices` became a report in this task (a requirement change, not a weakened test).
- A report table's card has `min-w-0`: the browser test at 375 px found the Spending grid's tables pushing the page sideways (on `main` too, depending on when the check ran); the table now scrolls inside its box, as the views' comment always said.
- Money with managers' sheets carry no dates line (`heading()` takes `null` dates), and the page's heading says "Now" in place of the dates.

### 6.10 Search (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its corrections applied (1: an order result's status is drawn by `RequestStatusLabel`; 2: each target page was read and opens under `data.view` for all four roles). The Look first item comes first.

1. **Look first** (branch wall). Search sees what the order list sees: orders under `data.view` with `branchFilter()` in the SQL and never a Draft (the list's draft wall); products and suppliers under `catalog.pick` (every role, global; catalogs hold no branch data).
2. A supplier result opens `/analytics/records?supplier=<id>`, which already filters by supplier for every role; no report gets a new filter.
3. A product result is one subtype (the product's name, with the subtype's when it is not the hidden default). Goods open Stock on hand searched by the product's name; a service opens its Price history (`variant=`).
4. Links carry no dates: each target page opens on its own default period.
5. Inactive products and suppliers are found, marked "(inactive)": 04 rule 2 takes them out of the pickers only.
6. 2 characters, 250 ms after the last key, at most 8 per group (`src/domain/search.ts`); orders newest number first, products and suppliers by name; any part of the text, any case, `%`, `_` and `\` literal.
7. The search button sits in the place 0.10b kept: a field with "Ctrl K" as plain text from 640 px (design system, Top bar), a 44 px icon button below; Cmd+K opens it on a Mac too.
8. The read is a `"use server"` function (`searchAction`) called from the dialog, as `searchDraftProductsAction`; it writes nothing, so it is not in the action wrapper.
9. Search ignores the top bar's branch view and looks in all the user's branches; the walls stay those of item 1.

Choices made during the build:

- The dialog keeps the newest answer with the text it answers; results show only for the text typed now, so neither an older text's results nor "Nothing found" show during the pause (`.claude/rules/ui.md`). The browser test checks it with Playwright's clock.
- No DOM test library is in the stack, so the unit test covers the shortcut and the button; typing, the arrow keys, Enter, Escape and the pause are in `tests/e2e/search.spec.ts`.

### 7.1 Transfer: send (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its corrections applied (1: the branch-close test leaves every other way in open: the sender sends its whole stock, neither branch has stock or orders, and the refusal names `transfers` only; 2: a receiving Manager with `TRANSFER_STOCK` off is still told, the Head is not). The Look first items come first.

1. **Look first** (branch wall). The receiving branch is any active branch other than the sender, also one the sender does not belong to; the choice shows code and name only, and is asked under `stock.transfer` on the sending branch.
2. **Look first** (stock rule). A transfer's lines carry no `unit_cost`; its `TRANSFER_OUT` stores the sender's average of that moment, which 7.2 reads for the `TRANSFER_IN`.
3. **Look first** (branch wall; 0.11 item 4). `TRANSFER_SENT` holds `actor`, `number` (TRF) and `branch` (the sender's code), with `branchId` the receiving branch; a TRF number is neither a request number nor an amount, so old notices show as written.
4. **Look first** (stock rule). A branch is not deactivated while a transfer from or to it is In transit (`setBranchActive`, field `transfers`). Proposed `/spec-change` of edge-cases/requests-and-approval.md, "The Head wants to close a branch": "Blocked while it has unfinished orders, stock above 0, or a transfer from or to it In transit."
5. **Look first** (branch wall). Until 7.2 only the sending branch sees the transfer (list, page, note); the notice's link to `/warehouse/documents/<id>` is "Not found" for the receiving Managers until then.
6. "Received by" is optional free text at sending, "—" on the note when empty.
7. "Sent by" is the document's maker.
8. Every active Manager of the receiving branch is told, whatever their rights; the Head is not.
9. An In-transit transfer has no cancel and no Reverse.
10. The issue's line rules: items in stock of the sender, active subtypes of active goods, at most 100 lines.
11. No audit row.
12. One note route and one PDF component for the issue and the transfer note (`download/document-note.tsx`, `queries/document-note.ts`, renamed from `issue-note`).

Choices made during the build:

- Both branches are locked FOR SHARE in the order of their ids before the products, and checked active under that lock.
- "Received by" sits on the first phone step, beside the branches and the date (`document-steps.ts` maps `toBranchId` and `receivedByName` to step 0); the last step holds the comment only.
- The branch-close message joins three reasons (`branches.blockedThree`) and adds that a transfer in transit is received first.
- The transfer note's route tests are in their own file, `transfer-route.db.test.ts`: in one process, a PDF rendered after another can lose glyphs (see the report, "For the owner"). That bug was already on `main` and is not fixed here.

### 7.2 Transfer: receive (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its two corrections applied (1: the decision notice of a "Lost in transfer" write-off never reaches a receiver outside the sending branch; 2: the database refuses a received quantity above the quantity sent). The Look first items come first.

1. **Look first** (stock rule). The short quantity comes back into the sender's stock at the line's `TRANSFER_OUT` cost (a `TRANSFER_IN` in the sending branch, on the same line), and the write-off "Lost in transfer" waits for the Head as any write-off: approved, the sender's stock falls by the short quantity once; refused, it stays counted at the sender. Without the return an approval would take it out a second time (09 Other documents, Write-off: "Stock changes only after the Head approves"). `decideWriteOff` is unchanged.
2. **Look first** (permission matrix). Receiving is the new permission `stock.receive_transfer`: the Head in any branch, a Manager in the receiving branch, with no Manager right (03 "Issue, return, transfer stock"; 09 "the receiving Manager confirms"; `TRANSFER_STOCK` is "Send transfers" only).
3. **Look first** (branch wall). A transfer is seen (list, page, note) by its sending and its receiving branch, In transit and after; any other branch gets "Not found". A transfer's lines read no stock (`inStock` null), so the receiver never sees the sender's stock.
4. **Look first** (stock rule). A received quantity is 0 up to the quantity sent, by the measure; above is refused (`aboveSent`) by the action and by `stock_document_lines_received_qty_sent_check` (migration `0045_transfer_receive`). A line of 0 writes no `TRANSFER_IN`.
5. **Look first** (stock rule; Decided ahead, question 19). Reverse of a received transfer: the Head only; `reverseDocument()` undoes every movement in its own branch at its own cost. The "Lost in transfer" write-off is its own document and is not touched. An In-transit transfer still has no Reverse.
6. **Look first** (branch wall; plan review correction 1). The shortage's write-off is made by the receiving user (the true history). Its decision notice goes to its maker only when the maker may see the sending branch: `notify()` already keeps only people of the event's branch, so no code changed in `decideWriteOff`; a database test proves a receiver outside the sending branch gets nothing and a Manager of both branches is told.
7. **Look first** (branch wall; permission review should fix 2). The receiving user makes a write-off request on the sending branch, a branch they may not belong to, whatever their WRITE_OFF_COUNT: 09 Transfer asks for it ("Any shortage becomes a write-off request … on the sending branch"), so it crosses the matrix row "Ask for a write-off" on purpose. The receiver gets the write-off's number and id back only when they see the sending branch; otherwise the screen says a request went to the Head (permission review should fix 1).
8. The write-off's `client_key` is a fresh uuid made on the server (nobody can take it first); its date is the receipt's Tashkent day, its comment the TRF number. Its number is taken before any balance lock (the order of `askWriteOff`). When the Head receives, it is approved at once and nobody is told (plan of 5.11, decided item 1).
9. The reports are not changed: a `TRANSFER_IN` keeps the transfer's date in Stock movements (plan of 6.9a, decided item 5).
10. "Received by" at receipt is prefilled with the sender's text, or the receiving user's name, and replaces it; the receipt has no date field.
11. Not a create: a second receipt is `wrong_status` under the document lock.
12. No branch lock (a branch with a transfer In transit cannot be closed) and no re-check that products are active, as at a write-off's approval.
13. Only the Heads are told, through STOCK_CHANGE_ASKED, and only when a write-off waits. No audit row.
14. The transfer note gets a Received column after receipt; the page shows Sent, Received and Short.

Choices made during the build:

- `transferShort()` in `src/domain/stock-documents.ts` is the one formula of the short quantity: `transferReceipt()`, the receive form's confirmation and the page's Short column read it.
- The receive input names each line by its id; the action refuses (`lines: notAllowed`) unless the ids are exactly the document's lines.
- 7.1's tests that said the receiving branch cannot see a transfer "until 7.2" now check that it can (the requirement of 7.2; decided item 3); a third branch still gets "Not found".

### 7.3 Stock count (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its two test corrections applied: a cleared line beside a kept one; 0 passes for an item in pieces), and those of the build. The Look first items come first.

1. **Look first** (status reading). A count is PENDING_APPROVAL from its start, the only waiting status of 14; counted quantities are typed while it waits (`countTypingAllowed()`). What makes a count "asked" is 7.4's. Proposed `/spec-change`, only if the owner wants a status of its own: 14 `stock_documents.status` gains `COUNTING`.
2. **Look first** (stock reading; data model). The stock at start is each item's `stock_balances.qty`, read after FOR SHARE locks of those balance rows in subtype order, stored in the line's `qty`; the line also stores `start_seq`, the `seq` of the item's newest movement then, for 7.4's "moved since the start". The difference is `counted − qty` (`countDifference()`). Proposed `/spec-change` of 14-data-model.md, `stock_document_lines`: `document_id, variant_id, qty, counted_qty, received_qty, unit_cost, start_seq`.
3. **Look first** (stock reading). The items of a count are the balance rows Stock on hand shows for that branch (and category), at 0 and of inactive products too; an item never stocked in the branch cannot be counted.
4. **Look first** (permission matrix). Typing is `stock.start_count` on the count's branch: the Head and every Manager of the branch with WRITE_OFF_COUNT, not only the starter. `/warehouse/counts` is Manager and Head; every role that sees the branch reads a count on its page.
5. **Look first** (stock reading). Two counts may hold the same item; 7.4's moved-check catches the second (no extra guard, D44).
6. Save sends the changed lines only; the same line, the later save wins.
7. The category is not stored; the date is the start's Tashkent business day.
8. No cap on the items of a count; a save request holds at most 5 000 lines.
9. No notification and no audit row; a waiting count does not block closing a branch.
10. Typing happens on the count's own page `/warehouse/documents/[id]`.

Choices made during the build:

- `seesStockCounts(role)` in `src/components/shell/menu.ts` answers which roles open `/warehouse/counts`: the roles whose menu has Warehouse (Manager, Head). The page answers Not found to the others; the Counts tab follows it.
- The page's "In stock now" column of a waiting document is now a write-off's only (review of the plan, must fix 3), so a count never shows the stock of now beside the stock at start.
- A positive difference is shown with "+" (`signedQuantity()`, `components/count-difference.ts`); a negative one keeps the formatter's minus.
- `listCounts` is its own query rather than the documents list with a type filter: it adds the counted/total per count.
- The same-moment test was run once with the FOR SHARE lock left out and seen to fail (the count never waited).
- Permission review, should fix 1: the save's target reads only a COUNT, so another document's id is "Not found" for every role, also a Manager with WRITE_OFF_COUNT off.

### 7.4 Count approval (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its three corrections applied: the items renumbered, the comment of `reverseAllows()`, the save's lock order named), and those of the build. The Look first items come first.

1. **Look first** (status reading). A count is "asked" when every line is counted (`countComplete()`): no Send step and no new status. Typing stays open while it waits (`countTypingAllowed()` unchanged); the Head approves only a complete count; the Heads are told when a save completes it. Proposed `/spec-change`, only if the owner wants a Send step: 09 Stock count gains "The Manager sends the count to the Head".
2. **Look first** (stock rule). The approval carries the counted quantities the Head saw (`seen`) and is `conflict` when a line changed since (`countSeenMatches()`), standing in for a version while typing stays open. A moved item (`countLineMoved()`: a movement of the branch and subtype with `seq > start_seq`) sends the whole count back: nothing posts; the moved lines get the stock and newest `seq` of now, their counted quantity cleared and `recount` set; the other lines keep their counts.
3. **Look first** (stock rule; cost). A CORRECTION moves at the average of the moment, up or down (`MOVEMENT_RULES.CORRECTION`); a found item in a stock of 0 comes in at value 0.
4. **Look first** (data model). New column `stock_document_lines.recount boolean not null default false`. Proposed `/spec-change` of 14, `stock_document_lines`: `…, start_seq, recount`.
5. **Look first** (permission matrix). Deciding a count is `stock.approve_write_off` (the one row "Approve a write-off or stock correction"). A Head's own count is approved on its page, not posted when complete.
6. **Look first** (approval reading). Refuse exists for a count (REJECTED, nothing moves) and is allowed on an incomplete count, so an abandoned count can be cleared.
7. **Look first** (Decided ahead, question 19). Reverse of an approved count: the Head only; a count that moved nothing is not offered Reverse, and `reverseDocument()` is unchanged.
8. A line with difference 0 writes no movement.
9. The approval takes, per line in subtype order, the product FOR SHARE and the balance FOR UPDATE before the moved-check; the save takes no balance lock (correction 3).
10. STOCK_CHANGE_ASKED to every active Head (kind COUNT, actor = who completed it); STOCK_CHANGE_DECIDED to the count's starter with approved or refused; `recount` to the starter and every active Manager of the branch with WRITE_OFF_COUNT on (permission review, should fix 1: a Head who started and approved, or a starter who lost the right, would otherwise leave nobody told). No audit row.
11. The Head's home block lists complete waiting counts with the write-offs, newest started first; "Show all" goes to `/warehouse/documents`.
12. The COUNT case lives once, in `postLines()` through `countCorrection()`, built on `countDifference()`; `lineMovement()` keeps refusing COUNT.
13. Approval does not re-check that products or the branch are active.

Choices made during the build:

- `countSeenMatches()` compares the quantities with decimal.js in `src/domain/` (no float), so "8" and "8.000" are the same.
- The Head typing an incomplete count sees the counting form with Refuse below it, not fixed (the form has its own bar); a complete count shows the Head the read-only lines with Approve and Refuse fixed at the bottom.
- `getStockDocument()` gives `canApprove`, `countAsked` and `countChanges` (the lines whose approval writes a correction), so the page computes nothing.
- The reverse dialog shows a count's corrections (signed), only the lines that moved.
- The same-moment test was run once with the approval's balance FOR UPDATE left out and seen to fail (the issue-first case posted −2 against 7).
- Permission review, should fix 2: a test sends another branch's count line id in `seen` with every other value valid: `conflict`, nothing written.
- 7.3's test of the save's result now also expects `completed: true` (the save gained the field; the requirement of 7.4, decided item 1).

### 8.1 Reminders and escalation (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its three test corrections applied), and those of the build. The Look first items come first.

1. **Look first** (open question 7). The reminder and the Head's notice repeat every day while the orders wait: each daily run counts what waits more than N hours at that moment. Proposed `/spec-change` for `06-approval-workflow.md` rule 9: "Reminders are sent once a day, and again every day while the orders wait."
2. **Look first** (approval order). The approvers of a step are `waitingFor()` of its status: every active Head for Waiting for Head; the active Principal of the branch; the active Finance users of the branch. A step with no active approver sends no reminder; the Head's notice covers it.
3. **Look first** (approval order). The Head's notice counts the orders of all branches at any of the three Waiting steps (`STUCK_STATUSES`) past `escalation_hours`; it links to `stuck=1`, the same set.
4. **Look first** (approval order). The wait is measured from the newest event that moved the order into its current status, strictly more than N hours, by `enteredCurrentStatusAt` of `src/features/orders/order-sql.ts`, shared with the list's `stuck=1`; no `isStuck()` copy in TypeScript.
5. **Look first** (approval order). The job runs once a day at the 00:00 Tashkent tick; a missed day runs at the scheduler's first round of that day. A notice comes between N and N + 24 hours after the order entered its step. The hourly alternative (at most one notice per approver and type per Tashkent day) was named for the owner. A time of day: 8.2.
6. One waiting notice per approver, `branchId: null`, its count over the recipient's own branches (the text names no branch). NEEDED_BY_NEAR is one notice per owner and branch, with the branch's code and `branchId`.
7. **Look first** (D46). "Needed-by date is 2 days away" is read as needed-by from today to today + 2, told every day, so a late submit or a failed run is not missed; an overdue order is not told. "Buying not finished" is the `STILL_DUE` set of `isOverdue()`, as `stillDueWhere()` in SQL. Proposed `/spec-change` for the row of 10 Notifications: "Needed-by date is 2 days away or nearer and the order's buying is not finished | Owner, once a day, grouped per branch".
8. Links: the reminder opens the list at the recipient's step (`status=PENDING_…`); the Head's notice `stuck=1`; the needed-by notice `branch=…&owner=…&due=soon`.
9. Three reads per run and one `notify()` per group of recipients with equal params and link.

Choices made during the build:

- The grouping is the pure `waitingNotices()` and `nearNotices()` of `src/domain/reminders.ts`; the SQL gives each waiting order two flags (past `reminder_hours`, past `escalation_hours`) and reads only orders past the smaller of the two.
- `stillDueWhere()` and `enteredCurrentStatusAt` moved out of `listWhere()` unchanged; the list's tests cover them as before.

### 8.2 Nightly check and weekly copy (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its three corrections applied), and those of the build. The Look first items come first.

1. **Look first** (open question 17). A mismatch is told as one bell notification STOCK_CHECK_MISMATCH `{ count }` to every active Head, every night while it lasts, and logged item by item (ids and numbers only). The check corrects nothing. Proposed `/spec-change` for `14-data-model.md`, Notes for the build, first bullet: "A nightly job recomputes it from the movements; any mismatch is told to every active Head as one bell notification with the number of items that differ, every night while it lasts, and logged item by item. The job corrects nothing." And a row in `10-notifications-analytics-reports.md`, Notifications: "The nightly stock check found a mismatch | every active Head, once a night".
2. **Look first** (stock rule). Recompute = per branch and subtype, the movements in `seq` order through `nextBalance()` from 0 and 0: average types without a cost, every RETURN with `emptyCost` = its stored `unit_cost`, every other type (REVERSAL included) at its stored cost. A mismatch: the quantity (exact decimal) or the average differs, the replay goes below 0, movements with no row, or a row with no movements that is not 0 and 0. `balance_after` of each movement is not checked.
3. **Look first** (new dependency). `postgresql-client-17` from apt.postgresql.org in the image's run stage, added by the script of Debian's signed `postgresql-common` package; PostgreSQL Licence; the build stops unless `pg_dump --version` says 17.
4. The copy goes to the files bucket under `backups/`; every copy is kept. No route serves `backups/`.
5. The check daily at 03:00, the copy on Sunday at 04:00, Tashkent time; the reminders stay at 00:00.
6. The copy keeps the Job shape of 0.13; it holds its row while `pg_dump` runs. A repeat for one tick writes the same key.
7. The dump is held in memory before the upload.
8. `database_copy` is in `JOBS` only in a production server with `S3_BUCKET` (`copyRuns()`); its first deploy copies for the last Sunday at once.
9. A failed copy is a failed tick and a log line, no notification.
10. `pg_dump` gets the address as PG* variables; with `DATABASE_CA_CERT`, `verify-full` against a temporary file of mode 600, removed after.
11. STOCK_CHECK_MISMATCH links to `/warehouse/stock` (the plan said `/warehouse`; Stock on hand is `/warehouse/stock`), with no branch.

Choices made during the build:

- The file key's Tashkent date is made in `scripts/db-copy.mjs` (`copyKeyOf()`, Intl with `Asia/Tashkent`), because the image's console runs the script without the TypeScript domain; a unit test holds it equal to `businessDate()` across midnight and the year end.
- `pg_dump`'s own error text is never printed (it can name the server): only its exit code.
- No CI step runs the copy (review correction 1); `tests/image-files.test.ts` keeps the install in the run stage and the script in the image. Locally, `pg_dump` 17 of the `postgres:17` image copied the local database and `pg_restore` 17 restored it into an empty one.
- Permission review, should fix 3: STOCK_CHECK_MISMATCH has `branchId: null` and a count over every branch, which is right only because its recipients are the active Heads; the database test with a Manager of two branches, a Principal, Finance and an inactive Head is the guard. A later all-branch notice to another role must carry a `branchId` per branch.
- Permission review, should fix 1: for 9.4 to 9.6, the copies hold password hashes and live session rows, and sit in the files bucket, so its R2 token and any public access reach them too; a bucket of their own, or a token scoped to `backups/`, is the safer production shape. A test holds that no download key reaches `backups/`.
- The managed database's `idle_in_transaction_session_timeout` could not be read from here; PostgreSQL's default and the local server's is 0 (none). The held transaction of the copy relies on it.

### 8.4 Translation pass (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its three corrections applied), and those of the build. The Look first item comes first.

1. **Look first** (a spec text that should change). The currency word stays `so'm` with an ASCII apostrophe in `format.currency` of all three files, as `11-screens-and-ux.md` rule 10 writes it and decisions 0.5 item 2 kept it; every other Uzbek text writes `soʻm`. Proposed `/spec-change` for rule 10: "Money as `1 250 000 soʻm` (Uzbek oʻ, U+02BB)", then one value in each file.
2. "Consistent" is the check of `scripts/check-translations.mjs`: every value a valid ICU message; the same argument and tag names and the same `select` options in all three (the kind of an argument does not count: an Uzbek count without a plural is good Uzbek); no `#` outside a plural; every plural has `other`; a Russian plural names `one`, `few`, `many` and `other`, or only `=n` forms and `other`; no Cyrillic in Uzbek and English; a Cyrillic letter in every Russian value with words outside its arguments; the keys of `SCRIPT_EXEMPT` (language names, logo, currency, shortcut, number placeholder, `analytics.excel`) leave out the script checks.
3. Uzbek writes oʻ/gʻ with U+02BB and the tutuq belgisi with U+02BC (`uzbekApostrophes()`); "Oʻzbekcha" in `languages.uz` of all three files. On import, an ASCII or curly apostrophe between letters in the Uzbek column becomes the right sign before the check, so the owner can type `'`.
4. Import: a cell counts as corrected only when it differs from the hidden "Exported" sheet; a corrected text that also changed in the files since the export is a conflict; a key no longer in the files is skipped when unchanged and refused when corrected; an empty cell, a key twice, a changed header, or a check problem in the result refuses the whole file and nothing is written. The English column is never read back. The files are written as `JSON.stringify(…, null, 2)` plus a newline.
5. The owner's file is `docs/translations.xlsx`, committed; `npm run i18n:export` makes a fresh one. No CI check keeps it current; item 4 keeps an old copy safe.
6. The ICU reader is in `scripts/check-translations.mjs`, not `@formatjs/icu-messageformat-parser` (a new direct dependency). A unit test formats every value of the three files through next-intl's `createTranslator` with invented arguments and fails on any error or a printed `#` (review correction 1).

Choices made during the build:

- Russian plurals: `one`/`few`/`other` got `many` equal to `other`; `one`/`other` with `#` got `few` and `many` equal to `other`; `one`/`other` without `#` (it/they) became `=1`/`other`, since Russian `one` is also 21, 31 ….
- Three values gained the argument the others had: `warehouse.count.decision.recount` (uz, printed a literal `#`), `orders.moves.result.REOPEN_BUYING` and `ACKNOWLEDGE_OVERSPEND` (uz, ru). `orders.ticked.failed` (ru) reads "не принял дату и обновлён" per form.
- `.gitignore` refuses every `*.xlsx` (real school data); `!docs/translations.xlsx` lets the owner's file in: it holds interface texts only.
- The workbook's created and modified stamps are a fixed moment (review correction 2).

### 9.1a Acceptance run: orders to approval (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its three corrections applied: S6 clicks Reject through; S5 asserts the highlight; S14's comment names the database test that proves the lock), and those of the build. The Look first item comes first.

1. **Look first** (a task split). 9.1 is split in four: 9.1a orders to approval (S5, S6, S7, S14, S17, S18, S19), 9.1b money and settlement (S1, S2, S3, S9, S12, S13, S16, S20), 9.1c purchasing and warehouse (S4, S8, S10, S11, S15), 9.1d the accessibility pass (the former 8.3, D47). The groups are the "You can try" column of `16-build-order.md`; 7 + 8 + 5 = 20. 9.1d comes last, as its "S1 with the keyboard only" needs 9.1b's S1.
2. "All 18" in 9.1's Done-when is a miscount of the build plan: `15-quality-and-acceptance.md` says "the 20 scenarios" and 9.1's Build line "S1 to S20"; the parts cover all 20. S8 and S14 get browser tests too: both sides load their screen before either acts.
3. S14's "first orders of 2027": the `next dev` server of Playwright keeps the real clock, so the browser test asserts `<code>-<yy>-0001` to `0004` in the current year in a branch made for the attempt; the start of 2027 at 0001 and the counter's lock stay proven by `submit.db.test.ts` ("S14").
4. "Branch code CHL": the e2e database is not seeded; the scenarios use EA, and a new branch `Z` + three random capitals for S14 and S17, made per attempt (the e2e database is kept and CI retries twice), with invented Managers made per attempt. S18 and S19 use a new product per attempt in EA.
5. A scenario's end is asserted on the screen and, where the screen shows a formatted value, in the database too (S14's numbers, S19's statuses and events).
6. S5, S6 and S7 stay in the files of the tasks that wrote them; `tests/e2e/acceptance-orders.spec.ts` holds S14, S17, S18 and S19.

Choices made during the build:

- S17's orders are written as drafts with their creation day and submitted by the Manager in the grid: the download's Head stamp counts from the order's Submit event (`orderSteps()`), so an order written submitted straight into the table shows no Head. The Head approves A on its page.
- S19's three orders of 10 are written as complete drafts and submitted in the grid one at a time; the draft merge of 05 Drafts 2 is typed through the picker for a second department, so the merged draft is none of the three (review of the plan, must-fix 1).
- The four new scenarios and nothing else run with `test.slow()`: each signs in as two to four people.
- The `e2e` job of `.github/workflows/ci.yml` may run 30 minutes instead of 20: on `main` at 62e88a7 it took 17.5 minutes (Playwright 14.3), and the twenty scenarios add whole flows at two widths. The `checks` job keeps 20. The job's name and steps are unchanged (Decided ahead 0.3, item 1).

### 9.1b Acceptance run: money and settlement (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (none of a Look first kind; its three corrections applied: buying is finished on the screen before every close or send, asserted as `[data-progress]`; S12's percent comes from `overspend()` and the acknowledgment is read in `order_settlements`; `withGuardLock()` releases the lock and restores the amount in a `finally`), and those of the build.

1. Every scenario starts from complete drafts written by the fixture and clicks everything after: Submit, the three approvals, the purchases, the closes and the settlement. Every event, version and money row comes from a real action.
2. "Branch code CHL": each attempt makes its own branch (`Z` + three capitals) and its own Manager, Principal and Finance user (a second Finance user for S20); S20's orders get the numbers Submit gives (`<code>-<yy>-0001` to `0004`).
3. A Head made per attempt does the approvals, S3's look, S12's setting and acknowledgment and S16's switch; the scenarios' people read English and the asserted words come from `en.json`.
4. The guard amount is school-wide: S12 and the guard-amount test of `settings.spec.ts` hold one advisory lock (`withGuardLock()`), and the amount found at the start is written back (the default 100 000 when no row exists, as rows are never deleted). Both tests have a 240-second limit for the wait.
5. S12: 100 × 5 800 + 20 000 = 600 000, 80 000 over (15.4%); the percent stays at its default 10.
6. S12 is two orders bought the same way, one closed at 100 000 and one at 50 000.
7. S9: the cash order bought 100 × 5 100 + 20 000 (Pay 10 000, net "Finance pays …"), the card order 100 × 4 600 + 20 000 by card (the card block's "Left 40 000"); Close is pressed once before both are handled and once after.
8. S13: Mark not bought with a reason, then Send to settlement; no movement and no balance of the subtype.
9. S16: no Close on the order page or the list bar; the server's refusal stays the matrix's.
10. S20: Finance A's Approve dialog is open with the four before Finance B approves the fourth on its page; A's refusal names it, nothing of A is saved, the fourth's Cash given row is B's.
11. S1's stock is read on the stock page and in `stock_balances`; cash counts through `countOf()` (08's formula, extra costs of type Cash included) and, after a settlement, on the screen.
12. The fixtures of 9.1a moved to `tests/e2e/acceptance-fixtures.ts`; `newManager()` stays as a wrapper.
13. `test.slow()` for six scenarios; S20 180 seconds, S12 240 seconds. The `e2e` job keeps its 30 minutes.

Choices made during the build:

- The spec's asserts wait up to 15 seconds (`expect.configure` in `acceptance-money.spec.ts`): a result line follows a server action on the `next dev` server while the other project runs.
- After a settlement save the test waits for the refreshed count of 0, and after the card confirmation it reloads, before Close: Close sends the versions the screen holds, and the app rightly refuses a stale one. Seen as "Changed a moment ago" under four local workers.

### 9.1c Acceptance run: purchasing and warehouse (19.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them (its three corrections applied: S10 asserts the green labels and Done before the missing Close; S8 reads one ISSUE movement and A's document of 5; S11 reads the whole `errors.field.stockShort` text, the order still Open and no cancel movement), and those of the build. The Look first items come first.

1. **Look first** (a reading of a stock rule). S4's "Monday … Friday": both parts are bought today in the browser, as Date bought may not be before the Finance approval (07 Purchase record) and the approval is clicked on the real clock; the days stay proven by `issue-scenarios.db.test.ts` with the injected clock. "Stays Open" is `PURCHASING` with progress Open (07 Order progress).
2. **Look first** (the approval order and the stock CHECK). S8's "together": both sides stand ready (dialog open, quantity typed) before either acts; A acts, then B, so each side's message is known. The real lock collisions stay in `approve.db.test.ts` and `issue-same-moment.db.test.ts`. The orders are at version 3 afterwards (draft 1, Submit 2, A's Approve 3).
3. **Look first** (an exact-match rule). S10's "Manager cannot close alone": no Close on the order bar or the list bar, with every other condition of 08 Exact match true (green labels, Done, cash count 0, no extras, the planned payment type) and the close-alone right read as on; the server's refusal is `isExactMatch()`'s tests. "Finance reviews it" is not clicked.
4. S4, S8, S10, S11 live in `acceptance-warehouse.spec.ts`; S15 stays in `direct-entry.spec.ts`, which already ends as S15 says, with the +200 now read in `stock_balances`. The 3.6 test of `purchase.spec.ts` stays as it is.
5. Every scenario starts from complete drafts and clicks Submit, the approvals and the purchases, with its own branch and people who read English (9.1b items 1 to 3); S8's last 5 notebooks come from `stockIn()`, a receipt written as `postMovement()` writes it.
6. S4 and S11 use the plan of section 8 with its delivery; S4 pays it with the first part. S10 has its own plan, 100 × 2 000 in cash and no extras.
7. S8's two Heads and second Manager are made per attempt.
8. S11's explanation is read in English from `errors.field.stockShort`.
9. The flow helpers moved from `acceptance-money.spec.ts` to `acceptance-fixtures.ts`; 9.1b's tests keep every step and assert.
10. S15's server refusal stays the database test's, as 9.1b item 9 for S16.
11. The `e2e` job keeps its 30 minutes.

Choices made during the build:

- S4's second part needs no step to take the delivery off: Same as planned fills only the 40 still lacking and no extra cost after a first part (`sameAsPlanned()`), and the test asserts both on the form. The plan had said the row would be taken off. A part below the plan asks no comment (`purchaseCommentNeeds()`, plan of 3.3).
- The issue form's department is chosen inside `expect(...).toPass()` until Received by is prefilled: opened by `page.goto()`, the form could lose a choice made before it hydrated.
- The step buttons are named with `exact: true` (the `next dev` tools button matches "Next"), and the refusal toast is read inside the region "Notifications", where its text is once.
- **A fix to the order list** (S8's "The other gets a clear message"): Head B's refused Approve showed above the list, and the refresh after it swapped the list for the empty page when the refused orders had been the list's last ones, so the refusal disappeared. `OrderList` now draws the empty page itself, so the refusal stays above it until closed. Found by the whole suite, where S8 failed once; S8 now waits for the empty page before it reads the refusal, and fails without the fix. No permission or query changed.
- S8's direct receipt of 5 is recorded as the Head's (`stockIn(…, scene.head)`): no Manager can receive stock without an order (permission review, should-fix 1).

### 9.1d Accessibility pass (20.10.2026)

The plan's decisions as the plan review of 19.10.2026 confirmed them, with its four corrections applied (one test per screen and role, so the shards share them; the dark pass asserts the dark canvas; plain links get weight 600; the report names what the design system asks that no task checks):

1. **Look first** (a new dependency). `@axe-core/playwright` 4.14.0, a dev dependency: MPL-2.0, published 15.10.2026 by Deque, its one dependency `axe-core ~4.14.0` already in the tree; `npm audit` with it installed lists only the 13 findings already on `main`, none in it.
2. **Look first** (a task split: none). One pass over existing screens.
3. A serious finding is axe's `serious` or `critical` on `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; moderate and minor go to a Playwright attachment, never stdout (D37).
4. Every screen in light and dark by colour-scheme emulation; the dark pass asserts no kept light choice and the dark canvas.
5. One role per screen; home, analytics, the order page (four states), money, warehouse stock and orders as each role that draws different parts.
6. 44 × 44 at 375 px on the hit area; a control in a label is measured by its label; a link inside a `<p>` is exempt.
7. The per-screen Tab walk (focus wraps to the first element, a visible indicator on each stop, `<main>` within 40 presses, no trap) plus S1 by keyboard.
8. S1 by keyboard sets up the branch, people, product, department and the complete draft with the fixtures, as 9.1b's S1 does.
9. Orange plain links become `text-link`, weight 600; no colour token changes.

Choices made during the build:

- **Look first** (a test changed because a requirement changed). `home.spec.ts` finds Finance's entry by the owner and branch it shows: the link's `aria-label` "Open the orders of {name}, {branch}" did not hold its visible text (WCAG 2.5.3 Label in Name), so the label and its key `home.finance.openOrders` are gone. `bell.test.tsx`: above 99 unread the bell is named "Notifications, 99+ unread" (new key `notifications.bellMany`), the number it shows; the exact count stays in the name up to 99.
- **Look first** (a plan line changed). S1 by keyboard starts from the fixture's complete draft (decision 8) instead of the Manager typing it into the grid, which the plan's "What will exist" had said: S1 begins at the approvals, and drafts typed by keyboard are proven by `drafts.spec.ts`'s Done-when test.
- Text that only decorates a control (the avatar's initials, the search button's "Ctrl K") is drawn by CSS from a `data-` attribute, so it stays out of the control's name. The profile link of the menu is named by the person's name and role it shows; in the rail that text is `sr-only`.
- At phone width every link in a table cell or row heading is 44 × 44 by one rule in `globals.css`; every link with `inline-flex min-h-11` got `min-w-11`; the analytics big numbers are `inline-flex min-h-11 min-w-11`.
- A table wrapper that scrolls sideways gets `tabIndex={0}` and the focus ring (no region role: a named region would match a field label in the tests' `getByLabel`); the hidden charts set Recharts' `accessibilityLayer={false}`, as their tables carry the numbers.
- Textareas inside a `Field` take its id (the catalog, product, issue and count forms); the photo inputs, opened by their button, are `tabIndex={-1}` with the field's label.
- `orders.extras.open` starts with the `{sum}` the button shows; the group row's name holds the branch code it shows; a space now separates the two spans, as axe reads text without layout.
- The money page is checked as Head and Finance: the Manager has no money page.
- The Tab walk's outer stop is one press per focusable element plus 100 (the Head's Analytics on a database many tests have filled holds over 2 000 links); a date field's parts are one stop.
- S1 by keyboard waits for every finite animation to end before each axe check (a dialog fading in read as low contrast in CI), and presses Enter again from the password field until home opens (a first Enter can come before the form hydrates).

### 9.2 Speed (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them, with its six corrections applied (the wait for `aria-busy` placeholders, the scheduler off, prefetch aborted, the fill run through Vitest, `docs/speed.md` outside Prettier's reach, the source tests read sources only and catch an address in a variable):

1. **Look first** (quality bar). "Any page opens in under 1 second" is the slowest of three warm loads after one warm-up, from navigation start until the load event has ended and no `aria-busy="true"` area is left, at 1440 px, on `next start` with the database on the same machine. The office connection and cold loads after a deploy are the owner's check during the trial.
2. **Look first** (volume). Three school years, four branches, 30 people, 36 000 orders (3 000 per branch per year): 235 000 order events, 111 000 actions, 33 000 purchases, 62 000 stock movements, 25 000 stock documents, 35 000 money rows, 114 000 notifications, 800 products with 2 000 subtypes. The plan estimated 100 000 movements and 200 000 notifications; the fill's own proportions gave fewer. Sizes are `SPEED_SIZES` in `tests/speed/fill.ts`.
3. **Look first** (rule 12, filter column). A filter column is a column a list's or a page's `where` or `order by` reads, on every table; one read only through an indexed key is listed with that index in `FILTER_COLUMNS` of `tests/indexes.db.test.ts`. Added: `orders (branch_id, needed_by)`, `stock_documents (branch_id, created_at)`, and `name` of branches, units, categories, extra cost types, companies and products, `users.full_name`.
4. **Look first** (rule 12, analytics). Every number, chart and block reads the summary tables; a drill-down list reads the orders by the summary rows' ids; the draft wall and the live status are read from `orders` by id. Four blocks (`my-cash`, `managers`, `finance-cash`, `my-estimates`) join `orders` by the summary row's id for its live status or plan: not moved, as their tests would change; listed in `tests/analytics-summary-reads.test.ts`.
5. **Look first** (task split: none). One session built it.
6. The analytics refresh has no bound of its own: one refresh takes 23 to 27 s on this volume, far under its 5 minutes.
7. The measurement is not in CI; CI runs the small fill, the index test and the source tests.
8. The fill writes rows directly, numbers from `src/domain/` (`orderTotal()`, `actualTotal()`, `progressAfterBuying()`, `isExactMatch()`, `orderCashCount()`, `approvalCashRows()`, `settlementRows()`, `settlementCashRows()`, `nextBalance()`, `orderNumber()`, `documentNumber()`); the nightly stock check finds no mismatch on it.
9. The fill is TypeScript under `tests/speed/`, run by Vitest (`vitest.speed.config.mts`, `npm run speed:fill`), which `playwright.speed.config.ts` runs first.
10. The speed database has its own invented people (`speed_head`, `speed_manager_01` …) with one invented password.

Choices made during the build:

- **Look first** (11 rule 8, a page size changed). The Analytics drill-down lists showed 50 rows a page (`RECORDS_PAGE_SIZE`, task 6.3); rule 8 says 25. Found by the speed run's paging check; now 25, with a unit test. Still at 50: the item card's movements (`ITEM_CARD_PAGE_SIZE`, decisions 5.3 item 6) and the change history (decisions 0.9 item 12); proposed for the owner: both to 25 by rule 8, or `/spec-change` of rule 8 to name them.
- **Look first** (11 rule 5, placeholders). Seven sections had no `loading.tsx`. Adding one to a section whose pages answer another role with a 404 makes Next.js send the page frame with status 200 before the page's `notFound()` runs, and the browser tests that read the 404 failed (users, settings, subtypes, suggestions, catalog, prices, departments, import). So only Profile got one; branches, catalog, prices, settings, suggestions and users keep none, named in `tests/placeholders.test.ts` (each opened under 400 ms). The sections that already had a `loading.tsx` (orders, money, warehouse, notifications, reports, analytics) answer "Not found" with status 200 already; their tests read the text, not the status.
- **Look first** (indexes replaced). Thirteen single-column foreign-key indexes became the composite index of their whole key, led by the same column (migration `0049_speed_indexes.sql`): a query on the column alone still uses it.
- JIT is off on the app's connections (`-c jit=off` in `src/server/db/client.ts`, beside `timezone=UTC`): on the Analytics counts it spent about 270 of 310 ms compiling. Whether a connection pooler in front of the managed database passes the option on is the same open point as for `timezone` (progress of 0.2, for 0.16).
- Eight Analytics totals (`finance-cash`, `finance-spending`, `head-spending`, `top-products`, `spending`, `plan-vs-actual`, `settlement-speed`, `order-statuses`) read their whole summary table and filtered inside the sums; they now have the `where (now) or (then)` that `spending.ts` and `status-counts.ts` already had. Finance's Analytics went from 1 006 to about 400 ms.
- The measurement counts each load's statements between two marker statements of its own connection in PostgreSQL's log (`log_statement = 'all'` on the speed database only); without Docker the column says "not read".
- `next start` needs `BETTER_AUTH_SECRET`: the speed config makes a throwaway one for the local run on invented data, never written or printed; the local `.env`'s is used when set.

### 9.3 Monitoring (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them, with its two corrections applied (the frames come from the `at …` lines only, never the stack's first line, `cause` or the request; `docs/monitoring.md` says the environment tag reads `SEED_DEMO_DATA`, so 9.4 keeps that name):

1. **Look first** (Done-when reading). "A forced error in a production build … in a test" is read as the code path a production build runs: `src/monitoring.test.ts` sets `NODE_ENV=production` and the Node.js runtime, passes the forced error of the real `/health` route to the real `onRequestError` and the real client, with `fetch` stubbed. No `.github/workflows/` change: the Build line asks for no CI step (`review-pr`, loosening exception 3). Limit: no `next build` output is exercised; the owner's check during the trial proves Next.js's own call of the hook. Wording for a later build-plan task, if the owner wants it in CI: "Add to the `image` job of CI: the image started with `ERROR_REPORT_DSN` pointing at a stub receiver and `FORCED_ERROR=on`; `/health?forced-error` answers 500 and the stub receives the event."
2. **Look first** (a dependency avoided). No `@sentry/nextjs`: our own client (`src/server/error-report.ts`) sends one event in Sentry's documented envelope format with `fetch`, only the fields listed in `docs/monitoring.md`.
3. "If the owner wants it": the client is built and stays off until the owner types `ERROR_REPORT_DSN`; the Sentry and UptimeRobot accounts are the owner's, after 9.4.
4. Server errors only; browser errors are not reported.
5. The message sent is `describeForLog()`'s (moved to `src/server/log-error.ts`, still exported by `action.ts`); no header, cookie, body, query string or user is sent.
6. The action wrappers and the scheduler report without awaiting the send; `onRequestError` awaits it. A send never throws and is given up after 2 seconds.
7. Every line of the nightly stock check's mismatch is also an error event (`StockCheckMismatch`).
8. The environment is `trial` while `SEED_DEMO_DATA` is set, `production` otherwise (D52).
9. The uptime check is UptimeRobot on the existing `/health`, every 5 minutes.
10. The forced error is on `/health`, only with `FORCED_ERROR=on` and the query `forced-error`; no new route.

Choices made during the build:

- `tests/helpers/error-reports.ts` (`catchErrorReports()`) sets an invented DSN and stubs `fetch`, so every catch site's test runs the real client; the send starts synchronously, so an unawaited report has already reached `fetch` when the action returns.
- A send that is refused (not 2xx) or fails writes one log line with the status or the error's name only, never the DSN.

### 4.10b Money corrections from issue #9 (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them, with its three corrections applied (the cancel tests advance the clock between every step and `movedSince()` says a move at the write's exact moment is taken as after it; the prefill tests cover a row after a Cash returned and after a Paid back; `cashNeeded()`'s tests unchanged). The Look first items come first.

1. **Look first** (money, prefill). "Already given" is `cashHanded()`: given + paid back − returned, rows not cancelled; a Paid back counts as given. 520 000 planned: 500 000 given → 20 000; 520 000 → 0; 600 000 → 0; 520 000 given and 100 000 returned → 100 000; 500 000 given and 20 000 paid back → 0. Reverses 4.3 item 2 (D55, 1).
2. **Look first** (money, prefill). Planned cash fully given prefills 0 (writes nothing); no planned cash stays an empty row.
3. **Look first** (money, cancel). The owner then is the `from` of the first `MOVE_OWNER` event at or after the write, else the owner now (`movedSince()`), for money actions and purchase records alike; a cancel is allowed when the owner now is that owner. Reverses 4.10 item 3's "a move back leaves the event, so the refusal stays" and its proposed `/spec-change`, superseded by the spec change of 20.10.2026 (D55, 2).
4. **Look first** (money, cancel; a decision changed). Every purchase record and trip is checked, whatever its payment type: the edge case "A typo in a purchase record" names no exception, so 4.10's correction 1 (a Transfer record of a moved order is cancelled) ends, and its test changed.
5. **Look first** (money, date). Record money and the settlement action refuse a date after today in Tashkent, inline in `storedFields()`; the approval's cash action takes today from the clock. Reverses 4.3 item 8 (D55, 15).
6. **Look first** (rule 1). `receiptNeeded()` in `src/domain/purchases.ts`, asked by the action and the purchase form: the setting on and the trip's payment type or any extra cost's is Cash. Reverses 3.3 item 4 (D55, 16); its test changed.
7. **Look first** (rule 1). `cashNotYetGiven()` is the one formula of `moneyPrefill()` and `cashNeeded()`.
8. The refusal names the Manager through an optional `values` on `OrderFailure`, carried by the orders wrapper with `fields`.
9. No notification and no audit change.
10. The proposed `/spec-change` of 4.10 item 3 is superseded; nothing to propose.

Choices made during the build:

- `cashRecordsByIds()` (`src/features/purchasing/order-records.ts`) is removed: the purchase cancels no longer filter on cash, and nothing else read it.
- A user refused the action itself (`forbidden` beside the moved refusal: a Principal, a Manager without the right) gets no `values`: the wrapper drops them, so the next step of another role is never told (permission review, Should fix 1).
- The record dialog and the settlement screen set the date input's `max` to the server's today.

### 7.4b Inactive stock, counts into 0, a direct entry's cost (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them, with its two corrections applied (both numbers of the 5.12 decision named in item 5; a count after a cancelled purchase record in the database test). The Look first items come first.

1. **Look first** (stock, cost). "The subtype's last cost in that branch" is `lastCost()` in `src/domain/stock.ts`: the branch's movements of the subtype replayed in `seq` order through `nextBalance()` (`replayedMovement()` moved there from `stock-check.ts`), the average held just before the latest movement that took the stock from above 0 to 0; 0 when it never did, and 0 when that average was 0 (free items). Reverses 7.4 item 3 (D55, 4).
2. **Look first** (stock, cost). The last cost enters as the CORRECTION's `emptyCost`, accepted by `nextBalance()` on a RETURN or a positive CORRECTION and used only into a stock of 0; stored as the movement's `unit_cost`; the nightly check replays a positive CORRECTION with its stored cost as `emptyCost`. A reversal leaves at its own cost.
3. **Look first** (stock). Issue, write-off and transfer drop the line's activity check; the stock rule is the only limit (an inactive item with nothing held is refused as short with 0 available). Direct entry and the Excel stock import still refuse inactive entries. Reverses 5.4 item 3, 5.11 item 9 and 7.1 item 10 for inactive entries (D55, 3); the three tests that asserted the old refusal lost that case, now in `inactive-stock.db.test.ts`.
4. **Look first** (stock). "Returned by a department that received it" is the department's net received amount above 0 (`departmentReceived()`, `departmentHolds()`), read for every inactive line whatever the comment; the over-return warning and comment are unchanged. Reverses the item list of 5.6 (issue #9 5.6 item 7) for inactive entries.
5. **Look first** (permission). The cost per unit is read only when `stock.enter_direct` (the Head) allows it on the entry's branch, inside the SQL, on direct entries only, posted or reversed. Reverses 5.12 item 7 of this file (item 8 of 5.12 on issue #9; D55, 19).
6. The picker mark: a subtype is "inactive" when it or its product is switched off; inactive items keep the name order.
7. A transfer received with an inactive item: no check added; the receiving branch takes it in.
8. **Look first** (stock; buying). "It can no longer be bought" keeps 3.6 item 4 as built: a purchase record that buys a switched-off subtype in place of the ordered one is refused; an approved order's own subtype, switched off after the approval, can still be bought. The build line says buying "still" refuses, so nothing changed; the substitution case has a test.

Choices made during the build:

- The page's column uses a new key `warehouse.documents.page.unitCost` ("Cost per unit"): the existing `warehouse.directEntry.unitCost` ends in "so'm", which the money formatter adds again.
- The Manager row of the cost per unit is tested in `document.db.test.ts` (Head, Manager, Principal and Finance of the branch, posted and reversed) rather than in `documents-matrix.db.test.ts`, which tests the list.

### 7.4c Cancel a transfer, a reason for a refusal (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them, with its two corrections applied (every existing test that refuses a write-off or a count now gives a valid reason; the check compares `status::text`). The Look first items come first.

1. **Look first** (stock rule). The cancel puts the stock back as one REVERSAL per TRANSFER_OUT, at that movement's own `unit_cost`, with `reverses_movement_id` set (`reversalOf()`, through `reverseMovements()` of `src/server/stock-documents.ts`, which Reverse now shares): exactly "at the cost it left with", whatever the sender's average is now.
2. **Look first** (status move). IN_TRANSIT → CANCELLED is `transferCancelMove()` of `src/domain/stock-documents.ts`, asked by the action under the lock and by the page; CANCELLED is final: no receive, no Reverse, no second cancel. A received transfer is still fixed by Reverse.
3. **Look first** (permission matrix). Who cancels: the Head in any branch, or any Manager of the sending branch with `TRANSFER_STOCK` on (`stock.transfer` on the sending branch), not only the Manager who sent it. A Manager of the receiving branch only gets "Not found".
4. **Look first** (a constraint on old rows). `stock_documents_decision_reason_check` is added `NOT VALID` (migration 0050): refusals made before this task carry no reason, and none is invented; every new insert and update is checked.
5. **Look first** (data model). A cancel is stored in `decided_by`, `decided_at` and `decision_reason`; no cancel columns of its own. The page labels them "Cancelled by" and "Why it was cancelled".
6. **Look first** (notification params). `TRANSFER_CANCELLED { actor, number, branch }` to every active Manager of the receiving branch, whatever their rights, `branchId` the receiving branch; the Head and the sending branch are not told.
7. The reason is 5 to 500 code points once trimmed (`isMoveReason()`, `moveReason()`), stored trimmed; Approve takes none and stores none.
8. The refusal's reason is shown on the document's page to everyone who sees the document; the notice carries none, as an order's rejection notice carries none.
9. The cancel does not ask whether products or branches are still active, as Reverse does not.
10. No audit row for the cancel, as for the transfer.
11. A cancelled transfer's note can still be downloaded and says "Cancelled".
12. The Head refusing an incomplete count gives a reason too.

Choices made during the build:

- One `ReasonField` (`src/features/warehouse/components/reason-field.tsx`) serves the cancel, the two Refuse dialogs and the Reverse dialog, which used to hold its own copy.
- The Refuse dialogs say "The Manager sees it" under the reason (`warehouse.refuseReason.hint`).
- **Look first** (a test changed because a requirement changed). The tests that refused a write-off or a count without a reason, and the fixtures that wrote REJECTED straight into the database, now give a reason (09 Other documents: "A refusal … carries a reason"); what they check is unchanged.

### 2.3b Orders, notices and report access from issue #9 (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them, with its four corrections applied (`numbered` is a required fact; the Look first items first; the plan-gap refusal is tested with the cell filled again; a move notice is tested for an old owner who left the branch or was switched off). The Look first items come first.

1. **Look first** (approval order). "Draft with a number (taken back)" is a DRAFT whose `number` is not null, read as the required fact `numbered` of `OrderState` by every builder (the wrapper's `lockOrders()`, the order page, the order list, the grid, the Principal's home). A DRAFT without a number answers `wrong_status` to Cancel: it is deleted instead (05 Drafts; CLAUDE.md rule 11).
2. **Look first** (approval order). The Head's Submit again of another owner's order goes to Waiting for Head, also for an order the Head created; the Head then approves step 1. Only a first Submit skips the Head step.
3. **Look first** (approval order). Take back stays the owner's only (06 "Take back | Owner"; D55 changed only Submit again and Cancel).
4. **Look first** (permission). The 03 row "See every Manager's cash (Money with managers) and the Head's price notes" is the one permission `money.managers` (Head all, Finance own): the report asks it (`authorize()` with a chosen branch, `authorizeList()` without), and the notes, which belong to no branch, ask `decideList()` inside the Price history SQL. No new permission.
5. **Look first** (permission). The report refuses the Manager whole; the Manager's "Own cash only" is the cash on their own home and analytics.
6. **Look first** (branch wall). A notice hidden by the bell's branch filter is hidden from the count, the list, opening it ("Not found") and "Mark all as read" (left unread); given the branch back, it shows again as it was.
7. **Look first** (branch wall). A notice shows when its `branch_id` is empty, its reader is a Head, or its reader holds its branch in `user_branches` now (`visibleToItsUser`, `src/features/notifications/visible.ts`). Rows from before migration 0051 have no branch and always show.
8. **Look first** (approval order, database). A numbered Draft whose plan misses a cell (the grid saves cleared cells on any Draft) is refused Cancel with `not_ready` naming the cells (`cancelPlanGaps()`, `src/domain/submit-checks.ts`), and `orders_submitted_plan_check` stays as it is: weakening it would put cancelled orders with no total into every reader of `planned_total`. Proposed `/spec-change` for the Cancel row's Needs: "Reason; a draft's plan complete".
9. **Look first** (tests changed because a requirement changed, D55 items 9, 12, 13, 14, 20 and 22). The cases "the Head may not Submit again another's order", "a numbered draft cannot be cancelled", "Cancel tells nobody", "a move tells nobody", "the bell shows every row" and "every role sees Money with managers and the price notes" are replaced by their new rules, each naming D55.
10. The cancel notice is one per owner, action and branch, `count` that owner's orders in the branch; an owner who cancels their own orders tells nobody.
11. Move notices: `REQUEST_MOVED_IN` to the new owner per branch with the count; `REQUEST_MOVED_OUT` to each old owner per branch with their count and the new owner's name. An old owner who left the branch or was switched off gets none (`notify()`'s filters).
12. The Head's Submit again tells the active Heads but the actor, not the owner (10 "Orders submitted or submitted again | Head").
13. The button is the order page's existing Cancel; the drafts grid links a numbered row's number to its order page.
14. The three notice texts in English as the plan gave them; Uzbek and Russian written alongside, for the owner to correct (D12).

Choices made during the build:

- **Look first** (permission, the permission review's Must fix 1). The analytics Managers block (`getManagers()`) and the cash list behind it and behind Finance's money with managers by age (`getCashOrders()`) list every Manager's cash, so they now ask `money.managers` after the filters (the Head and Finance); the Manager reads only their own cash there (the Manager filter set to themselves, no other owners, as My cash links), the Principal none. `/analytics/cash` and `/analytics/download` answer a refusal "Not found". Finance's totals, money rows and needed lists of 6.6a stay `data.view`: they are not per Manager.
- **Look first** (branch wall, the permission review's Should fix 1, not built). The waiting reminders (`REQUEST_WAITING_24H/48H`, 8.1) are written with no branch, their count cut to the reader's branches when written; a Principal or Finance user moved to another branch keeps seeing that old count in the bell (the link checks access again). Left as it is: the number was the reader's when written, and one row per branch would change 8.1's notices. Proposed for a later fix task: write one reminder per branch with its `branch_id`.
- **Look first** (a database guard). Migration 0051 also replaces `notifications_guard` so that an update may not change `branch_id` (marking read never moves a row to a branch); its test sets `branch_id` together with `read_at`, which the old guard let through.
- The Reports page hides the Money with managers tab with `seesManagersCash` of `getAnalyticsFilters()`, the query it already calls (`mayInSomeBranch("money.managers")`).
- The Excel file of Price history leaves out the Note and Set by columns for the Manager and the Principal, as the screen does.
- The download of Money with managers answers 404 to the Manager and the Principal, as every refusal of that route.
- `insertOrder()` (`tests/helpers/orders.ts`) gives a Draft with a number a submit time, as a taken-back order keeps one.

### 8.2b Backups, a Head's lost password, receipt photos, running periods, the report branch (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them (its two corrections applied: the 7-day edge of `copyDue()` tested; the download route itself tested without `branch=` and with the CHL cookie), and those of the build. The Look first items come first.

1. **Look first** (tests changed because a requirement changed, D55 items 7, 10 and 11). The cases of a running month against the whole month before (6.3 items 3 and 6), of the reports starting at All my branches (6.8 build choice), of the copy's Sunday schedule and its failure as a failed tick (8.2 items 5 and 9) are replaced by their new rules, each naming D55. In nine analytics test files whose subject is not the comparison (head spending, Finance's cash, managers, my orders, plan vs actual, principal, settlement speed, top products, warehouse) the fixture of the period before moved into 1 to 15 September, the same days of 15 October, so each still tests what it tested; the Tashkent-midnight edge of the period before moved to 15 September 23:30.
2. **Look first** (reading of 10 point 1). Running: this month, this quarter or this school year with today inside it. The period before is cut to as many days from its start as the period has run to today, never past its end (18 October: 1 to 18 September; 31 March: all of February; 15 November, this quarter: 1 July to 15 August). The month point holding today compares the same way with the month before it (`runningMonthBefore()`); finished points keep the whole month. Last month and custom dates stay as built.
3. One daily job, `{ dailyAt: "04:00" }`, with the rule in `copyDue()` of `src/domain/`.
4. A failed copy writes its row, tells every active Head and reports the alert, and does not throw (reverses 8.2 item 9; D55, 6).
5. The bucket of the copies: `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, on `S3_ENDPOINT` and `S3_REGION`. `copyRuns()` stays "production with `S3_BUCKET`", so missing backup settings fail loudly every night.
6. A console copy writes no `database_copies` row.
7. The date on Settings is the Tashkent date of the newest good attempt's tick.
8. The notice names no cause; link `/settings`.
9. The console command refuses unknown, inactive and not-a-Head with one message; the audit row's actor is the Head itself, `before {}` `after {}`; an empty password, one over 4 096 characters and a Head with no password account are refused (plan review, Should fix 3 of the spec review).
10. Every `document` upload is a receipt and keeps 2 500 px; a `photo` keeps 160 and 1 200 px.
11. The 2 MB redraw stays; a document is redrawn only above 2 500 px.
12. Reports take the cookie's branch only without `branch=`; the page and the download route share `withSwitcherBranch()`; `reportSearch()` writes `branch=all`.
13. One `database_copies` row per attempt, a CHECK on its outcome and a unique tick.
14. The 7-day rule: a copy is due when the last good one is 7 days old or more (the edge counts as due).
15. Not split: about 45 files, one session.

Choices made during the build:

- `databaseCopy()` returns `{ ok, key, size, line }` instead of the line, so the job records the key and the size without reading its own text.
- `getLastDatabaseCopy()` asks `catalog.manage`, the permission of `getSettingsForHead()` (the Head's Settings page).
- The page data loads `@/server/db/client` lazily for `resolvePeriod()`: a top import broke `next build`, which has no DATABASE_URL (the image job of CI).
- `npm run storage:bucket` makes the backup bucket only when `BACKUP_S3_BUCKET` is set, and says so otherwise, so an older local `.env` still works; the Vitest setup makes `procurement-test-backups`, and the e2e setup `procurement-e2e-backups` through the same script.
- `.do/app.yaml` declares `BACKUP_S3_BUCKET: ombor-test-backups`; `docs/deploy.md` has the bucket, its token, the retry and "A Head forgot the password".
- Prices: the running month's point is compared with the average price of the same days of the month before; none when no record was priced in those days.
- Permission review: Should fix 1 (a cookie-branch case at more readers) is built for Spending, Stock on hand and Money with managers; the other reports pass the same `ReportParams` to queries whose walls are unchanged. Nit 1 (an unreachable `case "orders"` in the download route) stays: TypeScript needs it to see every report handled after the parsed params are replaced.

### 5.4b "Give straight to requester": stored, and its cancel (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them (its two corrections applied: the message also names reversing a return first; a test that a return does not unlock the cancel), and those of the build. The Look first items come first.

1. **Look first** (stock rule). The record's issue is the ISSUE of the record's branch whose `client_key` is the record's id (5.4 decided item 7), not `give_to_requester`, which records saved before 5.4b read false (D56 finding 2).
2. **Look first** (stock rule; a spec text that should change). A record given straight to the department cannot be cancelled while its issue is posted, whatever the stock; only a reverse of that issue lets the cancel through. A Return does not, even of the same quantity: after a Return the user reverses the Return, then the issue, then cancels (50, 60, 50, 60, 50 on the worked example). A reverse of the issue after an unreversed Return still counts the items twice: that guard belongs to 5.7's reverse and is left out (issue #9). Proposed `/spec-change` of 07, Fixing a mistake, second bullet, appended: "A record given straight to the department cannot be cancelled while its issue is posted, whatever the stock: the message says to reverse that issue first (and a return of those items before it), or to keep the record and use a write-off."
3. **Look first** (stock rule). The message (`errors.field.givenIssuePosted`) names the issue number, the reverse of that issue, the reverse of a return first, and the write-off.
4. One check, in the inspect step under the orders' and records' locks; the issue row read without a lock (POSTED only ever becomes REVERSED, so a stale read can only refuse).
5. `not_ready` with `fields.stock` and `values.number`, as `stockShort` and `movedSince`.
6. The cancel button stays offered on such a record: the user gets past the refusal by reversing the issue, and the message says how.
7. No backfill of `give_to_requester`: the trigger `purchases_cancel_only` refuses it, rule 7 forbids it, and nothing reads the column yet.

Choices made during the build:

- The permission review's Should fix 1 (a hand-made issue whose browser key equals a purchase record's id would block that record's cancel) is not built: it needs a random UUID of a record in the user's own branch, it only blocks (no stock or money goes wrong), the refusal names that issue, and reversing it unblocks. Reported for the reviewer.

### 5.7b Reversing an issue after a return (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them (its two corrections applied: the header comment of `reverse.ts` rewritten; the Done-when test run once before the fix and seen to fail), and those of the build. The Look first items come first.

1. **Look first** (stock rule). An issue's reverse is refused when a line's quantity is more than `departmentReceived()` of its subtype in the document's branch, which counts this issue itself; equal passes. One line over refuses the whole reverse (5.7 item 6; `CLAUDE.md` rule 3). 09 Issue to a department 3; D57.
2. **Look first** (lock order; changes 5.7 item 3). The reverse takes the department FOR NO KEY UPDATE, not FOR SHARE: under FOR SHARE two reverses of two issues of one department both read the same held amount and both pass (issues 5 and 5, return 2: the department at -2, stock 2 too high). FOR NO KEY UPDATE serializes two reverses, a reverse and a return, a reverse and an issue, and lets through the FOR KEY SHARE of a foreign-key check, so it does not deadlock with a "Give straight" purchase (FOR UPDATE would: seen as 40P01 in the build). Order: department, document, balances.
3. **Look first** (stock rule; reverses 5.7 item 2, D57). An issue's over-held warning and its reason-as-comment are gone; a return keeps its warning and comment (09 Return).
4. The check runs for an ISSUE only (09 Issue 3 names the issue; a return only raises what is held; the other types have no department).
5. The rule is `overReturn()`, already the preview's comparison; no new function (D44).
6. The refusal is `invalid_input` on `lines.<lineId>.qty` with `available`, the shape of `reverseStockShort`; the ledger's short-stock check stays behind it.
7. The item card and the document page still offer Reverse on such an issue (the amounts would need a read per row); the dialog names the line, says to reverse the return first, and disables its Reverse (`.claude/rules/ui.md`, a refusal only the server would give is not offered).
8. No audit row, notification or history event (5.7 item 5).

Choices made during the build:

- **Look first** (a test changed because a requirement changed, D57): 5.7's test "an issue partly returned still reverses, its reason the comment" (review of 5.7's plan, correction 1) is replaced by the Done-when test of the refusal.
- The read of what is held is in the `check` step, after the lock step and before `write`.
- The dialog's line is red (`text-destructive`), no longer the warning colour: it is a refusal now.

### 9.4 The live app, in trial (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them (its two corrections applied: `docs/deploy.md` says what the reset does not empty, the two buckets and DigitalOcean's backups, and what to do when the reset fails with a message from PostgreSQL), and those of the build. The Look first items come first.

1. **Look first.** The managed database is attached with `production: true`, `cluster_name: ombor-db`, and the app connects as the cluster's admin `doadmin` to `defaultdb`: `trial:reset` drops and makes again the `public` schema, which only the database's owner may do (PostgreSQL 15+). The field names, `doadmin`'s ownership of `defaultdb` and `${db.CA_CERT}` for a managed cluster are written from memory (DigitalOcean's pages could not be read); `docs/deploy.md` says to stop and post DigitalOcean's message on issue #9 if the spec is refused. 13 Running it; 18 rows 1 and 2.
2. **Look first.** A new table `trial_end` (one row at most: `id boolean primary key default true check (id)`, `ended_at`), migration 0053, records the end of the trial. Not a `settings` row, which the Head could change on a screen. Proposed `/spec-change` to 14: "`trial_end`: one row at most, written by `npm run trial:reset` when the trial ends (D52); its row makes the reset and the seed refuse."
3. **Look first** (a test changed because a decision changed). The 0.15 note "the production app spec must not carry `SEED_DEMO_DATA`" is replaced by D52: `tests/app-spec.test.ts` asserts `"yes"` while the trial runs; 9.5 removes it and changes the assertion.
4. The seed refuses once `trial_end` holds a row, inside its transaction under `FIRST_HEAD_LOCK`: a `SEED_DEMO_DATA` left on after 9.5 can never write demo users beside the real data. The second guard independent of configuration that the 0.14 and 0.15 permission reviews asked for.
5. The reset: the drops in one transaction, then `applyMigrations()` (the deploy's own code, in its own transaction), then the row, all under the session-level advisory lock `FIRST_HEAD_LOCK`, so a container's seed or a `user:first-head` waits and then meets the record (review of the plan, Must fix 1). A failure between leaves an empty database without the record, and the reset runs again. Drizzle's migrator cannot run inside an outer transaction. A container's own migration is not under the lock; `docs/deploy.md` says to reset with no deploy in progress.
6. The new `public` schema gets no grant: the app and `pg_dump` connect as its owner.
7. The confirmation is the database's name as the driver reads it from `DATABASE_URL`, trimmed of surrounding white space, case-sensitive, typed at a prompt.
8. The reset does not check `SEED_DEMO_DATA` itself: item 4 makes a value left on harmless.
9. The app connects straight to the database, no DigitalOcean connection pool, so `-c timezone=UTC -c jit=off` reach the server (progress 9.2, "For 9.4").
10. The alerts of 9.3 are required setup steps (`docs/deploy.md` step 9; D55 item 21); `ERROR_REPORT_DSN` joins the typed values. No code.
11. `scripts/create-first-head.mjs` is copied into the image now: 9.5 runs it in the live console and builds no code.
12. `.do/app.yaml` is replaced, not doubled; nothing is switched off (D52: no test copy was created).
13. The two live parts of Done when (the demo users sign in at the live address; a daily backup on the cluster's dashboard) are the owner's checks after the merge, as 0.16's online proof was (Decided ahead 0.16, item 5); the task is ticked with them listed under "For the owner".

Choices made during the build:

- The reset reads whether `trial_end` exists (`to_regclass`) before it reads the row, so a database migrated before 0053 counts as "not ended".
- A refusal prints its own line; any other failure prints `trial:reset failed: <reason>` through `failureReason()`, as `db:migrate` does.
- The seed's hosted-database refusal and the comments of `start.sh` and `db-seed.mjs` say "the live app in trial" instead of "the test copy"; `tests/seed-guard.test.ts` follows the new text.

### 9.6 Restore drill (20.10.2026)

The plan's decisions as the plan review of 20.10.2026 confirmed them (its three corrections applied: a deleted draft named in "When the two lines differ" with its test, item 10 moved up among the Look first items, `tests/restore-counts.test.ts` in the size list).

1. **Look first** (production: never over the live one). A weekly copy is restored only by `npm run db:restore` into a database that does not exist yet, on the cluster of `DATABASE_URL`; it refuses the app's own database, `defaultdb`, `postgres`, `template0`, `template1`, a name that is not a plain lower-case identifier, and an existing database, before anything is written, and never drops anything. A written step alone does not hold "never over the live one" (build-plan 9.6); a refusal with a test does.
2. **Look first** (two console scripts beyond "a written procedure"). `db:restore` and `db:counts`, no new dependency (`pg_restore` 17 in the image since 8.2, `pg`, the S3 client). The Done when asks for counts "against the live one", which by hand at one moment is where a drill goes wrong.
3. **Look first** (what "counted against the live one" means). Both sides are counted as of one moment, the newest `created_at` among the copy's orders, users and stock movements: orders and users created up to it, movements up to it, and stock lines rebuilt from the movements (the `balance_after` of the last one by `seq` per branch and item, above 0, with their total quantity), since `stock_balances` changes in place. Orders, users and movements are never deleted or are append-only (`CLAUDE.md` rules 7 and 11), except a never-submitted draft, named in `docs/restore.md` with the late-committed and back-dated seed rows as the known causes of a difference.
4. **Look first** (money: the drill cluster). Yesterday's copy is DigitalOcean's daily backup, which it restores only into a new cluster billed by the hour (`18-hosting-and-costs.md` row 2: about $15 a month); the owner checks the price, runs the drill and destroys `ombor-db-drill` the same day. The dashboard's screens are described from memory.
5. **Look first** (the order 9.6 before 9.5). The task cannot run the drill (production, money), so it builds the steps and the scripts, is ticked for them, and puts an owner gate line before 9.5 in `docs/build-plan.md`, which the owner deletes once both pairs of lines are on issue #9: 9.5 begins with `trial:reset`, which empties the database the drill runs against. The Done when's counts are the owner's, not met by the merge.
6. Which copies: "yesterday's" is the daily backup at a moment of yesterday (Tashkent), chosen in DigitalOcean's dialog; "the newest weekly copy" is the newest `backups/database-<date>.dump` by the date in its name (`copyKeyOf()` of 8.2), or a key given.
7. The weekly copy is restored into a database `drill_<date>` on `ombor-db`, deleted by the owner in the dashboard after the counts: it costs nothing, and the app never connects to it. Dropping a drill copy deletes none of the app's rows (rule 11).
8. `pg_restore --no-owner --no-privileges --exit-on-error --no-password --dbname=<name>`, the address as PG* variables (`pgDumpEnv()` of 8.2, only the database name replaced), verified against `DATABASE_CA_CERT`. A failed restore says the new database was created and is to be deleted; a half-restored copy is never a pass.
9. `db:counts --ask` reads the drill cluster's address at a hidden prompt (`askHidden()`), never as an argument, never printed; it is verified against `DATABASE_CA_CERT`, or with `--own-ca` against the drill cluster's own pasted CA; never without verification (`connection-options.mjs`).
10. `db:counts` reads in one `REPEATABLE READ READ ONLY` transaction, so the live side is counted at one instant while the app writes.
11. No comparison of `stock_balances` with the movements in `db:counts`: the nightly stock check of 8.2 does it (D44).

Choices made during the build:

- `db:counts` takes `--until` only as an ISO 8601 moment (`2026-10-19T23:00:00.000Z`), the form its own line prints, so the moment is copied from one line to the other unchanged.
- The tests of `restoreCopy()` use only the buckets the test setup makes: the local SeaweedFS gives each bucket volumes of its own, and three more buckets ran it out of them (HTTP 500 in every storage test). Their copies are dated 2998 and 2999, after any day the job tests of 8.2 write, and the files bucket stands for an empty bucket of copies.
- A by-hand run on this machine with `pg_dump` and `pg_restore` 17 (the `postgres:17` image on `PATH`): `db:copy` of the seeded local database, `db:restore -- drill_local` and `db:counts -- --until <newest row>` printed equal lines (orders 12, users 4, stock lines 2, quantity 250.000, movements 4); the restore refused `drill_local` again, `procurement` and `defaultdb`.

### Visual redesign, `ui/visual-redesign` (21.10.2026)

Not a task of the build plan: the owner's redesign brief of 21.10.2026 on top of D60 (sodiqschoolapp/procurement#152). No server action, query result, formula, status move, permission or table changed. The Look first items come first; each names the `/spec-change` wording it would need.

1. **Look first.** Status labels are a dot and a word: blue in the approval and buying flow, red for Sent back and Rejected, green for Closed, grey for Draft and Cancelled (11 rule 11 keeps green, amber and red for the three labels and alerts). Proposed: "Status labels look the same everywhere: a dot and the word. Blue for the approval and buying flow, red for sent back and rejected, green for closed, grey for draft and cancelled; amber is kept for the three labels and alerts; the brand orange is never a status colour." With it, for rule 11's "orange marks only the action to take" (plan review, decision 1): "…the brand orange is a small highlight (active tab, active menu item, the one thing that needs you now) and is never a status colour."
2. **Look first.** A list row shows one outcome, the Total label, and Number and Price only when orange or red; the order page, the selection bar and the PDF keep all three (08 The three colours). Proposed: "Each order shows three labels on its page; a list row shows the Total label and, beside it, Number and Price when they are orange or red; the totals of ticked orders show all three."
3. **Look first.** A green label carries no amount: "Quantity as planned", "Price as planned", "Even" (08: "an icon, a word and the amount"). Proposed: "…the amount, except a green label, which has nothing to count."
4. **Look first.** The order page's action bar stands under the header and stays in view under the top bar on a desktop, not at the bottom (11 Order page layout 4). Proposed: "Action bar, under the header and kept in view: only the actions…"
5. **Look first.** A home list with nothing in it is not drawn; when nothing waits, one "Nothing needs you right now" state; the Head's branch figures always show (10 Home page per role, and 11 rule 12, which asks an empty list to explain itself). Proposed, for both rules in one `/spec-change`: 10, "Each list on a home page with something in it shows…; an empty one is left out."; 11 rule 12, "…An empty list explains what belongs there and offers the button to create it; on a home page an empty list is left out, and when every list is empty one line says nothing needs the person now."
6. **Look first.** The analytics screens show short change texts (`analytics.short.change.*`); the PDF and Excel keep the long sentences of `analytics.change.*` (10 point 1), since PDFs were out of scope.
7. **Look first.** The order list marks a group row "Your turn" when its status is one the person's role acts on; a Manager gets the mark on a Sent back row only with the right to add drafts in that row's branch (plan review, correction 2; `waits-on.test.ts`). It reads the same role and rights the server already checks and adds no action.
8. The order list keeps its status select behind "More filters" beside the new status tabs, so filtered links and the keyboard keep working. The tab counts come from `countOrdersByStatus` under the other filters, inside the branch wall; `tests/e2e/branch-wall.spec.ts` checks them with another branch in the address.

Technical choices:

- `cn` is built with `createCn` from `cn/config` and knows the app's own type sizes (`text-small`, `text-subheading`, `text-heading`, `text-figure`, `text-title`), so a size beside a colour is never merged away (`src/components/utils.test.ts`).
- `DateInput` (`src/components/ui/date-input.tsx`) replaces every `type="date"`: it shows and takes dd.mm.yyyy (also a typed YYYY-MM-DD), opens the browser's own picker from a calendar button, and sends the same YYYY-MM-DD as before (a hidden field in GET forms, the same form value in React Hook Form).
- Golos Text has no U+02BB. A second family, `Golos Text Uzbek`, with `unicode-range: U+02BB`, loads the TTFs already in `src/features/orders/download/fonts/` and sits second in the font stack. Declaring them inside the Golos family broke the variable face in the browser test.
- `tabular-nums` is set per number, not on the page: on the whole page it widened the hyphens of order numbers.
- Bitter is removed (`@fontsource-variable/bitter`), as D60 asks: one dependency fewer, none added.
- Tables become cards below 640 px through one CSS class, `table-cards`, with `data-label` on the cells; no second markup of the same table.
- `MoveButton` takes an `onDone` that skips the page refresh after a success, so settlement shows a "closed" state with links instead of reloading into "Not found". The move itself is the same call.
- A catch-all `(app)/[...missing]` page signs the person in first (`requireUser`) and then shows the app's own not-found page inside the shell; it is in the permission registry and the placeholder list.
- The before and after screenshots live in `docs/redesign/` as JPEG (about 2 MB), taken from the invented seed on a separate local database.
- After the first CI runs: the default button, icon button and field stay 40 px high on a desktop (44 on a phone), as the browser tests of the earlier tasks ask; a summary figure of 0 is plain, not a link (nothing to open, one Tab stop fewer); the price history keeps drawing its line chart from one point; a change from nothing keeps its amount ("+29 333 (new)").
- Phone cards: the table's header row is hidden from sight only (it still names the columns for screen readers), and each cell's visible column label is CSS text with an empty alternative (`content: attr(data-label) / ""`), so a cell's accessible name is its value alone.
- The not-found screen is in the accessibility list (`tests/e2e/screens.ts`, `missing: true`): it is checked like any screen, answering 404 with its heading; the speed run expects the same 404.
- The owner's four fixes before merge (21.10.2026): the status tabs wrap from 640 px up; the settlement screen's Close names what it does and how many ("Close 3 orders", `money.settle.closeCount`) and is its own last step under the settlement, through a `buttonLabel` of `MoveButton` that leaves the dialog and the move as they are; the analytics block tables use `table-cards` with a flat variant (`table-cards-flat`, rows divided by hairlines inside a card), the row's first cell a `th` heading the card; every money field is `MoneyInput`.
- `MoneyInput` shows `formatTypedAmount` of what it holds and keeps `typedAmountValue` of what is typed: the spaces of the grouping (space, no-break, thin, narrow) are removed and nothing else, so a text that is not digits still reaches the field's own check and is refused as before. The forms of React Hook Form hold it through `Controller`, so the value they send is the same digits. The caret stays after the digit just typed (`retypeAmount`), and a `maxLength` counts digits as before. The browser tests read a prefilled money field in its grouped form (`tests/e2e/shown-amount.ts`, written apart from `src/`).

### Tabs keep the scroll; the profile as a panel (21.10.2026)

Not a task of the build plan: the owner's two asks of 21.10.2026 after the redesign. No server action, query, permission or table changed.

1. "When we move from tab to tab … it is reloading the page kinda. So if the tab is at the bottom of the page, reloaded page is starting from the top." Every tab row (`TabLinks`: the order list's status tabs, the order page's tabs, Admin and Warehouse), the report switch, the Head's "my drafts / all" switch and the drafts grid's move to its last page navigate with `scroll={false}`. The eleven GET filter forms (catalogs, departments, products, prices, stock, documents, reports and its price picker, analytics and its price picker) are `next/form` with `scroll={false}`: before, each submit reloaded the whole page. The address still holds every filter (11 rule 8). The page links of a long list keep their jump to the top: the next page starts at its first row. Test: `shell.spec.ts`, "a report tab and the report filters keep the page where it is", which fails without `scroll={false}`.
2. "Profile page should instead be floating bar on the left when clicked." The person in the sidebar and the avatar of the top bar on a phone open `ProfilePanel`, a Base UI dialog from the left with the profile's contents (name, role, username, language, theme, sign-out); `LanguageChoice` and `ThemeChoice` moved to `src/components/shell/` for the page and the panel. `/profile` stays, with the same contents, for its address and its tests. Test: `shell.spec.ts`, "the person's panel opens from the left".

### Plan and actual, labels that say what they compare, rows that open, the phone pass (22.10.2026)

Not a task of the build plan: the owner's five asks of 22.10.2026 after a review of the colours with Claude ("Over xxx, More xxx, Cheaper xxx in one column … very hard to understand"; "it should be very professional"). The colour meanings, the statuses and the flags stay as they are. No server action, permission, status move or table changed; two queries return more of what they already read. The Look first items come first.

1. **Look first.** `planVsActual()` (`src/domain/colours.ts`) splits 08's Difference into three effects, each planned − actual: quantity = planned goods − round(planned price × actual quantity); price = round(planned price × actual quantity) − actual goods (the Price label's own amount); extras = planned − actual extra costs. They add up to planned total − actual total exactly, roundings included, which the unit tests check on 08's worked examples, a quantity with decimals and two prices. The actual price per unit is `actualUnitPrice()` (goods ÷ quantity, half up), marked "on average" when the records have more than one price. No new rounding: the one product is 08's own Price comparison.
2. **Look first.** The order page shows a Plan and actual table once something counted is bought: Quantity, Price per unit, Extra costs (only when planned or bought), Total, each with Plan, Actual, Difference and its Effect on the total. 11 Order page layout 1 keeps its three labels in the summary strip; the table explains them. While buying is Open, Quantity and Total read "In progress" there too (08 bullet 1). Proposed for a later `/spec-change` of 11 Order page layout 1, if the owner wants it written: "…planned and actual totals, the three colour labels, and once something is bought the plan beside the actual quantity, price and extra costs with what each did to the total."
3. **Look first.** On the order list each of the three labels stands in its own column of the row, under the header it compares: Number under Quantity ("50 of 40 dona"), Price under Price (the actual price with "plan 2 500 so'm"), Total under Total (the actual total with its plan). This reads 08's "a list row shows the Total label and, beside it, Number and Price when they are orange or red" as "in the same row, each in its column"; Number and Price still show only when orange or red. A group row gains a Price column; its price hint moved there. The server sends each order's actual price and total from `planVsActual()` and each group's received quantity from `receivedTogether()`; the screen adds nothing up.
4. **Look first.** The label words say what they compare (`colourLabel.*By`, `*Orders`): "Bought 10 more / fewer", "Saved 15 000 so'm on price", "Paid 5 000 so'm more on price", "Over plan by 30 000 so'm", "Left 50 000 so'm"; a set says "Bought more: 1 order". 08's "an icon, a word and the amount" holds. The grey Price word is "Nothing bought yet", so it no longer looks like the progress "Not bought". Uzbek and Russian are first drafts for the owner.
5. The order page's header no longer shows "Buying open" beside "Open"; Done, Done short and Not bought still follow Open. 11 Order page layout 1 does not ask for the progress there; the Purchases tab keeps it.
6. **Look first.** A row or card with one destination is that destination (design system, Panels and lists): a click anywhere on it goes to its one link or toggle, through `RowLinks` / `rowClick` (`src/components/row-links.tsx`), not a stretched link, which needs `position: relative` on a table row. Applied to the home lists (a row of one order opens it; a row of several opens the block's own list), the order list (a group row opens and closes; an order row opens the order), catalogs, departments, products and subtypes, users, branches, stock, documents, counts, prices and suggestions. Not applied to the approval cards (Approve, Send back, Reject), to the money entries that are already one link, to ticking, to the drafts grid or to any form. The accessibility test counts a row link's whole row as its finger target (`tests/e2e/accessibility.spec.ts`): the row really takes the tap. That is the test changed because the requirement changed, so it is marked here; a link outside such a row is checked as before.
7. The phone pass (each screen at 375 px, `docs/redesign/` before and after): the order list's cards put the tick box and the toggle on the title line and the three columns in a grid below, with the expanded orders as flat rows; the warehouse documents' four filters and the products' category and type fold behind "Filters (n)" on a phone (`FilterFold` with `bare`), as Analytics and Reports already do; the product card's photo stands on its name's line. The other screens were already fine and are unchanged. The text size and the 44 px targets stay; nothing is zoomed out.

Technical choices:

- `ListColourLabel` replaces `ColourOutcome`; labels keep their text on one line from 640 px and wrap below it with the icon on the first line.
- The browser tests: a row click on the order list and on the branches list, at both widths; the Plan and actual table's effects on 08's Dearer scenario (S3); the fixtures read Open buying from the status alone.

### Phone draft cards, warehouse actions behind More, dark tints in their own hue (22.10.2026)

Not a task of the build plan: the owner's three asks of 22.10.2026 after #157. No server action, query, permission, status move or table changed.

1. **Look first.** On a phone a draft of the grid is a summary card until it is opened (05 Drafts; 11 Order list layout 3 and rule 2): the photo, the product, quantity × price, department and needed-by, the total and "Edit". A tap opens the card's fields; "Done" folds them. A draft that was just added or sent back by an approver (the one that needs fixing now), holds a save error, a mark of the last Submit, a branch or urgency change not yet saved, or typing not yet saved stays open, so nothing that needs the person is hidden, and offers no "Done" (review of d14a85a: a button that cannot act is not offered); a just-added draft opens like any other, so its "Done" folds it. Enter from the row above opens the next card before it moves into it (11 rule 2). From 640 px the grid is unchanged. Before, every draft showed its 18 fields, about 800 px each.
2. On a phone the warehouse's new-document actions show the first (New issue) and a secondary "More" menu with the rest (Base UI's menu, as the tab bar's More); with two or fewer, each keeps its button. From 640 px unchanged. The browser tests open More on a phone (`tests/e2e/document-actions.ts`) and count a button by `data-document-action`, shown or folded, so a folded button still counts.
3. **Look first.** The dark tints of danger, warning, success, info and today are chosen in each colour's own hue (oklch lightness about 0.30), no longer the colour at 16% over the navy card, which read grey (amber, hue 292) or purple (red, hue 313). The contrast test checks each tint's hue against its colour's (within 10°) besides the 4.5 : 1 of its text. The design system's table changed with them.

### Next.js 16.4.2 for a critical advisory (22.10.2026)

Not a task of the build plan. `npm audit` (CI's "Audit the production dependencies", `--audit-level=high`) reports `next` 16.0.0 – 16.4.0 critical: unauthenticated remote code execution in the image optimization API with SVG files (GHSA-2464-fhr4-w9xw) and in `use cache` functions returning typed arrays (GHSA-673q-mjm6-r5xr), and a denial of service through Server Actions (GHSA-p3m5-59mp-jv5r). It turned every pull request red, and the test site ran the version. The owner said to upgrade on 22.10.2026.

- `next` and `eslint-config-next` from `^16.4.0` to `^16.4.2`, the newest 16.x: a patch release, no new dependency. The lockfile changes only Next.js's own packages (`next`, `@next/env`, `@next/eslint-plugin-next`, `@next/swc-*`, `eslint-config-next`).
- After it `npm audit --omit=dev --audit-level=high` passes. The four moderate findings left are the old ones under `drizzle-kit` (esbuild in its build tooling, a dev dependency), below the gate as before.
- Checked: lint, typecheck, `next build`, the unit tests, and the browser tests of sign-in, the shell, accessibility, orders, approvals, purchases, settlement, the money scenarios, files, products and drafts.

### The drafts' Submit in the floating bar (23.10.2026)

Not a task of the build plan: the owner's report of 23.10.2026, "When I tick them, submit is not appearing." No server action, query, permission, status move or table changed.

1. The actions on the ticked drafts (Submit or Submit again, Clear, Apply a needed-by date) stood in a bar above the grid. On a phone, with the cards one under another, ticking a card further down left that bar far above, out of sight; only the totals floated at the bottom. 11 Order list layout 4 and the design system's selection bar ask for one bar "fixed at the bottom when something is ticked: the count and totals of the ticked orders, and only the actions this user can take on all of them now". The totals panel of the grid (`TickedTotals`) is now that bar, laid out as the order list's: the count, the grand total, Submit and Clear on one line; goods, extra costs, the split by payment type and the needed-by date under a hairline, behind "Show details" on a phone. It floats with the selection bar's edge and shadow. The first try, the whole old bar under the totals, stood so high on a phone that it covered the next card's tick box (S14 at 375 px could not tick it); folding the details keeps it low. Test: `drafts.spec.ts`, "at 375 px a draft ticked far down the grid shows Submit without scrolling", which failed before (the button's viewport ratio 0).
2. **Look first.** Ticks of a draft and a sent-back order together still offer neither Submit nor Submit again: one action makes one move (06 rule 8; plan of 2.11, decided item 9), and Submit and Submit again are two moves. Before, the bar then showed nothing and gave no reason (design system: a button that cannot be pressed now says why). It now says "Drafts and sent-back orders are submitted separately. Tick only drafts, or only sent-back orders." (`ticksMixDraftsAndSentBack()`, `grid-rules.ts`, with its unit test; `orders.submit.mixed` in the three languages, Uzbek and Russian first drafts). The other reading, one Submit that sends each ticked order by its own move in one transaction, would change the server action and a decided item; not done without the owner.
3. From 1440 px the needed-by date stands beside the totals, so the bar keeps about the height of the old totals panel. Screenshots: `docs/redesign/2026-10-23/`.
4. Submit is the bar's primary button now (it was secondary), as Approve is on the order list's bar. The grid's own count line `orders.ticked.count` is no longer used and left the three files.

### 4.10c The Finance step switch (25.10.2026)

The plan's decisions as the plan review of 25.10.2026 confirmed them (no corrections). The Look first items come first.

1. **Look first** (approval order). The switch and the Principal's approval cannot cross: `switchFinanceStep` takes the settings advisory lock exclusive and then counts the orders Waiting for Finance or for settlement; the Principal's approval takes the same lock shared in its `facts` step and reads `finance_step` in the action's transaction (READ COMMITTED). Shared, so Principals never wait for each other. `SETTINGS_LOCK` and `SETTINGS_LOCK_SHARED` live in `src/server/settings.ts`; `saveSettings` takes the same exclusive lock as before. Test: `switch-finance-step.db.test.ts`, both orders of the same moment, each seen to fail with the shared lock removed.
2. **Look first** (approval order). An Open order that went through Finance before the step was switched off keeps its Finance rules: it is still sent to settlement, settled and closed by Finance, sent back for correction and reopened, while the step is off (06 Finance step switched off 5 and 6).
3. **Look first** (approval order). The close of an order that skipped Finance is its own action `CLOSE_SKIPPED` (enum value in migration 0054), a row of `ORDER_MOVES` with the needs `skipped_finance` and `buying_finished`; Close (exact match) and Send to settlement need `not_skipped`. A mismatch is `wrong_status`: "Open, skipped Finance" is a "from" of its own.
4. **Look first** (permission matrix). `request.close_skipped`: Head every branch; Manager own orders with `CLOSE_ALONE` on; Principal and Finance never. The Head closes the orders of a Manager whose right is off.
5. **Look first** (money). "No cash count" leaves the order out of every cash reader, not counted as 0: Money with managers (`not orders.skipped_finance`), the Manager's home, the analytics refresh's `analytics_cash` (so the report, the Managers, Cash, My cash and cash-orders readers follow); `cashNeeded()` is 0 for it. Orders still in approval keep their planned cash in Cash needed soon whatever the step. `cashWhere()` is unchanged (review of the plan, Should fix 1).
6. **Look first** (money). Moving a skipped order to another Manager is allowed whatever was bought in cash: it has no cash count (03 rule 7).
7. **Look first** (money). Two database guards: the trigger `money_rows_not_skipped` refuses a money row on a skipped order, and the CHECK `orders_skipped_finance_status_check` refuses a skipped order at Waiting for Finance or Waiting for settlement. No guard on the mark itself (review of the plan, Should fix 2).
8. **Look first** (approval order). The overspend notice of a skipped order is sent by its Close, to every active Head, under the guard of that moment (`orderOverspend().needsHead`); no acknowledgment is asked.
9. The switch is its own action with its own confirmation (`switchFinanceStep`, `catalog.manage`), not a key of the settings form, whose Zod schema stays strict; the audit row has the form's shape (`settings.change`, `{ finance_step }` before and after). The same value again writes nothing.
10. The refusal names the waiting orders of the whole school as a field refusal (`errors.field.financeStepWaiting`, the numbers in `available.orders`), and the Settings page lists them with links while the step is on (`getFinanceStepWaiting()`).
11. The Closed notice of a skipped order goes to the owner, the Heads and the branch's Finance users, as every close.
12. Switching on sends no vacancy notice; the Users page warning comes back at once. `staffedRoles()` and `vacatedPlaces(…, financeStep)` in `src/domain/users.ts`.
13. The History tab marks the Principal's approval that opened the order (`skippedFinanceBy()` of `src/domain/order-steps.ts`); no new event type.
14. The seed is unchanged: no `finance_step` row means on.

Choices made during the build:

- `MoveInput.financeStep` carries the setting into the state machine; the approval's `facts` step writes it on every locked order (`LockedOrder.financeStep`), and the move reads it once for the action. `PlannedMove.skipsFinance` marks the orders `afterMove` writes `skipped_finance` on.
- The confirmations state the result (11 rule 6): the Principal's Approve with the step off ("opens for buying at once"), Close of skipped orders, Reopen of skipped or mixed orders (`move-texts.ts`, `approveResultKey()`, `reopenResultKey()`), and the switch both ways. The order page, the list's ticked summary and the Principal's home pass the step and the mark to the buttons.
- A purchase date before the Principal's approval of an order that skipped Finance says "before the Principal approved the order" (`beforePrincipalApproval`), when every order of the trip skipped Finance; the rule is the same `approved_at`.
- S21 in the browser runs as the project `finance-step`, the teardown of a new project `start` (`tests/e2e/run-order.setup.ts`) on which both widths depend: the step is the whole school's and every other browser test's approvals read it, so S21 runs after every other test of the run, and in full in each of CI's four shards, each with its own database. It first moves orders other tests left Waiting for Finance or for settlement (Rejected, Closed) and puts the step back on at its end.

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

### 1.12b Managers add products and subtypes while ordering (25.10.2026)

The plan's decisions as the plan review of 25.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (permission matrix). The add is a global permission `catalog.add`: Head yes, Manager yes guarded by `ADD_PRODUCTS`, Principal and Finance no. Products and subtypes hold no branch. A global rule may now carry a `right`, which `decide()` and `decideList()` read for Managers only. The action does not also ask `CREATE_REQUESTS` (plan review: the matrix row stands on its own); the permission review asked whether a Manager with `CREATE_REQUESTS` off, or without a branch, should be refused too. That question is left to the owner on issue #9.
2. **Look first** (stock). On a product without subtypes the hidden default keeps its id, price, price rows and photo, changes only its name (to the existing items' name) and `is_default`; the new name is a new row, which alone takes the photo, the client key and `added_by` (04 rule 8; plan review, correction 2; spec review of the plan, Must fix 1). The Head's own subtype page keeps 1.8's behaviour (the first subtype is the default made real).
3. **Look first** (a test and an action removed because a requirement changed). `suggestProduct`, its page action, `/suggestions/new`, the suggestion form and their tests are removed (04 rule 8: "no new ones are sent"). The decide side, the lists and their tests stay and start from `insertSuggestion()` (`tests/helpers/suggestions.ts`), which writes the row and the audit row as the action did. `catalog.suggest` now means seeing suggestions. `catalog_suggestions` and `PRODUCT_SUGGESTED` stay.
4. **Look first** (04 rule 3). A taken name is not an error: the action returns `outcome: "exists"` with the entry's id, name and active flag and writes nothing; the dialog offers "Use it" for an active entry and names an inactive one. The comparison is the unique index's own expression (`findTaken()` of `defineCatalogActions()`), under the table's lock; a subtype's name is compared inside its product, the hidden default left out.
5. `added_by` is set only when the actor is a Manager; the Head's own add writes none.
6. History: the renamed default gets a `subtype.create` row with `fromDefault: true`, then the new row its own `subtype.create`, and the product `product.update { hasVariants }`. The check writes `product.check` / `subtype.check` with `{ checked: false → true }`.
7. `existingName` is required (`errors.field.required`) only when the locked product has no subtypes; on one with subtypes it is ignored. Equal to the new name, compared in SQL, is `errors.field.taken`.
8. The Add line shows only when the search returns no product for the text typed now (11 rule 2), for the Head and a Manager whose right is on (`actorMay("catalog.add")` on the page).
9. After a save the picker asks `searchDraftProducts` for the product's name and picks the made subtype, so the row takes it through the normal pick.
10. `markAddedChecked` is all or nothing, at most 200 ids; an unknown id is "Not found", a Head-made or already checked entry `wrong_status`. It asks first, with the count, in the selection bar's confirmation.
11. The Head's home block "Added by Managers" sits after the write-offs, shows the 5 newest with the count, is hidden when empty and counts in the all-empty check (plan review, correction 1).
12. The category and measure selects use `listCatalogChoices` (`catalog.pick`, active, at most 50 each), through a new page action `listAddChoicesAction`.
13. The S22 browser test makes its own branch, Manager and Head (`newScene()`), so switching the right off touches no other spec; it types "Pen black …" to reach the Add line, since "black" alone would find the marker (plan review, correction 3).

Choices made during the build:

- **Look first** (stock; tests changed because a decision changed). Build (6), added to the task by the spec change of 25.10.2026 after the plan review (D64): the Head's `createSubtype` on a product without subtypes takes `existingName` (required there, `errors.field.required`), names the default with it and makes the new subtype a new row, through the same `addSubtypeFromSearch()` as the add from an order; a name the product holds stays `errors.field.taken`. The first subtype's price is the new row's own (with its HEAD row); the default keeps its own price, so 1.8 decision 2's "a sent price is refused on the first subtype" no longer applies to the catalog page. The Excel import of new products keeps the default made real (`addSubtype()`): a new product has no existing items. Tests of 1.8 and 1.9 that asserted the default made real now assert the new behaviour (`subtypes.db.test.ts`, `prices.db.test.ts`, `seed.db.test.ts`, `route.db.test.ts`, `subtypes.spec.ts`); none was weakened.
- **Look first** (decided item 15 changed). The add dialog's category and measure selects use `listAddChoices()` (catalog.pick, every active entry, no cap) instead of `listCatalogChoices` (at most 50): the S22 browser test showed a measure past the 50th unreachable in a select that cannot search.
- The name comparison of `existingName` had `'\s+'` written so that the template gave `s+`, folding the letter "s" instead of spaces; fixed to the catalogs' own escape, with a test ("ss" against "s") that fails on the old line.
- The subtype action's result carries the written rows inside the transaction for the history step (`written`); `subtypeAddShown()` strips them before the browser sees the result.
- The S22 database test checks the picker's answer through `searchDraftProducts`: the marker and "black" have no suggested price; "blue" keeps its 3 000 and its 40 in stock.
- The switch notice `MANAGER_RIGHT_SWITCHED` names the tenth right in its `select`.

### 1.12c The Head's first subtype names the existing items; adding needs both rights (26.10.2026)

The plan's decisions as the plan review of 26.10.2026 confirmed them (corrections 1 and 2 applied). The Look first items come first.

1. **Look first** (permission matrix). A global rule may carry a second Manager right, `alsoRight`, read in `decideGlobal()` beside `right` for Managers only, so `decide()`, `decideList()` and `actorMay()` read it in one place (developer-rules rule 4). `catalog.add` has `right: ADD_PRODUCTS, alsoRight: CREATE_REQUESTS` (03 Manager rights, the ADD_PRODUCTS row; 04 rule 8; D66). This replaces the part of 1.12b decided item 1 under which the action did not ask `CREATE_REQUESTS`. The oracle carries `alsoRight` too, and `describePermissionMatrix` writes its switched-off case from it (plan review, correction 2).
2. **Look first** (no new build of part 1). The Head's first subtype naming the existing items was built in 1.12b (its Build 6, a Look first build decision) and is not rebuilt; the 1.8 and 1.9 tests of the old conversion were changed there with the reason. This task extends the 04 rule 1 database test (the photo, the default's price row, "black" with its own price row and no stock; plan review, correction 1) and rewrites the comments that still stated the old rule (`subtypes.ts`, `manager-adds.ts`, `permissions.ts`). It replaces, without editing their sections: 1.8 item 1, 1.8 item 2's refusal of a sent price on the first subtype, and 1.12b build item 2's "the Head's own subtype page keeps 1.8's behaviour".
3. "Sees no Add line" is proved by the unit test of `actorMay("catalog.add")`, the line's only gate on the grid and the phone card; no new Playwright test: with `CREATE_REQUESTS` off the drafts are not editable (`draftRowRights()`, `request.edit`), so no product search is drawn and a browser test could not fail without the change.
4. "The photo stays on the default id": the default's own photo field is unchanged (empty: it shows the product's, plan of 1.8 decided item 8), the product keeps its photo, and the Head's photo goes to the new row only.
5. Only the `ADD_PRODUCTS` "off" text changes, adding 03's sentence in en, ru and uz; the owner corrects ru and uz later (D12).


Choices made during the build:

- **Look first** (a test changed because a decision changed). The ten-rights test of 1.4 (`manager-rights.db.test.ts`, "each of the ten rights switched off") expected `catalog.add` allowed with `CREATE_REQUESTS` off, the rule before D66; it now reads both rights of each rule and expects `catalog.add` refused with either off. Not weakened: every case it had stays, one more answer is "forbidden". Found by CI and the permission review; a line in `.claude/rules/tests.md` asks every test that reads rights to read both.

### 2.5c The order sheet (26.10.2026)

The plan's decisions as the plan review of 26.10.2026 confirmed or changed them (corrections 1 and 2 applied), and those of the build. The Look first items come first.

1. **Look first** (06 rule 8: which orders a Submit sends). "The drafts the screen shows" is the sheet's submit set, read with the page, not only its 25 rows: every own Draft without a number in the sheet's branch view, at most 1 000 (this plan's limit, not the spec's), oldest first, with its version and its refusals by `submitRefusals()`. Submit with nothing ticked sends the set: a row on the page with the version its save queue gives after its saves land, a row of another page with the version the page loaded. The 201 test of Done-when cannot be met by one page of 25. Proposed `/spec-change` of 05 Drafts 4, if the owner wants it written: "… sends every ready draft of the user's own that has no number, on every page of the sheet as the screen loaded them".
2. **Look first** (06 rule 8). A sent order the nothing-ticked Submit may not take refuses the whole submit: a numbered Draft (taken back) or a sent-back order `wrong_status`, another owner's draft `forbidden`. Only "fails a check" is left in the sheet.
3. **Look first** (CLAUDE.md rule 3, the wrapper). The order-action wrapper has an optional `leave` step after every check and before the action row: the kept orders alone get the action row's count, the version raise, the events, the plan, the numbers, the snapshots and the notices; the left orders are untouched. With none kept the whole is refused `not_ready`. `ordersInput()` takes a larger maximum for such an action; the state machine's check judges its set 200 at a time (`checkOf` in `src/server/order-moves.ts`).
4. The 200 cap counts ready drafts only: the first 200 ready by `created_at`, then id (`submitSelection()` of `src/domain/submit-checks.ts`); a not-ready draft takes no place.
5. The draft above a new one is the last row of the page shown; its branch, department and needed-by date are copied as they are (`copiedFromAbove()`); the add row gained a needed-by date field. A branch the user cannot add in is not taken; the department follows only its own branch.
6. The branch cell shows for a user who may add drafts in more than one active branch.
7. **Look first** (a money total shown). With nothing ticked the sheet's total is of the rows on the page shown, labelled "On this page" (`tickedDraftsTotals()`, as before). Proposed `/spec-change` of 11 rule 2, if the owner wants the whole sheet: "The total of the sheet (of the rows on the page shown, or of the ticked drafts when some are ticked) stays visible."
8. The confirmation says how many go and how many stay (the not-ready and the held-back ones of the set). With none ready, the Submit with nothing ticked is not offered; the live marks say why.
9. A refusal in a field under "More" marks "More" and opens it; the list on top names the field as before.
10. Rows of the set on the page are judged live by `submitRefusals(shownFacts(row), today)` and marked on the cells that stop them; rows of other pages by the refusals the page loaded. `today` is the business date of the server's injected clock. The server decides again under its locks.
11. **Look first** (CLAUDE.md rule 8, the repeat; changed by the plan review). The repeat answers the first result with `left` and `heldBack`, rebuilt without a database change: the sent ids the stored action's events do not name, each with its cells from `submitRefusals()` on the row now; a ready one is counted as held back by the cap (`leftOnRepeat`). The repeat's ids pass the branch and draft walls first, as every repeat's.
12. The client key of the nothing-ticked Submit is kept while the set (its ids) is unchanged and no answer came; any answer drops it.

Choices made during the build:

- The order number, revision, label and another owner's name stand above the product in the product cell (a phone card shows them on its top line); a row without a number shows none of them and no word "Draft", and the key `orders.draftWord` is removed (Build 4).
- "More" is a second table row under its draft (`tr[data-more-of]`), spanning the width; on a phone it continues the card. Its fields keep their labels and `data-col`, so a refusal scrolls to them.
- A Submit with nothing ticked that leaves drafts says so on top ("N drafts stay in the sheet: they need a fix") instead of "Nothing was submitted"; a count held back by the cap is told in a second message.
- The e2e helper `newProduct()` takes `null` for a product without a reference price (S23's markers): no price row is written then, as the database asks.
- The S23 database test sets Urgent through `updateDraft`, the save "More" makes.

### 2.9b A simpler order page (26.10.2026)

The plan's decisions as the plan review of 26.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (approval order, permission matrix). The main action is the first offered of: Approve, Submit, Submit again, Record purchase, Close (exact match), Close (skipped Finance), Send to settlement, Settle, Close (Finance), Acknowledge overspend, Record money; Copy as new only on Closed, Rejected and Cancelled (`mainAction()`, `src/domain/main-action.ts`). Undo, stop and correction moves (Reject, Cancel, Take back, Send back, Send back for correction, Reopen, Reopen buying, Finish order, Not bought) are never main; they open under "More". A user who only waits sees "More" alone; a user with nothing offered sees no bar. Nothing new is offered: the bar picks among allowedActions(), buyingActions() and the page's can… facts, and every action asks the server again.
2. **Look first** (approval order). "Since when" is the newest event whose "to" is the current status and whose "from" differs: the SQL fragment `enteredCurrentStatusAt` of `src/features/orders/order-sql.ts`, read by the stuck filter and the reminders, selected as `waitingSince` by `getOrderPage` (review correction 1: no second copy in `src/domain/`). Buying, money and move-owner events do not reset it; a draft never submitted shows no date. Tests: `order-page.db.test.ts`, "who acts next and since when".
3. **Look first** (branch wall, 03 rules 2 and 3). The top line names the branch's active Principal (or "none is assigned", with the date) and the owner; the Head and Finance are named by role ("Finance of B1"). It is shown always, to everyone who may see the order; it replaces the 2.9 waiting line, which showed only without a move.
4. **Look first** (06 Finance step switched off 3). An Open order that skipped Finance, with its buying finished and an owner without `CLOSE_ALONE`, waits for the Head: `waitingFor(status, open)` with the optional Open facts (review correction 2); the reminders call it without them, unchanged.
5. **Look first** (spec contradiction; money). 08 The three colours ("Each order shows three labels on its page") and 06 Finance step switched off 3 against 11 Order page layout 2 ("the planned total while nothing is bought"): before Open the planned total alone; from Open on the three labels beside the block's title, over the planned total while nothing counted is bought, and over the table once something is. Built: a finished Not bought order with nothing received shows the planned total with "Bought fewer" and "Left …" rather than the table, because `planVsActual()` has no actual price without a live record and no formula was added for the screen. Proposed `/spec-change` of 11 Order page layout 2: "**Plan and actual,** one block: the planned total while the order is not yet Open; from Open on, the three colour labels, with the planned total while nothing is bought, and otherwise the plan beside the actual quantity, price and extra costs with what each did to the total. Nothing in it is shown twice."
6. **Look first** (tests changed because the requirement changed, D65). `order-page.spec.ts` (the waiting line is the top line, the stepper on History, the owner's moves under "More", no bar for Finance), `send-back`, `copy-as-new`, `close-exact`, `purchase`, `acceptance-money` (actions under "More" through `barAction()`), `approvals`, `send-back`, `acceptance-orders`, `acceptance-finance-step` (the stepper read on History). No assertion was dropped; counts of the bar's buttons count "More" and, once opened, the actions under it.
7. "Nothing counted is bought" is an actual quantity of 0: cancelled records do not count (08 Actual quantity). Test: `order-page-layout.spec.ts`, an Open order whose only record is cancelled.
8. "More" is a disclosure inside the bar (`aria-expanded`, the actions under a hairline), not a pop-up menu: each action's confirmation dialog lives in its button. It closes once an action is answered. Written into `docs/design-system.md` as "Order page action bar".
9. The bar keeps its place and stickiness from 640 px; danger confirmations stay.
10. Details leaves out a needed-by date, quantity or price not given, and the stock lines of a service. Payment type and priority stay.
11. The header's progress, substitution, urgent and overdue marks stay; the strip's Planned total, Actual total and "Against the plan" are gone.
12. Texts: `orders.page.top.*` (an ICU select on `since`, `none` without a date) and `orders.page.bar.more` in uz, ru and en; `orders.page.waiting`, `totals`, `actualTotal`, `outcome` and `notBought` left the three files (nothing else read them).

Choices made during the build:

- `CopyButton` and `RecordMoneyButton` take a `variant`, so either can be the primary button.
- `PlanActualTable` became `PlanActualBlock` in `plan-actual-block.tsx`; the table inside it is unchanged.
- The order that skipped Finance is opened at both widths by `acceptance-finance-step.spec.ts` (the project allowed to switch the step); the other three orders by `order-page-layout.spec.ts`.

### 2.5d-a Fields the Head sets: every field but the price (26.10.2026)

The plan's decisions as the plan review of 26.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (task split). 2.5d is split into 2.5d-a (every field but the price) and 2.5d-b (the price, the Finance switch refusals, S24). A missing price reaches every caller of `orderTotal()` and the approvers' screens, so all of it lands in one pull request; until then the price row offers Required only (`PRICE_ASK_CHOICES_NOW`), so no submitted order lacks a price, though the loosened CHECK already allows it.
2. **Look first** (hidden values at submit; 05 rules 2 and 4). A draft that never had a number takes each hidden field's hidden value: payment type the default, priority Normal with no reason, department, needed-by, brand, requester name, comment and reference photo empty, extra costs removed. An order with a number (sent back or taken back) keeps what it holds; a hidden field of it is checked as an optional one.
3. **Look first** (constraint scope). `orders_planned_price_total_check` leaves a Draft free: a draft may hold a price before its quantity (autosave). From submit on it holds.
4. **Look first** (Cancel). A Cancel of a taken-back draft asks the subtype, the quantity, the price with its total and an urgent reason, not the field settings; the department and the needed-by date are free (D67). Until 2.5d-b the price stays asked: the price row is fixed at Required, and the analytics refresh and the other `BigInt(planned_total | planned_price)` readers still expect it outside Draft (review of 625cd64, finding 1). `cancel.db.test.ts` keeps its cleared-price refusal and adds a cleared-quantity one; a Cancel without a price is 2.5d-b's (build plan, Build 4).
5. **Look first** (constraint loosened, tests changed because the requirement changed, D67). `orders_submitted_plan_check` asks only subtype, quantity and submit time; `orders.db.test.ts` (the required columns), `drafts.db.test.ts` (the department no longer required to save a draft) and `analytics-0041.db.test.ts` (`analytics_orders.needed_by` may be empty) are changed with that reason. `settings.db.test.ts` lists the new key's defaults; the browser tests `settings.spec.ts` and `acceptance-money.spec.ts` name the settings form's Save exactly, since the order fields have a Save of their own (no assertion dropped).
6. `order_fields` always holds all ten fields; payment type and priority take `shown`/`hidden`, extras `optional`/`hidden`; no row is the defaults.
7. Two empty departments are one trio through a second partial unique index (owner, branch, subtype, where no number, no department and a subtype), so an empty row without a subtype never collides.
8. Orders without a department are counted in every total of analytics and reports and left out of the split by department (05 rule 3 as on `main` when the build reached analytics, as the plan review's correction 3 asked). Spec change #172 (D68, "No department") was merged afterwards, during this task's finish: it is written into 2.5d-b, with the drill-down its bar needs (a "no department" value of the department filter, read by every analytics filter). Lists of orders (the order list, its download, the analytics order list, the purchase register) take them by a left join and show "No department" or an empty cell.
9. A field the setting hides is still saved by the draft actions when sent: a sheet opened before the Head's change keeps its autosave, and submit writes the hidden value.
10. The sheet's row order: the department, the quantity, then price and needed-by, then any other field set in the row in the order of 05's table; "More" is left out when nothing stands there.
11. The Playwright test of the setting runs in its own project, `order-fields`, the teardown of `finance-step`, so the school-wide setting never changes under another browser test.

### 2.5d-b Fields the Head sets: the price (26.10.2026)

The plan's decisions as the plan review of 26.10.2026 confirmed them (corrections 1 to 3 applied), and those of the build. The Look first items come first.

1. **Look first** (task split). 2.5d-b is split into 2.5d-b (the price everywhere an order is worked on, the switch refusals, S24) and 2.5d-c (analytics and reports: "No department" with its filter, and "N without a price" beside their sums), written into the build plan. In 2.5d-b every analytics and report reader already takes a missing price and leaves the order out of planned sums; until 2.5d-c those sums do not say how many they leave out.
2. **Look first** (money, one formula). `OrderPlan.price` is `bigint | null`; `orderTotal()` and `plannedCash()` return null without a price (overloads keep `bigint` for a `PricedPlan`); `ordersTotals()` sums the priced orders and returns `unpriced`; `orderGoods()` takes a priced plan only. Worked: 10 × 4 500 priced and one unpriced give 45 000 and 1.
3. **Look first** (the three colours). An unpriced order: Number as any order; Price and Total "No planned price" (muted, info icon, no amount), from Open on. A set: Total the summed difference of the priced orders, Price the worst among them, `unpriced` the count; all unpriced: "No planned price".
4. **Look first** (`planVsActual()`). Without a planned price: planned price, planned total, difference and effects null; the actual numbers as for any order. The order page reads "No planned price" in their cells.
5. **Look first** (overspend and closing). No overspend, no notice, no acknowledgment (`orderOverspend()` none; `settlementFactsOf()` gives no facts for an unpriced order). Never an exact match; once Open it always skipped Finance, so the owner or the Head closes it (06 rule 3).
6. **Look first** (Cancel; completes #173 decided item 4). A Cancel of a taken-back draft no longer asks the price; a price with a quantity and no total still refuses on the price cell. `cancel.db.test.ts` and `submit-checks.test.ts` changed with that reason (D67, the requirement built).
7. **Look first** (switch on, 06 rule 8). Under the exclusive settings lock: refused while the price is not required (`errors.field.financeStepPriceNotRequired`), then while an unpriced order of any branch waits for Head or Principal (`errors.field.financeStepUnpriced`, numbers listed). Approved unpriced orders do not block. One condition (`financeStepBlockers()`) for the switch and the list on /settings.
8. A hidden price is `suggestedPrice()` of the subtype at the submit, never the draft's typed price; a numbered order keeps its own (05 rules 2 and 4).
9. **Look first** (constraint loosened; review correction 1). Migration 0057 drops NOT NULL from `analytics_orders.planned_cash` (D67: an order without a price has no planned cash). `cash_needed` keeps its NOT NULL and CHECK: 0 without planned cash.
10. No "price differs" comment on a record of an unpriced order; "Same as planned" leaves the price to be typed.
11. Copy as new of an unpriced order takes the suggested price, as any new draft.
12. Price optional and empty: the draft is ready, its total cell "—".
13. The words of a planned sum are one helper, `usePlannedSum()` / `getPlannedSum()` (`planned-sum.ts`, `planned-sum-server.ts`): "45 000 so'm · 1 without a price", or "No planned price" when the whole set is unpriced. Every screen sum of 2.5d-b uses it.
14. The Order fields block offers Optional and Hidden for the price only while the Finance step is off, with a line saying so; the server checks again under the lock (`saveSettings` `check` step, `errors.field.priceNeedsFinanceOff`).
15. While the step is off, the Finance step block lists the unpriced orders waiting for Head or Principal and says when the price is not required, so the Head sees why switching on would be refused before trying.
16. The S24 browser test is in `acceptance-order-fields.spec.ts` (project `order-fields`): it changes the school-wide Finance step and price setting, and puts both back.
