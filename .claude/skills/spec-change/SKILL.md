---
name: spec-change
description: The only way docs/spec/ changes - its own branch and pull request with the exact edit, a dated line in the spec-change log, and the build-plan tasks it affects.
argument-hint: "<what must change and why, in the owner's words>"
---

# spec-change

`docs/spec/` is the source of truth. It changes only here, only when the owner asked for it, and only the owner merges.

Run this in its own session, on `main`, with a clean tree. Never while a task branch is checked out. If `git branch --show-current` is not `main` or `git status --porcelain` is not empty: stop and say so.

## Steps

1. `git pull --ff-only`.
2. Restate the change in one or two sentences and name the open question it answers, if any. If the owner's words can be read two ways, ask before editing.
3. Find every place the change touches: chapter files, the `edge-cases/` files (with `edge-cases/00-definitions.md` and `edge-cases/developer-rules.md`), `open-questions.md`, `00-index.md`. A rule stated in two files is changed in both.
4. Make the exact edit. Change the fewest words that carry the change. Do not tidy, reword or "improve" anything else. An answered open question is struck through with the date and the answer, not deleted.
5. Add one line on top of the log in `docs/spec-changes.md`:
   `| <date> | <files> | <what changed, one sentence> | <why, in the owner's words> | <affected tasks> |`
6. In `docs/build-plan.md`: change the Read, Build or Done-when line of every unticked task the change affects. For a ticked task, add a new task at the right place that brings the built code in line; never untick.
7. If the change settles a standing matter, add or change its row in `docs/decisions.md`.
8. Branch, commit, pull request:
   ```
   git switch -c spec/<date>-<name>
   git add -A
   git commit -m "Spec change: <one line>"
   git push -u origin spec/<date>-<name>
   gh api "repos/{owner}/{repo}/pulls" -X POST -f "title=Spec change: <one line>" -f "head=spec/<date>-<name>" -f "base=main" -F "body=@.claude/tmp/spec-change.md"
   ```
   The body holds: the owner's request, each edit as before and after, the tasks affected.
9. Stop. Say: `Spec change is on <url>. Merge it before the next task starts.`

Editing a file under `docs/spec/` asks for permission each time. That is intended.
