# Definitions

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Every term the spec defines, in the spec's own words, with the file that defines it. If this file and a chapter disagree, stop and report it; do not pick one.

## People and places

| Term | Meaning | Defined in |
| --- | --- | --- |
| Head | Procurement Head, the super admin. Sees all branches. | `01-summary.md`, `03-roles-and-permissions.md` |
| Manager | Procurement Manager. Has one or more branches, assigned by the Head. | same |
| Principal | School Principal (director) of one branch. One branch per Principal, and exactly one Principal per branch. | same |
| Finance | Finance specialist. Has one or more branches, assigned by the Head. | same |
| Acting Principal | The user the Head hands a branch to while its Principal is away. Waiting orders pass to the new Principal; past approvals keep the old name. | `03-roles-and-permissions.md` rule 3 |
| Branch | One school site. Has a short code of 2 to 4 Latin capital letters and one warehouse. | `04-catalogs.md`, `09-warehouse.md` |
| Department | A unit of one branch with a responsible person (plain text, not an app user). | `04-catalogs.md` |
| Owner | The Manager who created an order. An order has one owner. | `03-roles-and-permissions.md` rule 7 |
| Branch wall | Every read and write checks role and branch on the server. Another branch's address shows "Not found". | `03-roles-and-permissions.md` rule 1 |
| Manager right | One of nine switches the Head can turn off for a Manager: `CREATE_REQUESTS`, `RECORD_PURCHASES`, `CANCEL_PURCHASES`, `CLOSE_ALONE`, `ISSUE_STOCK`, `RETURN_REVERSE`, `TRANSFER_STOCK`, `WRITE_OFF_COUNT`, `SET_MINIMUMS`. All on by default. | `03-roles-and-permissions.md` |

## Catalog

| Term | Meaning | Defined in |
| --- | --- | --- |
| Product or service | A catalog item. Its type is product (the default) or service. Type and measure lock after first use. | `04-catalogs.md`, `02-assumptions.md` A7 |
| Service | A catalog item that never enters the warehouse. When the Manager records the actual price and number, it counts as used. | `02-assumptions.md` A7, `07-purchasing.md` |
| Subtype | A variant of a product, for example "A4, 80 g" for paper. In the database every product has at least one; a product without subtypes gets one hidden subtype called "default". | `01-summary.md`, `04-catalogs.md` rule 1 |
| Measure | The unit of a product. It says whether decimals are allowed. | `04-catalogs.md` |
| Company or brand | One list that serves both the "brand" on an order and the "supplier" on a purchase. | `04-catalogs.md` |
| Extra cost type | A named extra cost: delivery, loading, installation and so on. | `04-catalogs.md` |
| Reference price | The one price per subtype for the whole school, set by the Head. Older prices stay in the price history. | `04-catalogs.md` rule 4, `02-assumptions.md` A14 |
| Last purchase price | The price of the newest real purchase of a subtype. Suggested on an order when there is no reference price. | `05-order-request-form.md` (Order, field 11), `07-purchasing.md` (What saving a record does) |
| Price hint | The label shown when a typed price differs from the reference price by more than 20% (a setting), for example "+35% vs catalog price". | `05-order-request-form.md` |
| Product suggestion | A Manager's ask to add a missing item to the catalog. The Head adds it or declines with a reason. | `04-catalogs.md` rule 8 |
| Minimum stock | A level per subtype per branch. At or below it the item is "Low". No minimum means never low. | `04-catalogs.md` rule 5, `09-warehouse.md` |

## Orders

