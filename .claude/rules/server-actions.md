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
