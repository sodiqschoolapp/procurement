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
- `audit()` takes the actor from the wrapper: `audit({ tx, userId }, entry)` with the step's `WriteContext`, never an actor id the action builds. (Review of 0.9.)
- A page action that calls `authorize()` before it runs a feature action or query does not prove the feature's own check: each feature action and query has its own permission-matrix test, called directly. (Permission review of 1.10.)
- A notification's params and its `branchId` describe one branch only: an action on ticked orders of several branches sends one notification per branch (`orderActionNotices()` of `src/domain/notifications.ts`), and a count never covers a branch its recipient may not see. (Permission review of 2.1.)
- Every export of a `"use server"` page file is in the permission matrix through that export itself (`describePermissionMatrix` with the session mock), beside the feature definition's own matrix test: a slip such as `remove = serverAction(updateDraft)` passes every feature test. (Permission review of 2.5b.)
- A query that reads orders by id puts the draft wall inside the SQL (a DRAFT: its owner and the Head only), even when it reads only numbered orders: a taken-back DRAFT keeps its number (06 Allowed moves, Take back). (Permission review of 2.7.)
- A query that reads in more than one statement and shows numbers made from them together (a group row's sums, a count beside the rows it counts) reads in one snapshot: `readSnapshot()` of `src/server/read-snapshot.ts` (read only, repeatable read). Separate autocommit reads can show a sum of orders a move changed in between. (Spec review of 2.8.)
- A shortcut a fact grants on the first pass of a move (the Head step skipped at the first Submit of a Head-created order) holds for that first pass only: a task that opens a way back to the same status (Take back to Draft) checks that the shortcut cannot be taken a second time, with a test that walks the way back. (Permission review of 2.11.)
- A repeat that answers from stored first results also puts the ids the browser sent through the branch wall and the draft wall: a known key sent with another branch's order id is "Not found", never the first answer under that id. (Permission review of 2.13.)
- One lock order across actions: a product before its subtypes, each set in the order of its ids. The catalog writes (`addSubtype()` locks the product, then its default subtype) and `postMovement()` (the product FOR SHARE) take it so; an action that locks a subtype row and later reaches either locks the products first, or two users at the same moment deadlock (40P01). (Review of 3.6, finding 1.)
