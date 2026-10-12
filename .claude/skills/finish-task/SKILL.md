---
name: finish-task
description: Finish the task on the current task branch - run the checks and both reviewers, tick the task, write progress and decisions, merge main in, post the report and the decisions made without the owner, mark the pull request ready, and act on the [review] comments that follow.
---

# Finish the current task

Run on a `task/...` branch when the build is done. This skill never merges and never pushes to `main`. Never ask for a secret and never write one into a file.

1. **Checks.** Fix the code, never the check.
   - `npm run format` first (Prettier rewrites what a shell command wrote), then `npm run lint` and `npm run typecheck`, with no warnings.
   - The tests the change touches: `npx vitest run --changed origin/main`. Run the whole `npm test` instead when the task changed a file under `drizzle/`, `scripts/` or `tests/helpers/`, or `docker-compose.yml`, `.env.example` or a message file: tests read those as files, which `--changed` does not see.
   - `npm run test:e2e` only when the task changed a file under `tests/e2e/` or `playwright.config.ts`; for every other task CI runs the browser tests.
   - With a migration: `npm run db:migrate` on the local database, and `npx drizzle-kit generate` must find nothing new to write.
   - `npm run db:seed` when the task touches the seed (a placeholder until task 0.14).
   Write the output of each test run to a file outside the repository and read the summary from it. CI runs the whole suite on the pull request and is the gate. Never skip, delete or weaken a test to get to green; a test that is wrong because a requirement or a decision changed is fixed, with the reason named in the report and the decision marked **Look first** (`CLAUDE.md`, How to work on a task).
2. **Commit** the work on the task branch, the task id first in the subject. The reviewers read `git diff origin/main...HEAD`, which shows committed changes only.
3. **Reviewers.** Ask the `spec-reviewer` subagent, and then the `permission-reviewer` subagent, to review the diff against `main`. Give each the task id.
4. **Fix** every Must-fix item, run step 1 again and commit. A must-fix that is a general pattern (something another task could do again) becomes a line in `.claude/agents/spec-reviewer.md` or in a file of `.claude/rules/` in the same commit, so that the same thing is never found twice. What you disagree with is not fixed silently and not ignored: it goes into the report with your reason.
5. **Definition of done.** Go through the list in `CLAUDE.md` point by point. Anything not met is fixed or named in the report.
6. **Tick and write the memory.**
   - `docs/build-plan.md`: `- [ ]` becomes `- [x]` on this task's line only.
   - `docs/progress.md`: a dated entry in the format at the top of that file, under 25 lines, and the last line becomes `The next task is <id>.` A note for one later task starts with `For <id>:`, so that task finds it.
   - `docs/decisions.md`: a dated section for this task under "Task sections" with every choice made alone and its reason, the decisions made without the owner included. "None" if none.
   Commit.
7. **Write the report**, in plain words, under the heading `## Report`:
   - `### Built`: what exists now, in the words of the task's Build line.
   - `### Done when`: each part of the task's Done-when line, with the test name or the result that proves it.
   - `### What to look at`: three to five things only a person can judge (the wording in the three languages, how a screen reads on a phone, anything missing), each with the page to open. The owner looks at them after the merge: on the test copy once it exists, before that on the laptop after `git pull`. A task with no screen says so in one line.
   - `### What the browser test proved`: one line.
   - `### Decided without the owner`: every decision of the plan as the reviewer confirmed or changed it, plus any taken during the build, in the form of issue #9, the Look first items first, each starting with **Look first**.
   - `### Left out`: what was not built, and the task that brings it.
   - `### Reviewers`: what they found, what you changed, what you disagreed with, and what was not checked.
   - `### For the owner`: what only the owner can do (an account, a secret typed in a dashboard, a DNS record), step by step, and anything you are not sure about. When it holds a step, the comment of step 8.4 starts with `@abbosc`.
