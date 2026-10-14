---
paths:
  - "src/features/**/actions/**"
  - "src/features/**/queries/**"
  - "src/server/**"
---

# Server actions and queries

Read first, under `docs/spec/`: `edge-cases/developer-rules.md` rules 3, 4, 8, 9, 13; `03-roles-and-permissions.md` (Rules; Manager rights the Head can switch; Permission matrix).

- Every write goes through the action wrapper, in its fixed order, in one transaction. No action opens its own transaction.
- Every action and every query calls `authorize()`. Lists filter by branch inside the SQL. Another branch gives "Not found".
- Every input is checked with Zod on the server. Every id from the browser is checked to belong to a branch the user may use.
- Create actions take a `client_key`; request writes take the `version`.
- Time comes from the injected clock. Notifications and history events are written inside the same transaction.
- Each new action is added to the permission-matrix test in the same task.
- A log never holds a database error's message: Drizzle's carries every bound value of the statement, and PostgreSQL's can quote one. Log through `describeForLog()` of `src/server/action.ts` (name, PostgreSQL code and constraint only). (Review of 0.8.)
- An action that is not a create has a `lock` step: the check of branch, owner and version runs under the lock. Each action's `target` reads branch and owner from the database, never from the input (a create excepted).
