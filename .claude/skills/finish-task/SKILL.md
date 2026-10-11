---
name: finish-task
description: Finish the task on the current task branch - run all checks and both reviewers, tick the task, write progress and decisions, mark the pull request ready, post the report with hand-test steps, and wait for the [review] comment.
---

# finish-task

Run on a `task/...` branch after the build. Only the owner merges; this skill never merges.
Never ask for a secret in chat and never write one into a file.
`{owner}/{repo}` is `sodiqschoolapp/procurement`; write it out if `gh` cannot work it out by itself. If `.claude/tmp/` cannot be written, use a folder outside the repository.

## If a review of the finished work already exists

Read the comments (`gh api "repos/{owner}/{repo}/issues/<number>/comments" --paginate`). If the newest `[review]` comment is `[review] changes needed` and is newer than your last report: fix each numbered finding, then run steps 1 to 3 and 6 to 8 below, and in the report list each finding with what was done. If a finding is wrong, say why with the spec file and heading; do not ignore it silently.

## Steps

1. **Checks.** All must pass with no warnings. Fix the code, never the check.
   ```
   npm run lint
   npm run typecheck
   npm test
   npm run test:e2e
   npm run db:migrate
   npm run db:seed
   ```
   Run the last two against an empty local database when the task has a migration or touches the seed.
2. **Reviewers.** Ask the `spec-reviewer` subagent, and then the `permission-reviewer` subagent, to review the diff against `main` (`git diff main...HEAD`). Give each the task id. Fix every Must-fix item and run step 1 again. Keep their Should-fix and Not-checked lists for the report.
3. **Definition of done.** Go through the list in `CLAUDE.md` line by line. Anything not met is fixed or named in the report.
4. **Tick the task** in `docs/build-plan.md`: `- [ ]` becomes `- [x]` on this task's line only.
5. **Write the memory.**
   - `docs/progress.md`: a dated entry in the format at the top of that file, and update the last line to `The next task is <id>.`
   - `docs/decisions.md`: a dated section for this task with every technical choice made alone and its reason. "None" if none.
6. **Commit and push.**
   ```
   git add -A
   git commit -m "<id> <title>"
   git push origin task/<id>-<name>
   ```
7. **Mark the pull request ready.** GitHub's REST API has no call for this, so on the laptop this one step uses `gh api graphql`. Take `node_id` from the pull request.
   ```
   gh api "repos/{owner}/{repo}/pulls/<number>"
   gh api graphql -f 'query=mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}' -f "id=<node_id>"
   gh api "repos/{owner}/{repo}/issues/<number>/labels" -X POST -f "labels[]=needs-review"
   ```
   In a cloud session GraphQL is blocked and the second line fails. Use this in its place:
   ```
   gh api "repos/{owner}/{repo}/pulls/<number>/ccr/ready_for_review" -X POST
   ```
   Then read the pull request again and check that `draft` is `false`. If it is still a draft, say so in the report and in the last line; do not go on as if it were ready.
8. **Post the report** as a comment (`.claude/tmp/report.md`):
   ```
   gh api "repos/{owner}/{repo}/issues/<number>/comments" -X POST -F "body=@.claude/tmp/report.md"
   ```
   The report has these headings:
   - `## Built`: what exists now, in the words of the task's Build line.
   - `## Done when`: each part of the task's Done-when line, with the test name or the result that proves it.
   - `## Hand test`: numbered steps. Each step names a state that can be reached with what exists today: "Sign in as the seed Manager, open /requests/new, add one line, expect the footer to show 520 000". Never a step that needs a later task.
   - `## Left out`: what was not built, and the task that brings it.
   - `## Reviewers`: Should-fix items not done, and what was not checked.
   - `## For the owner`: decisions needed, data needed before the next task.
9. **Stop.** Say: `Finished <id>. Waiting for the [review] comment on <url>.` Do not start another task.