| Term | Meaning | Defined in |
| --- | --- | --- |
| Order | One item on a branch's order list: one product or service for one department, with its quantity, price, extra costs and payment type. It is approved, bought, settled and closed on its own. | `01-summary.md`, `05-order-request-form.md` |
| Order list | All orders of one branch. | `05-order-request-form.md` |
| Group row | One row of a list showing every order of one product subtype and one status in a branch, for example "Tata pens, 30". Acting on it acts on every order in it; each order keeps its own number, approvals, history and money. | `05-order-request-form.md` (Group rows) |
| Ticking | Choosing several orders or group rows to act on them in one action. | `05-order-request-form.md` |
| Action | One user action on one or more ticked orders: all or nothing, at most 200 orders. | `06-approval-workflow.md` rule 8 |
| Order number | Branch code, two-digit year, four-digit counter: `CHL-26-0142`. Each order has its own; given at the first submit; never changes, never reused. | `05-order-request-form.md` |
| Revision | "rev 2", "rev 3": goes up by 1 each time a sent-back order is submitted again. | `05-order-request-form.md`, `06-approval-workflow.md` |
| Status | One of ten: `DRAFT` Draft, `PENDING_HEAD` Waiting for Head, `PENDING_PRINCIPAL` Waiting for Principal, `PENDING_FINANCE` Waiting for Finance, `RETURNED` Sent back for editing, `PURCHASING` Open, `SETTLEMENT` Waiting for settlement, `CLOSED` Closed, `REJECTED` Rejected, `CANCELLED` Cancelled. | `06-approval-workflow.md` |
| Open | The status `PURCHASING`: fully approved, the Manager buys and records purchases. | `06-approval-workflow.md` |
| Send back | An approver makes the order editable again for the owner. Approval then starts again from the Head. | `06-approval-workflow.md` rules 2 and 4 |
| Reject | Final refusal. The owner can still use "Copy as new". | `06-approval-workflow.md` rule 2 |
| Take back | The owner pulls an order back to Draft before the Head decides. The number is kept. | `06-approval-workflow.md` |
| Frozen plan | Once an order is Open, its plan can never be edited. | `06-approval-workflow.md` rule 6 |
| Priority | Normal or Urgent. Urgent needs a short reason and is pinned on top for approvers. | `05-order-request-form.md` |
| Payment type | Cash, Bank transfer or Corporate card (`CASH`, `TRANSFER`, `CARD`). Chosen per order; Finance can change it at approval. | `05-order-request-form.md` |
| Download | The filtered order list as Excel or as a plain PDF, without signature lines. | `05-order-request-form.md` |

## Purchasing and money

| Term | Meaning | Defined in |
| --- | --- | --- |
| Purchase record | What the Manager enters after really buying something: actual number, actual price, extra costs. One record belongs to one order; an order can have many. | `01-summary.md`, `07-purchasing.md` |
| Trip | One shop visit recorded once for one or more orders of one owner in one branch: shared date, supplier, payment type and receipt; one purchase record per order. Delivery for the whole visit is its own service order. | `07-purchasing.md` |
| Order progress | `OPEN` Open, `DONE` Done, `DONE_SHORT` Done short, `NOT_BOUGHT` Not bought. | `07-purchasing.md` |
| Substitution | Buying another subtype of the same product. The order shows "Substituted" and the Manager cannot close alone. | `07-purchasing.md` |
| Used | What a service order shows once its purchase record is saved, where a product order shows Received. | `07-purchasing.md` |
| Planned total | round(planned quantity × planned price) + planned extra costs. | `08-money-and-settlement.md` |
| Actual total | Actual goods + actual extra, over purchase records that are not cancelled. | `08-money-and-settlement.md` |
| Difference | Planned total − actual total. Positive: money is left. Negative: more was spent. | `08-money-and-settlement.md` |
| The three colours | Three labels per order and per group row: Number, Price, Total. Green, orange or red. While an order's buying is Open, Number and Total show grey "In progress"; Price is grey until something is bought. | `08-money-and-settlement.md` |
| Exact match | For one order: Number and Price green, actual extra costs equal planned, no substitution, planned payment type, and its cash count 0. | `08-money-and-settlement.md` |
| Money action | One Finance action: one date, document number, file and comment, split into rows, one per order, for one Manager. | `08-money-and-settlement.md` |
| Money row | One order's part of a money action, of one kind: Cash given, Cash returned, Paid back, Bank transfer, Card top-up, Card money returned. | `08-money-and-settlement.md` |
| Cash count | Per order: cash given + paid back − cash returned − cash spent. Must be 0 before the order can close. | `08-money-and-settlement.md` |
| Manager's cash balance | What a Manager holds (the sum of the positive cash counts of his orders that are not Closed) and what he is owed (the sum of the negative ones), shown apart, never netted. | `08-money-and-settlement.md` |
| Cash spent | Every purchase and extra cost with payment type Cash that is not cancelled. | `08-money-and-settlement.md` |
| Settlement | The step where Finance and the Manager even out the money difference. | `01-summary.md`, `08-money-and-settlement.md` |
| Skipped Finance | An order the Principal approved while the Head had switched the Finance step off (setting `finance_step`): it goes straight to Open, has no cash count, and the owner or the Head closes it when its buying is finished, whatever the difference. | `06-approval-workflow.md` |
| Overspend guard | An order more than 10% and more than 100 000 so'm (two settings) over its planned total: the Head must acknowledge before Finance can close. | `08-money-and-settlement.md`, `02-assumptions.md` A10 |
| Rounding | Always half up, to whole so'm. | `08-money-and-settlement.md` |

