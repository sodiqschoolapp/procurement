# Build order

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The task-level plan is `docs/build-plan.md`. It follows the product order below, moves the audit log and the notification bell into its phase 0 (standing decision), and adds a last phase "before go-live".

Build in nine phases, one at a time, and do not start a phase until the done-check of the one before passes. The first five phases give a working order flow from draft to closed.

| Phase | What is built | You can try |
| --- | --- | --- |
| 0. Foundation | Project, Docker, first deployment to DigitalOcean, database, login, roles, branch wall, page layout, three languages, seed data, automatic tests on commit | Log in as each of the four seed users and see a different empty home page |
| 1. Catalogs | All catalogs from section 4, photos, Excel import, price history, product suggestions, users and branches screens, Manager rights, audit log | Add a product with subtypes and a photo; import 30 products from Excel |
| 2. Orders to approval | Order list with drafts, group rows and ticking, order numbers, state machine, three approvals on ticked orders, send back with "what changed", reject, cancel, history, grouped bell notifications, the Excel and PDF download | Scenarios S5, S6, S7, S14, S17, S18, S19 |
| 3. Purchasing | Purchase records and trips, order progress, substitution, stock receipt, the three colour labels | Scenarios S4 (without the issue) and S10 |
| 4. Money and settlement | Money actions with rows per order, cash count, cash rows prefilled per order, settlement screen with the net, overspend guard, close, reopen, Money with managers | Scenarios S1, S2, S3, S9, S12, S13, S16, S20, S21 |
| 5. Warehouse | Stock on hand, item card, issue, return, reverse, direct stock entry by the Head, minimums and low stock, write-off with Head approval | Scenarios S8, S11 and S15; download an issue note as PDF |
| 6. Home, reports, search | Home page and Analytics page per role, the ten reports, Excel export, Ctrl+K search | Each role's home shows the right tasks; click a bar on the Head's Analytics page and see the orders behind it |
| 7. Transfers and counts | Transfers between branches, stock counts with corrections | Send 10 items to another branch, receive 8, see the write-off request |
| 8. Jobs and polish | Reminder and escalation jobs, nightly balance check, weekly database copy to R2, speed and accessibility review | An order left waiting 24 hours produces a reminder in the bell; restore yesterday's copy of the database into a new, empty database |

## How to run this with Claude Code

The project is built with the Claude Code starter pack kept in the repository. Work goes one task per session from `docs/build-plan.md`, and each task is planned, reviewed and merged on its own pull request. `docs/START-HERE.md` explains the loop.
