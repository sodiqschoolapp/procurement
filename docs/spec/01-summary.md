# Summary

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

One web app replaces the paper order request form and the warehouse records for every branch of the school. It does two jobs:

1. **Orders.** Each branch keeps one order list. A manager adds orders for things to buy, one product or service each. Three people approve every order in a fixed order: Procurement Head, Principal, Finance, each ticking many orders at once. The manager buys, records the real prices and numbers, Finance settles any money difference, and each order closes on its own.
2. **Warehouse.** Every recorded purchase enters the branch stock automatically. Managers give items to departments, and the system always knows how many are left.

This spec is written for Claude Code. It decides the rules, screens, data and build order so nothing is left to guessing.

## Quality bar

| Goal | How it is measured |
| --- | --- |
| Fast | Any page opens in under 1 second on a normal office connection. Every click shows a reaction within 0.1 seconds. |
| No bugs | Every rule in this spec has an automated test. Money and stock change only inside one database transaction. |
| Good-looking | One consistent design system, checked at phone width (375 px) and desktop width (1440 px). |
| Easy to use | A new manager can add and submit orders without training. Each role opens the app on a "My tasks" list. |

## Words used in this spec

| Word | Meaning |
| --- | --- |
| Order | One item on a branch's order list: one product or service for one department, with its quantity, price and payment type. It is approved, bought, settled and closed on its own. |
| Order list | All orders of one branch. Lists show one group row per product subtype and status. |
| Head | Procurement Head, the super admin. |
| Manager | Procurement Manager. |
| Principal | School Principal (director) of one branch. |
| Finance | Finance specialist. |
| Purchase record | What the manager enters after really buying something: actual number, actual price, extra costs. |
| Settlement | The step where Finance and the manager even out the money difference. |
| Subtype | A variant of a product, for example "A4, 80 g" for paper. |
