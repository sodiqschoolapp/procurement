# Purchasing

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Once Finance approves, an order is Open and the Manager adds a purchase record each time something is bought or delivered. Items enter the warehouse at once, and the order stays Open until its buying is finished. One shop visit can be recorded once for many orders.

## Purchase record

One record belongs to one order. An order can have many records, for example 60 notebooks on Monday and 40 on Friday.

| Field | Rule |
| --- | --- |
| Date bought | Default today. Not in the future, not before the Finance approval of the order (the Principal's, for an order that skipped Finance, section 6). |
| Actual quantity | More than 0. Decimals only when the measure allows. |
| Actual price per unit | 0 or more, whole so'm. A price of 0 (a gift) needs a comment. |
| Extra costs | Zero or more rows: type, amount, payment type. Covers delivery the Manager paid from his own pocket. |
| Payment type used | Default from the order. Can differ, for example planned by card but paid in cash. |
| Supplier | Optional, from the companies catalog. Default is the order's brand or company. |
| Subtype bought | Default is the ordered subtype. See "Substitution" below. |
| Receipt | 0 to 5 photos or PDF files. On a phone the camera opens directly. A receipt photo is kept at up to 2 500 px on its longest side, so its small print stays readable. |
| Give straight to requester | Optional tick. Also creates an issue to the order's department (section 9). Not offered for an order without a department (section 5, "Fields the Head sets"). |
| Comment | Required when price or quantity differs from the plan, on a substitution, on price 0, or when the payment type changed. |
| Actual total | Automatic: quantity × price, rounded, plus extra costs. |

A "Same as planned" button fills quantity, price and extra costs from the order in one tap.

## One trip, many orders

The Manager ticks Open orders, or a group row, and records the visit once. A trip covers orders of one branch and one owner, because the cash it spends counts on the owner's orders; on a group row that holds orders of several owners, the trip takes the recording Manager's own orders of the row (the Head picks one owner).

1. **Shared:** date bought, supplier, payment type used and the receipt files. **Per order:** quantity, price, subtype bought, extra costs, "Give straight to requester" and comment. Saving makes one purchase record per order; all of them point to the same trip and the same receipt files.
2. **On a group row** the Manager types one quantity and one price. The quantity is split across the group's orders, oldest submit first (at the same moment, the lower order number first), each up to what it still lacks (planned quantity − received quantity); anything above the group's total goes to the newest order. The Manager can change the split before saving.
3. **Delivery for a whole visit is its own order:** a service such as "Delivery" from the catalog, planned and approved like any other order and recorded in the trip like the others. A fee that turns up only at the shop is an extra cost on one order of the trip, which then shows over its plan and goes to Finance. Nothing is split across orders automatically (owner's decision of 16 October 2026).
4. A trip is saved all or nothing (section 13, rule 3).

## What saving a record does

All of this happens in one database transaction, for every record of the trip, or none of it happens:

1. The record is saved.
2. For goods, the branch stock goes up by the quantity, and a stock movement of type "Receipt" is written.
3. The subtype's last purchase price is updated.
4. The order's received quantity and progress are updated.
5. If "Give straight to requester" is ticked, an issue document is created and stock goes down again.
6. The event is added to the order's history.

Services follow the same steps without any stock change. Once its purchase record is saved, a service order shows Used where a product order shows Received.

## Order progress

| State | When |
| --- | --- |
| Open | Received less than planned, and not finished by hand. |
| Done | Received the planned quantity or more. Automatic. |
| Done, short | The Manager clicks "Finish order" with less than planned and gives a reason. |
| Not bought | The Manager clicks "Not bought" with nothing received and gives a reason. |

While the order is Open, the Manager can reopen a finished order's buying when more items arrive. Buying more than planned is allowed, needs a comment, and shows red. "Finish order" and "Not bought" work on ticked orders at once, with one reason.

## Substitution

When the shop has black pens instead of the ordered blue ones, the Manager picks the subtype really bought. It must belong to the same product. Stock rises for the subtype bought, the order shows a "Substituted" label, and the order cannot be closed by the Manager alone; Finance reviews it. An order that skipped Finance is closed as section 6 says. For a different product, mark the order "Not bought" and add a new order.

## Fixing a mistake

- While the order is Open, the Manager can cancel a purchase record with a reason. Stock goes down by the same quantity. "Cancel trip" cancels every record of one trip in one action, all or nothing.
- Cancelling is blocked when it would push stock below zero, which happens when the items were already issued. The message says to take the items back from the department first, or to use a write-off.
- Editing means cancel and enter again. Cancelled records stay visible, crossed out. Every cancel sends a notification to the Head, and the order shows how many of its records were cancelled.
- After the order is Closed, only a reopen by the Head allows corrections.

## Finishing

An order's buying is finished when its progress is Done, Done short or Not bought. The Manager then ticks finished orders and sees a summary of their differences, and the closing rules in section 8 follow, order by order.
