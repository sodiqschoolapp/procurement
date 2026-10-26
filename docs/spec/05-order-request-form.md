# Order list

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Each branch keeps one order list. An order is one product or service for one department: the Manager adds orders on any day in the order sheet and submits every ready one with one click, and every order is then approved, bought, settled and closed on its own. Every role works on many ticked orders at once. (Owner's decision of 14 and 15 October 2026; this chapter replaced the order request form.)

## Order

| # | Field | How it is filled | Rule |
| --- | --- | --- | --- |
| 1 | Branch | Picked; prefilled when the Manager has one branch | Required. Locked once the order is submitted. |
| 2 | Product or service | Picked from the catalog; search by name, shows photo, category and stock. When nothing matches, the Manager adds the product or subtype there (`04-catalogs.md` rule 8). Product or Service is shown with it, filled from the catalog | Required. |
| 3 | Subtype | Picked from the product's subtypes | Required when the product has subtypes. |
| 4 | In stock ("how many left") | Automatic: current stock of this branch | Read-only. A copy is saved at submit. Services show a dash. |
| 5 | Photo | Automatic from the catalog: subtype photo, else product photo | The Manager may attach one extra reference photo. |
| 6 | Brand or company | Picked; prefilled from the product | Optional. |
| 7 | Requested by | Department picked from this branch; shows its responsible person | Required. An optional text field names a specific person. |
| 8 | Needed by | Date | Required. Not in the past at submit. One click applies a date to all ticked drafts. |
| 9 | Measure | Automatic from the product | Read-only. |
| 10 | Quantity | Typed | More than 0. Up to 3 decimals, only when the measure allows decimals. |
| 11 | Price per unit | Suggested: the reference price set by the Head, else the last purchase price, else empty | Editable. Whole so'm, more than 0. |
| 12 | Extra costs | Zero or more rows: type from the catalog plus amount | Each amount more than 0. The cell shows the sum. |
| 13 | Payment type | Cash, Bank transfer or Corporate card | Required. Default is Cash (a setting). Finance can change it at approval. |
| 14 | Priority | Normal or Urgent | Urgent needs a short reason and is pinned on top for approvers. |
| 15 | Comment | Free text | Optional, up to 1000 characters. |
| 16 | Order total | Automatic | Quantity × price, rounded to whole so'm, plus extra costs. |
| 17 | Order number | Automatic at first submit | See "Order number" below. |
| 18 | Created by, date | Automatic: the logged-in user and the day the order was created | This user is the owner. The submit date and time are saved separately. |

Under the list, the totals of the ticked orders: goods, extra costs, grand total, and the grand total split by payment type.

## Fields the Head sets

The Head sets, for the whole school, how each field below is asked and where it stands in the order sheet (owner's decision of 26 October 2026). Where it differs from the Rule column of the table above, this setting applies. Branch, product, subtype and quantity are always asked and always in the row.

| Field | Can be | Default |
| --- | --- | --- |
| Requested by (department) | Required, optional or hidden | Required, in the row |
| Needed by | Required, optional or hidden | Required, in the row |
| Price per unit | Required, optional or hidden; optional or hidden only while the Finance step is off (`06-approval-workflow.md`) | Required, in the row |
| Payment type | Shown or hidden | Shown, under "More" |
| Priority | Shown or hidden | Shown, under "More" |
| Brand or company, requester name, comment, reference photo | Required, optional or hidden | Optional, under "More" |
| Extra costs | Optional or hidden | Optional, under "More" |

1. **Where.** Each field that is not hidden stands in the row or under "More"; the Head chooses.
2. **Hidden** fields are not shown in the sheet or on new orders. A hidden payment type is the default payment type (a setting), a hidden priority is Normal, and a hidden price is the suggested price of field 11 when there is one, else none.
3. **Left empty.** An order without a department is for no department: "Give straight to requester" cannot be used on it, and analytics and reports by department show it under "No department", so their totals still add up. An order without a needed-by date gets no "due soon" reminder and is not on "orders due soon". An order without a price has no planned total (`08-money-and-settlement.md`). Two drafts without a department count as the same department for the merge of Drafts 2.
4. **A change** applies from the next submit: drafts are checked against the setting as it is then, and orders already submitted keep what they hold. A change writes an audit row.

## Drafts

1. The Manager adds draft orders to the branch's list at any time. A draft is visible to its owner and the Head only.
2. **Same thing twice in drafts.** When the Manager adds a draft whose branch, subtype and department equal one of the Manager's own drafts that was never submitted (it has no number), no second draft is made: the existing draft's quantity rises by the new quantity, and its other fields stay. The Manager sees "Added to your draft: now 20".
3. **Autosave.** A draft saves itself after each change and shows "Saved". The owner can delete a draft that was never submitted.
4. **Submit.** One "Submit" with nothing ticked sends every ready draft of the user's own that has no number; when some rows are ticked, only those are sent. A sent-back or taken-back order, and another owner's draft in the Head's view, are sent only when ticked. Each goes to the Head (to the Principal when the Head is the creator) with its own number. A draft that is not ready (see "Checks at submit") stays in the sheet, marked on its cell. (Owner's decision of 25 October 2026.)
5. **Sent back and taken back orders** stand in the order sheet with their number and the label "Sent back" or "Taken back", and are edited and submitted again there. They never merge with a draft (point 2).
6. **Fewer repeats.** A new draft takes the branch, department and needed-by date of the draft above it; each can be changed.

## Order number

The format is branch code, two-digit year, four-digit counter: `CHL-26-0142`. Each order has its own number.

1. The number is given at the first submit. A draft shows no number, so deleted drafts leave no gaps.
2. The counter runs per branch per calendar year in Tashkent time and starts at 0001. After 9999 it simply grows to five digits.
3. A number never changes and is never reused. Rejected and cancelled orders keep theirs.
4. An order sent back and submitted again keeps its number and shows "rev 2", "rev 3" beside it.
5. The numbers are created inside the submit transaction with a lock on the counter row, in the order the drafts were created. Two people submitting at the same instant cannot get the same number.

## Checks at submit

- At most 200 orders in one submit. With more ready drafts, the first 200 in the order they were added are sent, and Submit again sends the rest.
- Every field the Head's field settings require is filled on every order being sent, and no order uses a deactivated catalog entry.
- No needed-by date that is given is in the past.
- A draft that fails a check is not sent and stays in the sheet; the ready ones are sent. A draft that changed since the screen showed it refuses the whole submit, and the screen refreshes. When drafts are ticked, one failing draft stops the whole submit: nothing is submitted (06 rule 8). Either way, errors appear on the exact cell of the exact order and in a short list on top; the screen scrolls to the first one.

## Group rows

Every list shows one row per product subtype and status in a branch, for example "Tata pens, 30". This is the owner's decision of 15 October 2026: in any stage, one row for one item.

1. **What a group row shows:** product and subtype, the total quantity, the total planned amount, how many orders it holds, the earliest needed-by date, "Urgent" when any of its orders is urgent, and the price hint when any of them has one.
2. **Opening a group row** shows its orders: number, department, quantity, price, payment type, needed-by date, owner, date submitted.
3. **Acting on a group row acts on every order in it,** all or nothing (`06-approval-workflow.md`, rule 8), except a trip, which takes only the orders of one owner (`07-purchasing.md`). Any single order can still be ticked and acted on alone.
4. **Each order keeps its own** number, approvals, history, purchases and money. A group row is a way of showing and ticking orders, not a record of its own. Example: 20 Tata pens wait for the Principal; 10 more are submitted and wait for the Head; once the Head approves them, the Principal sees one row "Tata pens, 30" holding both orders.
5. The Manager's own view counts every stage: "Tata pens: 30 requested".
6. Wherever orders are taken "oldest first", two orders submitted at the same moment are taken by the lower order number first.

## Ticking and filters

- **Ticking.** Every role ticks orders or group rows and sees only the actions it can take on all ticked orders now. "Select all on this filter" ticks every matching order, up to 200.
- **Filters.** Date range (created, submitted, approved, closed), branch, status, owner, department, category, payment type, Urgent, and a range of order numbers. Filters and sorting stay in the address, so a link reopens the same view.
- **Price hint.** When the typed price differs from the reference price by more than 20% (a setting), a label such as "+35% vs catalog price" is shown to the Manager and to every approver.
- **Copy as new.** Any order, including a rejected one, can be copied into a new draft; several ticked orders can be copied at once.

## Download

There is no formal form PDF and there are no signature lines anywhere. The approvals in each person's account are the record.

1. The filtered list downloads as **Excel**: one row per order with its number, status, branch, owner, department, product, subtype, quantity, price, extra costs, payment type, planned total, and from Open onward actual quantity, actual price, actual extra costs, actual total and difference; then who approved each step and when.
2. The same table downloads as a **plain PDF** for showing on screen or printing: A4 landscape, fonts for Uzbek and Russian built in, the filters used and who downloaded it and when on every page, no signature lines.
3. Both are made on the server from the same data and the same calculation functions as the screen, so file and screen can never disagree, and both use the language of the user who downloads them.
4. Product photos are left out.
