# Prompts for the usual moments

Short lines to paste. Replace what is in `<...>`.

## The loop runs by itself

Nothing is pasted for a normal task (`docs/cloud-loop.md`). These are for the moments when you step in.

| Moment | Where | Paste or do |
| --- | --- | --- |
| Start the loop, or wake it | claude.ai/code/routines, the start routine | **Run now** |
| A pull request got no review | claude.ai/code/routines, the review routine | **Run now** |
| Confirm or change a decision | issue #9, under the task's comment | `1 confirmed` or `2 change: <what instead>` |
| A session stopped and does not go on | the session at claude.ai/code | `Read the review on the pull request and proceed.` |
| A review is wrong | a comment on the pull request | `[review] changes needed` or `[review] approved`, then what you want, numbered |
| A `needs-owner` pull request is settled | the pull request | remove the label `needs-owner` |
| Build one task by hand | a cloud session with the `procurement` environment | `/next-task`, or `/next-task 2.7` |
| Review one pull request by hand | a cloud session | `/review-pr <number>` |
| Correct the direction of a session | the session | `Stop. That is not in the plan. Go back to the approved plan; put this idea in the report.` |
| A bug | the reviewer chat | `Bug: <what I did, what I saw, what I expected>.` It becomes a fix task whose first step is a test that fails for this reason. |
| End of a phase | a cloud session | `/spec-check <module>` |

## In a session of its own

| Moment | Paste |
| --- | --- |
| A rule must change | `/spec-change <what must change and why>` |
| An open question is answered | `/spec-change Open question <n>: the answer is <answer>.` |
