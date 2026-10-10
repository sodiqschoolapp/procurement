# Prompts for the usual moments

Short lines to paste. Replace what is in `<...>`.

## In Claude Code (the builder)

| Moment | Paste |
| --- | --- |
| Start the next task | `/next-task` |
| Start a named task | `/next-task 2.7` |
| The review has arrived | `/next-task` (on the task branch it reads the newest `[review]` comment and acts on it) |
| The build is done | `/finish-task` |
| The review of the finished work asked for changes | `/finish-task` |
| Correct the direction | `Stop. That is not in the plan. Go back to the approved plan; put this idea under "For the owner" in the report.` |
| It guessed a rule | `Stop. Where in docs/spec/ is that rule? If it is not there, undo it and write it as a question on the pull request.` |
| A bug | `Bug: <what I did, what I saw, what I expected>. First write a test that fails for this reason and show it failing. Then fix it. Do not change any other behaviour.` |
| A long session | `Commit what works. Write on the pull request what is done, what is left and what you would do next. Then stop.` |
| It wants a new library | `Not yet. Tell me what it is for, what it costs us, and how we would do it without it.` |
| A check fails | `Do not change or skip the check. Show me the failure and find the cause.` |
| The spec seems wrong | `Do not edit docs/spec/. Write the problem and your proposed wording as a comment on the pull request and stop.` |
| End of a phase | `/spec-check <module>` |

## In the reviewer chat

| Moment | Paste |
| --- | --- |
| A plan is waiting | `Review the plan on pull request <number> of sodiqschoolapp/procurement against the spec. Answer its numbered questions from the spec where you can. Reply with one comment that starts with [review] approved, [review] changes needed or [review] owner decision needed.` |
| Finished work is waiting | `Review pull request <number> as finished work. Check it rule by rule against the spec and against CLAUDE.md "Rules that are never broken". Reply with one comment that starts with [review] ready to merge or [review] changes needed, with numbered findings: file, line, spec file and heading, what is wrong.` |
| Approve with a correction | `[review] approved` then the corrections and the answers, numbered. |
| The reviewer runs in Claude Code | `/review-pr <number>` |

## In a separate session on `main`

| Moment | Paste |
| --- | --- |
| A rule must change | `/spec-change <what must change and why>` |
| An open question is answered | `/spec-change Open question <n>: the answer is <answer>.` |
