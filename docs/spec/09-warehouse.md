# Warehouse

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Each branch has one warehouse, and its stock is the sum of every movement ever recorded for that branch. Stock can never go below zero. Services are not stocked.

## Movement types

| Movement | Stock | Created by | Needs approval |
| --- | --- | --- | --- |
| Receipt | Up | Automatic, from a purchase record | No |
| Issue to a department | Down | Manager or Head | No |
| Return from a department | Up | Manager or Head | No |
| Transfer to another branch | Down at the sender, up at the receiver | Sending Manager; the receiving Manager confirms | No |
| Write-off (damaged, expired, lost, returned to supplier) | Down | Manager asks | Head |
| Correction after a stock count | Up or down | Manager asks | Head |
| Direct entry by the Head | Up | Head only, by form or Excel import | No |

Movements are never edited or deleted. A wrong document is fixed with "Reverse", which writes the opposite movement and needs a reason.

## Direct entry by the Head

The Head can put items into any branch's stock without an order. This is how everything the school already owns enters the system at the start. After that, stock normally comes in only through orders, and direct entry is kept for exceptions such as gifts.

| Field | Rule |
| --- | --- |
| Branch | Any branch. |
| Date | Default today, not in the future. |
| Reason | One of: stock we already had, gift or donation, other. "Other" needs a comment. |
| Lines | Product, subtype, quantity, and cost per unit. Cost is prefilled with the reference price and can be left as it is. |
| Comment | Optional, except for "Other". |

1. A few items are typed in a form. Many items are imported from an Excel template, with the same preview and error check as catalog imports.
2. Each entry gets a number like `ENT-CHL-26-0004`, appears in the item card marked "Direct entry", and is written to the audit log.
3. A wrong entry is fixed with "Reverse", like any other document.
4. Only the Head can do this. For Managers, stock comes in through a purchase record, a return or a transfer.
5. The stock value report shows direct entries as their own line, so they are easy to tell from purchases.

## Issue to a department

This is the function you described, extended so one document can hold several items.

| Field | Rule |
| --- | --- |
| Branch | Prefilled when the Manager has one branch. |
| Date | Default today, not in the future. |
| Department | Required, from this branch. |
| Received by | Text, prefilled with the department's responsible person. |
| Lines | Product, subtype, quantity. Current stock is shown beside each line. |
| Comment | Optional. |

1. Quantity cannot be more than the stock. The server checks again under a lock at the moment of saving and names the item and the available amount if it fails.
2. Each issue gets a number like `ISS-CHL-26-0031` and a PDF issue note naming who gave the items and who received them, as typed. There are no signature lines (owner's decision of 15 October 2026).
3. A posted issue can be reversed by its creator or the Head. The original is then marked "Reversed".

## Other documents

- **Return from a department.** Pick the department, items and quantities; stock goes up. Returning more than that department ever received shows a warning and needs a comment.
- **Transfer.** The sender picks the other branch and the items; stock leaves the sender at once and the transfer shows "In transit". The transfer gets a number like `TRF-CHL-26-0007` and a PDF transfer note naming who sent the items and who received them, as typed, with no signature lines. The receiving Manager enters what really arrived. Until then the sender or the Head can cancel the transfer with a reason, and the stock goes back to the sender at the cost it left with. Any shortage becomes a write-off request "Lost in transfer" on the sending branch for the Head to decide.
- **Write-off.** The Manager picks items, quantities and a reason from a fixed list plus a comment. Stock changes only after the Head approves. A refusal carries a reason, as a rejected order does, and the Manager sees it.
- **Stock count.** The Manager starts a count for a branch or a category and types the counted quantities. The system shows the differences, and the Head approves them as corrections. If an item moved between the start of the count and the approval, the system asks the Manager to count that item again.

## Stock screens

- **Stock on hand.** Product, subtype, photo, quantity, measure, minimum, value. Search, category filter, "Low stock only" switch.
- **Item card.** Every movement of one subtype in one branch, newest first, with the running balance and a link to the source document or order.
- **Documents.** All issues, returns, transfers, write-offs and counts, with filters by type, date and department.

## Low stock

When a quantity falls to its minimum or below, the item gets a "Low" label and appears in the Manager's home list. One button adds it as a draft order for that branch (or raises the Manager's existing draft for it, section 5). The minimum is not a general setting: it is typed per subtype per branch, on the item card or in the Stock on hand list. An item with no minimum never shows as low.

## Stock value

Value is shown in reports only and never affects settlement. Each branch keeps a moving average cost per subtype:

- On a receipt: new average = (old quantity × old average + received quantity × purchase price) ÷ (old quantity + received quantity). Extra costs are not included.
- A count correction that adds stock to a quantity of 0 comes in at the subtype's last cost in that branch, the average it had before its stock last reached 0; at 0 only when it never had a cost.
- Issues, write-offs and transfers out use the average at that moment. A transfer arrives at the receiver with the sender's average.
- A cancelled purchase record removes its quantity at its own price and the average is recalculated. If stock reaches 0, the average resets to 0.
