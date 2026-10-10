---
name: spec-check
description: Read one whole module of the built code against its spec files and list every gap. Reports only; changes nothing.
argument-hint: "<module: catalogs | requests | approval | purchasing | money | warehouse | notifications | analytics | reports | permissions>"
---

# spec-check

A slow, complete read of one module against the spec. Use it at the end of a phase and before go-live. It changes no file and opens no pull request.

## Which spec files

| Module | Spec files under `docs/spec/` |
| --- | --- |
| catalogs | `04-catalogs.md`, `02-assumptions.md` |
| requests | `05-order-request-form.md`, `edge-cases/requests-and-approval.md` |
| approval | `06-approval-workflow.md`, `edge-cases/requests-and-approval.md` |
| purchasing | `07-purchasing.md`, `edge-cases/purchasing-and-money.md` |
| money | `08-money-and-settlement.md`, `edge-cases/purchasing-and-money.md` |
| warehouse | `09-warehouse.md`, `edge-cases/warehouse.md` |
| notifications | `10-notifications-analytics-reports.md` (Notifications; Home page per role) |
| analytics | `10-notifications-analytics-reports.md` (Analytics page per role) |
| reports | `10-notifications-analytics-reports.md` (Reports) |
| permissions | `03-roles-and-permissions.md`, `edge-cases/developer-rules.md` |

Always also: `edge-cases/00-definitions.md`, `edge-cases/developer-rules.md`, `edge-cases/system.md`, `11-screens-and-ux.md`, `14-data-model.md`, `15-quality-and-acceptance.md`.

## How

1. Read the spec files of `$ARGUMENTS` from the first line to the last.
2. Turn them into a numbered list of single statements: every table row, every numbered rule, every field rule, every edge case.
3. For each statement, find the code that does it and the test that proves it. Read the code; do not trust names.
4. Mark each: **Done** (code and test), **No test**, **Partly** (say what is missing), **Missing**, **Differs** (say how), **Not yet** (a task still unticked brings it; name the task).

## Report

A table: number, statement, spec file and heading, mark, where in the code, note. Then:

- every **Differs** and **Missing** again, as a short list, worst first by the ranking in `CLAUDE.md` "What matters most";
- places where the code does something the spec does not say;
- what you could not check.

Do not fix anything. The owner decides which gaps become tasks in `docs/build-plan.md`.