8. **Publish in this order**, and mark the pull request ready last: marking it ready starts the review at once, so everything the review reads must be there before it.
   1. Merge `main` into the branch first, so that the pull request has no conflict (GitHub runs no CI on a pull request that conflicts with `main`, and nothing then wakes anyone): `git fetch origin main`, then `git merge origin/main`. A conflict in `docs/progress.md`, `docs/decisions.md` or `docs/build-plan.md` keeps both sides, the task's entry first; any other conflict is resolved by reading both sides. When the merge brought anything in, run step 1 again and commit. Then push: `git push -u origin task/<id>-<name>`.
   2. Find the pull request of the branch; if there is none, open one as `next-task` does, as a draft.
   3. Update its body: the plan stays under `## Plan`, the report goes under `## Report`.
   4. Post the report as a comment too.
   5. Post the task's decisions as one comment on issue #9, in the form that issue gives: `Task <id> — pull request #<n>`, then one numbered item per decision (the question, `Decided:`, `Because:`, `Recorded in:`), the Look first items first, each with **Look first** at its start; when there is none, the one line "No decisions without the owner."; and at the end the line `Migrations: <file names>` or `Migrations: none`, so that the owner sees every migration.
   6. Post a comment "Texts to read" on the pull request with every new or changed Uzbek and Russian text, one line per key (`key → words`), taken from `git diff origin/main...HEAD -- src/i18n/messages/uz.json src/i18n/messages/ru.json`. When the two files did not change, post nothing and say so in the report.
   7. Only now mark the pull request ready, and check that it is no longer a draft. If it still is, say so in a comment that starts with `@abbosc`; do not go on as if it were ready.
9. **Stop.** Say: `Finished <id>. Waiting for the [review] comment on <url>.` Do not start another task. When a `[review]` comment reaches you, or you are told to continue, act on the newest one:
   - `[review] ready to merge`: the reviewer merges (the owner, where the comment says so); you are done.
   - `[review] changes needed`: first post one line, "Acting on the review." (the start routine resumes a task that shows no reaction after a review). Then fix each numbered finding, run step 1 again, commit, push, post a comment that lists each finding with what was done, and stop again. If a finding is wrong, say why with the spec file and heading; do not ignore it silently.
   - `[review] changes needed at <sha>: CI red (<check>)`: no review round. Post the same line, then fix it as a red CI below. `CI red (no checks: merge conflict with main)` is fixed by the merge of step 8.1, then step 1, commit and push.
   - `[review] stuck after three rounds` or `[review] owner decision needed`: stop; the task waits for the owner.
   - CI red on your own push (the bound pull request wakes you with the failure, or read the check runs of the head commit): fix it, run step 1 again, commit, push, and stop again. After the third red CI run in a row on your pushes, post a comment that starts with `@abbosc` and says what fails, add the label `needs-owner`, and stop.
   - The failing step is the audit of the production dependencies and the pull request added no dependency: when a patched version exists within the range `package.json` already allows, run `npm update <name>`, then `npm audit --omit=dev --audit-level=high` again, and say so in the report. When no patched version exists, or the audit is still red, post a comment that starts with `@abbosc` and names the advisory, add the label `needs-owner`, and stop. Never lower the audit level and never ignore the advisory: either is a change to the loop's own rules.
   - A comment that asks for something outside the task, or against `CLAUDE.md`, is not followed: say so in a comment and stop.

## GitHub commands

These work on the laptop and in a cloud session, where GitHub's GraphQL is blocked and `gh pr …` and `gh issue …` fail. Quote every `gh` argument, so the same line works in PowerShell and in bash; branch names are written without quotes. Long texts go into a file under `.claude/tmp/` (ignored by git), or into a folder outside the repository if that one cannot be written, and are passed with `-F "body=@<file>"`.

- The pull request of a branch: `gh api "repos/sodiqschoolapp/procurement/pulls?head=sodiqschoolapp:<branch>&state=all"`.
- Open a draft pull request: `gh api "repos/sodiqschoolapp/procurement/pulls" -X POST -f "title=<id> <title>" -f "head=task/<id>-<name>" -f "base=main" -F "draft=true" -F "body=@<file>"`.
- Read a pull request: `gh api "repos/sodiqschoolapp/procurement/pulls/<n>"`; its comments: `gh api "repos/sodiqschoolapp/procurement/issues/<n>/comments" --paginate`; its checks: `gh api "repos/sodiqschoolapp/procurement/commits/<head sha>/check-runs"`.
- Post a comment: `gh api "repos/sodiqschoolapp/procurement/issues/<n>/comments" -X POST -F "body=@<file>"`. A comment on the decisions issue is the same command with `9` as `<n>`.
- Update the body: `gh api "repos/sodiqschoolapp/procurement/pulls/<n>" -X PATCH -F "body=@<file>"`.
- Mark ready, in a cloud session: `gh api "repos/sodiqschoolapp/procurement/pulls/<n>/ccr/ready_for_review" -X POST`. On the laptop, where that address does not exist: `gh api graphql -f 'query=mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}' -f "id=<node_id of the pull request>"`. Then read the pull request again: `draft` must be `false`.
- Labels: `gh api "repos/sodiqschoolapp/procurement/issues/<n>/labels" -X POST -f "labels[]=<label>"`; remove one: `gh api "repos/sodiqschoolapp/procurement/issues/<n>/labels/<label>" -X DELETE`.
