# Spec index

> School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> This folder is the source of truth and is read-only. It changes only through `/spec-change`.

The spec text says "section 8" or "section 13". That number is the file number below. Section 12 is the `edge-cases/` folder. The fifteen architecture rules of section 13 are in `edge-cases/developer-rules.md`.

Where an edge-case file is more specific than a chapter file, the edge-case file applies.

## Chapters

| File | What it holds |
| --- | --- |
| `01-summary.md` | What the app does, the quality bar, the basic words. |
| `02-assumptions.md` | A1 to A14: currency, languages, roles, login, numbering, overspend, card, hosting, rights, prices. All confirmed. |
| `03-roles-and-permissions.md` | Four roles, eight rules, ten Manager rights, the permission matrix. |
| `04-catalogs.md` | Nine catalogs and their nine rules: subtypes, prices, photos, Excel import, products and subtypes added by Managers. |
| `05-order-request-form.md` | The order list (the file keeps its old name): the order's fields, drafts, order number, checks at submit, group rows, ticking and filters, the Excel and PDF download. |
| `06-approval-workflow.md` | Flow diagram, ten statuses per order, allowed moves, eleven rules (rule 8: many orders, one action), the Finance step switched off. |
| `07-purchasing.md` | Purchase record, one trip for many orders, what saving does, order progress, substitution, fixing a mistake, finishing. |
| `08-money-and-settlement.md` | Formulas, three colours, exact match, money actions with rows per order, cash count, closing, overspend guard, worked examples. |
| `09-warehouse.md` | Movement types, direct entry, issue, return, transfer, write-off, count, low stock, stock value. |
| `10-notifications-analytics-reports.md` | Who is told what, home page per role, analytics per role, ten reports. |
| `11-screens-and-ux.md` | Sixteen screens, menu per role, order list and order page layout, fifteen UX rules. |
| `13-technology.md` | The stack, layer by layer. |
| `14-data-model.md` | 35 tables in five groups, settings keys, notes for the build. |
| `15-quality-and-acceptance.md` | Three test layers, 22 acceptance scenarios S1 to S22, the done-check. |
| `16-build-order.md` | The nine product phases and what can be tried after each. |
| `17-later-ideas.md` | Eleven features left out of version 1 on purpose. Do not build them. |
| `18-hosting-and-costs.md` | Hosting, addresses, monthly cost, what was considered and set aside. |

## Edge cases and rules

| File | What it holds |
| --- | --- |
| `edge-cases/00-definitions.md` | Every term the spec defines, with the file that defines it. Read for every task. |
| `edge-cases/developer-rules.md` | The fifteen architecture rules and where each is enforced. Read for every task with a migration. |
| `edge-cases/requests-and-approval.md` | 18 situations around drafts, submit, approval, users and branches. |
| `edge-cases/purchasing-and-money.md` | 20 situations around buying, cancelling, cash and settlement. |
| `edge-cases/warehouse.md` | 7 situations around stock, issues, transfers and direct entry. |
| `edge-cases/system.md` | 2 situations: session end, large photos. |

## Other

| File | What it holds |
| --- | --- |
| `open-questions.md` | What the spec leaves open or says two ways. Numbered. Never decide one alone. |
| `sources.md` | The pages the spec cites, with the dates they were checked. |