## Warehouse

| Term | Meaning | Defined in |
| --- | --- | --- |
| Stock | The sum of every movement ever recorded for a branch. Never below zero. Services are not stocked. | `09-warehouse.md` |
| Movement | One append-only row: Receipt, Issue, Return, Transfer out, Transfer in, Write-off, Correction, Direct entry, Reversal. | `09-warehouse.md`, `14-data-model.md` |
| Issue | Giving items to a department. Numbered like `ISS-CHL-26-0031`. | `09-warehouse.md` |
| Direct entry | Stock the Head puts in without an order. Numbered like `ENT-CHL-26-0004`. | `09-warehouse.md` |
| Reverse | Fixing a wrong document by writing the opposite movement, with a reason. | `09-warehouse.md` |
| Transfer | Moving stock to another branch. "In transit" until the receiving Manager enters what arrived, or the sender or the Head cancels it. | `09-warehouse.md` |
| Write-off | Removing stock (damaged, expired, lost, returned to supplier). The Manager asks; the Head approves. | `09-warehouse.md` |
| Stock count | Typing counted quantities for a branch or a category; the Head approves the differences as corrections. | `09-warehouse.md` |
| Give straight to requester | A tick on a purchase record that also creates an issue to the order's department. | `07-purchasing.md` |
| Low | The label of an item at or below its minimum. | `09-warehouse.md` |
| Moving average cost | The per-branch cost per subtype used for stock value. Shown in reports only; never affects settlement. | `09-warehouse.md` |
| Runs out in | Current stock divided by the average daily issues of the last 90 days. | `10-notifications-analytics-reports.md` |

## System

| Term | Meaning | Defined in |
| --- | --- | --- |
| `client_key` | The browser-made id that makes repeated saves safe. | `14-data-model.md`, `developer-rules.md` rule 8 |
| Version | A number on an order that rises on every change. A write with an old version is refused. | `developer-rules.md` rule 9 |
| Business date | A date in the `Asia/Tashkent` time zone. Timestamps are stored in UTC. | `developer-rules.md` rule 10 |
| Password | Created by the Head, typed or generated, and renewed by the Head at any time; a renewal signs that user out on every device at once. Users cannot change their own. A Head's password can also be renewed from a command in the hosting console (03 rule 4). There are no password rules. | `02-assumptions.md` A8, `13-technology.md` |
| Session | Ends 24 hours after sign-in. Several devices can be signed in at once. | `02-assumptions.md` A8, `13-technology.md` |
| Bell | The in-app notification list with an unread count. No messenger, email or SMS is used. | `10-notifications-analytics-reports.md` |
| School year | A period choice in Analytics. Its first day is set in Settings; hidden until set. | `10-notifications-analytics-reports.md` |
| Trial | The time between setting up the live app (task 9.4) and loading the school's real data: the app holds only invented data and the demo users, and is emptied at its end. | `18-hosting-and-costs.md` |
