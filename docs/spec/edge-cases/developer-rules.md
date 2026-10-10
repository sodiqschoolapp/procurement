# Developer rules

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec section 13, "Architecture rules". The numbered list is the spec text, unchanged. The two tables after it only say where each rule is enforced; they add no rule.

## The fifteen rules

Claude Code must follow these fifteen rules in every phase. They are what keeps the app free of bugs.

1. **One place for business rules.** Totals, colours, cash balance, average cost and allowed moves are pure TypeScript functions in `src/domain/`. Screens and server code import them. No formula is written twice.
2. **One state machine.** A single file lists every status move and who may make it, exactly as in section 6. The screen asks it which buttons to show; the server asks it again before acting.
3. **One transaction per action.** Every write runs as: check permission, lock the rows, check status and version, write, add the history event, add notifications. If any step fails, nothing is saved.
4. **One permission layer.** Every server action and query calls the same `authorize()` function. Lists filter by branch inside the SQL query.
5. **Database as last defence.** Stock quantity has a CHECK of 0 or more. Order numbers are unique. Statuses are enums. Amounts have CHECKs. Every relation has a foreign key.
6. **Exact numbers.** Money is whole so'm in `bigint`. Quantities are `numeric(14,3)`. JavaScript floating-point numbers never touch money.
7. **History is append-only.** Stock movements, money entries and events are never updated or deleted. A correction is a new row.
8. **Safe repeats.** Each create action carries an ID made in the browser. Sending the same ID twice returns the first result.
9. **Version check.** Requests carry a version number that rises on every change. A write with an old version is refused with a clear message.
10. **Time.** Timestamps are stored in UTC. Business dates use the `Asia/Tashkent` time zone.
11. **No hard deletes,** except drafts that were never submitted.
12. **Speed.** Every foreign key and filter column has an index. No query runs inside a loop. Lists use server paging. Images load as small versions first. Analytics read from summary tables refreshed every 5 minutes, never from raw rows on each click.
13. **Security.** Login allows 5 tries per 15 minutes. Cookies are httpOnly, secure and sameSite. Uploads are checked by content, not by file name. Every input is checked on the server with Zod. Changes to catalogs, users and settings go to an audit log.
14. **Demo data.** A seed script creates 2 branches, one user per role, 30 products and a few requests in different statuses, so every phase can be clicked through.
15. **Ask, do not guess.** When this spec does not cover a business rule, Claude Code stops and asks. Technical choices it makes on its own go into `docs/decisions.md`.

## Where each rule is enforced

| Rule | Enforced by | Proved by |
| --- | --- | --- |
| 1 One place for business rules | The `src/domain/` module. Nothing outside it calculates a total, a colour, a cash balance, an average cost or an allowed move. | Unit tests of every domain function. |
| 2 One state machine | One file in `src/domain/`. Screens and server actions both call it. | Unit tests of every allowed and every forbidden move. |
| 3 One transaction per action | The server-action wrapper. No action opens its own transaction. | Database tests: a failing step leaves nothing saved. |
| 4 One permission layer | `authorize()`, called by every server action and every query; branch filter inside the SQL. | The permission matrix test: action × role × own branch and other branch. |
| 5 Database as last defence | Constraints in SQL migrations. | Database tests that try the forbidden write directly. |
| 6 Exact numbers | Column types in migrations; decimal.js inside `src/domain/`. | Unit tests of rounding; the worked example in section 8. |
| 7 History is append-only | No update or delete path in the code for stock movements, money entries and events. | Database tests. See open question 3 about the cancel fields. |
| 8 Safe repeats | The server-action wrapper and the UNIQUE `client_key` columns. | Database tests: the same id twice returns the first result. |
| 9 Version check | The server-action wrapper and `orfs.version`. | Database tests: an old version is refused. |
| 10 Time | One clock provider, injected. Business dates use `Asia/Tashkent`. | Tests set the clock; a test crosses midnight and the year end. |
| 11 No hard deletes | No delete action exists except for drafts never submitted. | Database tests. |
| 12 Speed | Indexes in migrations; server paging; summary tables for analytics. | The speed task before go-live. |
| 13 Security | The login module, the upload route, Zod on every input, the audit log. | Tests of the login limit, the upload check and the audit rows. |
| 14 Demo data | The seed script. | CI runs the seed on an empty database. |
| 15 Ask, do not guess | The plan of every task lists its questions. | The reviewer answers them on the pull request. |

## Constraints the spec names

All are in `14-data-model.md` unless another file is shown.

| Constraint | Where |
| --- | --- |
| `branches.code` UNIQUE; 2 to 4 Latin capital letters | `04-catalogs.md` |
| `users.username` UNIQUE | |
| `user_branches`: no rows for HEAD, exactly one row for PRINCIPAL, at most one active PRINCIPAL per branch (partial unique index) | |
| `manager_rights` KEY (user_id, right); no row means enabled | |
| Catalog names unique inside their catalog, ignoring capital letters and extra spaces; subtype names inside a product; department names inside a branch | `04-catalogs.md` rule 3 |
| `number_counters` KEY (scope, branch_id, year) | |
| `orfs.number` UNIQUE, empty while Draft | |
| Statuses, payment types, progress, kinds and types are enums | |
| `purchases.client_key`, `money_entries.client_key`, `stock_documents.client_key` UNIQUE | |
| `money_entries.amount` CHECK (amount > 0) | |
| `stock_balances.qty` CHECK (qty >= 0); KEY (branch_id, variant_id) | |
| `stock_minimums` KEY (branch_id, variant_id) | |
| `stock_documents.number` UNIQUE | |
| `stock_movements` is append-only | |
| Money is `bigint` whole so'm; quantities are `numeric(14,3)` | rule 6 above |
| Every relation has a foreign key; every foreign key and filter column has an index | rules 5 and 12 above |
