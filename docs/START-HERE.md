# Start here

The owner's one-page guide. Everything else in the pack is for Claude Code to read.

## Once

**1. Accounts**

- GitHub (free plan is enough).
- DigitalOcean, with a card that allows international online payments. Needed for the test copy, right after task 0.16 is merged.
- Cloudflare (free), for R2 file storage. Needed at task 0.15.
- Access to the DNS of `sodiqschool.uz`, to add `ombor-test` and later `ombor`.

**2. Tools on this Windows 11 machine**

Open PowerShell and check what is there:

```
node --version
git --version
gh --version
docker --version
```

Install what is missing, then close and reopen PowerShell:

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install GitHub.cli
winget install Docker.DockerDesktop
```

npm comes with Node.js. Start Docker Desktop once and let it finish its setup. Then sign in to GitHub: `gh auth login`.

**3. The repository**

```
gh repo clone sodiqschoolapp/procurement
cd procurement
```

Unzip the starter pack into that folder, so `CLAUDE.md` sits at the top. Then:

```
git add -A
git commit -m "Starter pack"
git branch -M main
git push -u origin main
```

**4. The loop**

From 12 October 2026 the tasks are built without you in the middle (`docs/cloud-loop.md`). Its one-time set-up is yours and is listed there: the second cloud environment (section 1), the two routines with their API triggers (sections 3 and 5), the four repository secrets (section 6), the ruleset of `main` (section 7, finished after task 0.3), and the first **Run now** (section 8).

## How a task is built now

1. The start routine starts the first unticked task of `docs/build-plan.md` in a cloud session. The session plans it and opens a draft pull request.
2. The review routine reviews the plan and posts a comment that starts with `[review]`. Where the spec is silent, the builder has decided and written down why; the reviewer confirms or changes each decision.
3. The builder builds, runs `/finish-task`, and marks the pull request ready. The review routine waits for the checks, reviews the code, and posts `[review] ready to merge` with `@abbosc`.
4. You merge it by hand on GitHub (D71, since go-live). The merge deploys to the live app and starts the next task.

## What you do, once a day

1. Merge each task pull request at `[review] ready to merge … @abbosc`, after reading the Look first items of its report: the merge goes live within minutes (D71).
2. Read issue #9, the items marked **Look first** first, and answer under each task's comment: `1 confirmed`, `2 change: <what instead>`.
3. Read the "Texts to read" comment of each merged pull request: the new Uzbek and Russian texts.
4. Look at what was merged, by the report's "What to look at", on the live app `ombor.sodiqschool.uz`.
5. Do what any `@abbosc` notification or `needs-owner` label asks.

Bring a changed decision, a wrong text or something that looks wrong to the reviewer chat: it writes the fix task.

## Always

- Never type a password, key or token into a chat or a session. Secrets go into the provider dashboards, GitHub's repository secrets and your local `.env` file only.
- Real names, phones, prices and stock lists of the school never go into the repository, a test or a chat. Examples use invented data.
- You merge every pull request, task pull requests included (D71, since go-live): the review routine reviews and says `ready to merge`, and merges nothing.
- The spec changes only with `/spec-change`, in its own session.
- The loop waits for you in these cases only: a secret, an account or money; production; a task that would change the loop's own rules; a migration that changes data already in the database; the builder and the reviewer not agreeing in three rounds, or the checks staying red three times; and every merge. Everything else it decides and shows you on issue #9.
- If the loop seems stuck, `docs/cloud-loop.md`, "When something goes wrong", says where to look.
- Do not change the order of the tasks by hand. A fix task goes first among the open tasks; the reviewer chat places it.

## To prepare from the school

What real people must decide or hand over before each phase. Collect it early. A missing answer no longer stops a task: the loop takes the most reasonable reading and shows it to you on issue #9, marked **Look first**; a wrong one costs a fix task. A missing account or secret still stops the step that needs it.

| Before | Prepare |
| --- | --- |
| Task 0.16 | The DigitalOcean account and its payment; someone who can add the DNS record for `ombor-test`. The steps are in `docs/deploy.md` once the task is merged. |
| Task 0.15 | The Cloudflare account, for the test copy's file storage. |
| Phase 1 | The list of branches with a 2 to 4 letter code each. The users: full name, phone, role and branches of each. School name. The first day of the school year. Departments of each branch with the responsible person. The answer to open question 18. |
| Phase 1, for the import | The catalog as Excel: products and services, subtypes, measures, categories, brands and suppliers, extra cost types, current prices. A photo for the items where it helps. |
| Phase 2 | A filled paper order request, to compare with the PDF. Answers to open questions 5 and 6. |
| Phase 3 | Answers to open questions 3 and 8. A Manager to try buying on a phone. |
| Phase 4 | A Finance specialist to walk through cash given, cash returned and a settlement. |
| Phase 5 | Answers to open questions 9, 11, 12, 13 and 19. A count of the stock each branch already has, as Excel. |
| Phase 6 | Answers to open questions 14, 15 and 16. What each role most wants to see first. |
| Phase 8 | Answers to open questions 7 and 17. Someone to correct the Uzbek and Russian texts. |
| Phase 9 | The answer to open question 10. One person per role for a trial week on the test copy. The go-live date. |

## Where things are

| File | What it is |
| --- | --- |
| `CLAUDE.md` | The rules Claude Code reads at the start of every session. |
| `docs/spec/` | The spec. Read-only. Start at `00-index.md`. |
| `docs/build-plan.md` | The 101 tasks in order, with a checkbox each. |
| `docs/progress.md` | What each finished task left for the next. |
| `docs/decisions.md` | Your standing decisions, and each task's technical choices. |
| `docs/spec-changes.md` | The log of every change to the spec. |
| `docs/prompts.md` | Lines to paste for the usual moments. |
| `docs/cloud-loop.md` | The loop: the cloud sessions, the two routines, the bridge, and what to do when something goes wrong. |
| Issue #9, issue #10 | The decisions made without you, to confirm or change; the time each task took. |
| `.claude/` | Skills, reviewer agents, path rules and permissions for Claude Code. |
