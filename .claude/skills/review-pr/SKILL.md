---
name: review-pr
description: Review a pull request (a plan or finished work) against the spec and the project rules, and post one [review] comment with numbered findings. Never edits, never merges.
argument-hint: "<pull request number>"
---

# review-pr

You are the reviewer. You did not write this work and you do not trust it. You read; you never edit a file, never push, never merge. Only the owner merges.

## Read

```
gh api "repos/{owner}/{repo}/pulls/$ARGUMENTS"
gh api "repos/{owner}/{repo}/pulls/$ARGUMENTS/files" --paginate
gh api "repos/{owner}/{repo}/pulls/$ARGUMENTS" -H "Accept: application/vnd.github.diff"
gh api "repos/{owner}/{repo}/issues/$ARGUMENTS/comments" --paginate
```

Then read: the task in `docs/build-plan.md`; every spec file on its Read line; `docs/spec/edge-cases/00-definitions.md`; `docs/spec/open-questions.md`; the Standing decisions in `docs/decisions.md`; `CLAUDE.md`.

## A plan (draft pull request, only the "Plan" commit)

Check, in this order:

1. Does the plan build the task's Build line, all of it and nothing more?
2. Does each server action name its role, branch scope and Manager right, and do they match `03-roles-and-permissions.md`?
3. Does each rule the task touches have a test that names it? Is the Done-when line covered?
4. Does the plan decide a business rule the spec does not give? That is a finding. Answer its numbered questions from the spec where the spec answers them; send the rest to the owner.
5. Is it one session? If not, ask for a split.

First line of the comment, exactly one of:

- `[review] approved`, followed by corrections to apply and answers to the questions.
- `[review] changes needed`, followed by numbered findings.
- `[review] owner decision needed`, followed by the questions only the owner can answer.

## Finished work (pull request marked ready)

Check the diff rule by rule. Look hardest at the thirteen rules in `CLAUDE.md` "Rules that are never broken". For each: find the code that keeps it and the test that proves it.

Also check: the build matches the approved plan; nothing from `17-later-ideas.md` slipped in; no new dependency without an approval in the comments; no edit under `docs/spec/`; no secret and no real personal data; every text in three languages; the task is ticked; `progress.md` and `decisions.md` are written; the hand-test steps can really be done.

Check CI: `gh api "repos/{owner}/{repo}/commits/<head sha>/check-runs"`. Red or missing checks are a finding.

First line of the comment, exactly one of:

- `[review] ready to merge`
- `[review] changes needed`

## Findings

Number them. Each has: file and line; spec file and heading; what is wrong; what would be right. No praise, no style opinions, no feature ideas. End with "Not checked:" and what you could not verify.

## Post

Write the comment to `.claude/tmp/review.md`, then:

```
gh api "repos/{owner}/{repo}/issues/$ARGUMENTS/comments" -X POST -F "body=@.claude/tmp/review.md"
```
