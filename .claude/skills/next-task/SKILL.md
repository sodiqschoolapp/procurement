---
name: next-task
description: Start the next build-plan task (read it, write the plan, open a draft pull request, wait for review), or, when a task branch is already open, act on the newest [review] comment and build.
argument-hint: "[task id, for example 2.7; empty = first unticked task]"
---

# next-task

One task, one session, one pull request. Only the owner merges; this skill never merges and never pushes to `main`.
Never ask for a secret in chat and never write one into a file.

All GitHub calls use `gh api`. Quote every `gh` argument, so the same line works in PowerShell and in bash. Branch names are written without quotes.
Write long texts to a file under `.claude/tmp/` (ignored by git) and pass it with `-F "body=@<file>"`.

## Which mode

Run `git status --porcelain` and `git branch --show-current`.

- On `main` with a clean tree: go to **Start a task**.
- On a `task/...` branch: go to **After the review**.
- A dirty tree on `main`: stop and say what is uncommitted. Do not stash, do not discard.

## Start a task

1. **Sync.** `git switch main`, then `git pull --ff-only`. If it cannot fast-forward, stop.
2. **Pick.** The task is `$ARGUMENTS` if given, else the first `- [ ]` line in `docs/build-plan.md`. If any task above it is unticked, stop and say so.
3. **Read**, in this order:
   - `docs/progress.md`: the last three entries, and every "what the next sessions must know".
   - `docs/decisions.md`: the Standing decisions table.
   - `docs/spec/edge-cases/00-definitions.md` and `docs/spec/open-questions.md`.
   - Every file and heading on the task's **Read** line. With a migration, also `docs/spec/edge-cases/developer-rules.md` and `docs/spec/14-data-model.md`.
   - The code the task will touch or call.
4. **Write the plan** to `.claude/tmp/plan.md` with exactly these headings:
   - `## Task`: id, title, and the task's Build and Done-when lines copied from the build plan.
   - `## What will exist`: the things a user or a test can see afterwards.
   - `## Database changes`: tables, columns, constraints, indexes; "none" if none.
   - `## Server actions and queries`: one line each, with the role, the branch scope and the Manager right it needs.
   - `## Screens`: address, who sees it, what differs on a phone.
   - `## Tests`: one line each, naming the spec file and rule it checks. Say which are unit, database, Playwright.
   - `## Questions`: numbered. Every business rule the spec does not give, every open question the task names. Do not answer them yourself.
   - `## Left out`: what the task does not build, and the task that brings it.
   - `## Size`: files you expect to touch. Above about 40, or more than one session of building: propose a split into a, b, c and stop after the review of that proposal.
5. **Self-review.** Ask the `spec-reviewer` subagent to review `.claude/tmp/plan.md` against the task's spec files. Fix every Must-fix item in the plan. Add its "Not checked" list at the end of the plan.
6. **Branch and pull request.** `<name>` is the title in lower case with hyphens.
   ```
   git switch -c task/<id>-<name>
   git commit --allow-empty -m "<id> Plan"
   git push -u origin task/<id>-<name>
   gh api "repos/{owner}/{repo}/pulls" -X POST -f "title=<id> <title>" -f "head=task/<id>-<name>" -f "base=main" -F "draft=true" -F "body=@.claude/tmp/plan.md"
   gh api "repos/{owner}/{repo}/issues/<number>/labels" -X POST -f "labels[]=needs-review"
   ```
7. **Stop.** Say only: `Waiting for review on the pull request: <url>`. Build nothing.

## After the review

1. Find the pull request and its comments:
   ```
   gh api "repos/{owner}/{repo}/pulls?head={owner}:<branch>&state=open"
   gh api "repos/{owner}/{repo}/issues/<number>/comments" --paginate
   ```
2. Take the newest comment that starts with `[review]`. No such comment: stop and say the review has not arrived.
3. Remove the label: `gh api "repos/{owner}/{repo}/issues/<number>/labels/needs-review" -X DELETE`
4. Act on its first line:
   - **`[review] approved`**: build the plan, applying every correction and every answer in the comment. Follow `CLAUDE.md` and the path rules. Commit in small steps. When the build is done, continue with `/finish-task`.
   - **`[review] changes needed`**: fix the plan, save it, update the body, add the label again, stop.
     ```
     gh api "repos/{owner}/{repo}/pulls/<number>" -X PATCH -F "body=@.claude/tmp/plan.md"
     gh api "repos/{owner}/{repo}/issues/<number>/labels" -X POST -f "labels[]=needs-review"
     ```
   - **`[review] owner decision needed`**: answer what the spec does answer, as a comment; list what only the owner can decide; stop.
     ```
     gh api "repos/{owner}/{repo}/issues/<number>/comments" -X POST -F "body=@.claude/tmp/comment.md"
     ```

## While building

- Build only what the approved plan says. A new idea goes into the report, not into the code.
- A business rule you cannot find in the spec: stop and ask. Do not guess, do not pick the "obvious" one.
- If the spec itself is wrong or must change: stop, and tell the owner to run `/spec-change` in its own session on `main`. Never edit `docs/spec/` here.
- A new dependency: ask first, with the reason and the alternative.
- If the session grows long: commit, write what is done and what is left in a pull-request comment, and stop.
