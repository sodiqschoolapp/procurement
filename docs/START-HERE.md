# Start here

The owner's one-page guide. Everything else in the pack is for Claude Code to read.

## Once

**1. Accounts**

- GitHub (free plan is enough).
- DigitalOcean, with a card that allows international online payments. Needed at task 0.15.
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

**4. Before the first task**

- Read `docs/spec/open-questions.md`. Nothing in it blocks phase 0. The first answer needed is question 18, at task 1.8.
- Open the reviewer: a second Claude chat that can read the repository's pull requests. Give it `CLAUDE.md` and tell it its job with the first line of "In the reviewer chat" in `docs/prompts.md`.

## For every task

1. In the project folder, start Claude Code and type `/next-task`. It writes a plan, opens a draft pull request and stops.
2. The reviewer reads the plan and posts a comment starting with `[review]`. Answer the questions only you can answer, on the pull request.
3. Type `/next-task` again. On `[review] approved` it builds. When it is done, type `/finish-task`.
4. The reviewer reads the finished work and posts `[review] ready to merge` or `[review] changes needed`. For changes, type `/finish-task` again.
5. Do the hand test from the report. If it is right, merge the pull request yourself. After task 0.15, check the test copy as well.

## Always

- One Claude Code session at a time in this folder. One task per session.
- Only you merge. Never ask Claude Code to merge, and never merge with a red check.
- Never type a password, key or token into a chat. Secrets go into the provider dashboards and your local `.env` file only.
- Real names, phones, prices and stock lists of the school never go into the repository, a test or a chat. Examples use invented data.
- The spec changes only with `/spec-change`, in its own session on `main`, never while a task is open.
- If Claude Code decides a rule on its own, stop it and ask where the spec says so.
- If a task feels too big, ask for a split before any code is written.
- Do not skip a task or change the order. Later tasks lean on earlier ones.

## To prepare from the school

What real people must decide or hand over before each phase. Collect it early; a missing answer stops the task that needs it.

| Before | Prepare |
| --- | --- |
| Task 0.15 | DigitalOcean and Cloudflare accounts; someone who can add the DNS records. |
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
| `docs/build-plan.md` | The 100 tasks in order, with a checkbox each. |
| `docs/progress.md` | What each finished task left for the next. |
| `docs/decisions.md` | Your standing decisions, and each task's technical choices. |
| `docs/spec-changes.md` | The log of every change to the spec. |
| `docs/prompts.md` | Lines to paste for the usual moments. |
| `.claude/` | Skills, reviewer agents, path rules and permissions for Claude Code. |
