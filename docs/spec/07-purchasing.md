# Purchasing

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Once Finance approves, the request is Open and the Manager adds a purchase record each time something is bought or delivered. Items enter the warehouse at once, and the request stays Open until every line is finished.

## Purchase record

One record belongs to one line. A line can have many records, for example 60 notebooks on Monday and 40 on Friday.

| Field | Rule |
| --- | --- |
| Date bought | Default today. Not in the future, not before the Finance approval. |
| Actual quantity | More than 0. Decimals only when the measure allows. |
| Actual price per unit | 0 or more, whole so'm. A price of 0 (a gift) needs a comment. |
| Extra costs | Zero or more rows: type, amount, payment type. Covers delivery the Manager paid from his own pocket. |
| Payment type used | Default from the line. Can differ, for example planned by card but paid in cash. |
| Supplier | Optional, from the companies catalog. Default is the line's brand or company. |
| Subtype bought | Default is the requested subtype. See "Substitution" below. |
| Receipt | 0 to 5 photos or PDF files. On a phone the camera opens directly. |
| Give straight to requester | Optional tick. Also creates an issue to the line's department (section 9). |
| Comment | Required when price or quantity differs from the plan, on a substitution, on price 0, or when the payment type changed. |
| Actual total | Automatic: quantity × price, rounded, plus extra costs. |

A "Same as planned" button fills quantity, price and extra costs from the line in one tap.

## What saving a record does

All of this happens in one database transaction, or none of it happens:

1. The record is saved.
2. For goods, the branch stock goes up by the quantity, and a stock movement of type "Receipt" is written.
3. The subtype's last purchase price is updated.
4. The line's received quantity and progress are updated.
5. If "Give straight to requester" is ticked, an issue document is created and stock goes down again.
6. The event is added to the request history.

Services follow the same steps without any stock change. Once its purchase record is saved, a service line shows Used where a product line shows Received.

## Line progress

| State | When |
| --- | --- |
| Open | Received less than planned, and not finished by hand. |
| Done | Received the planned quantity or more. Automatic. |
| Done, short | The Manager clicks "Finish line" with less than planned and gives a reason. |
| Not bought | The Manager clicks "Not bought" with nothing received and gives a reason. |

While the request is Open, the Manager can reopen a finished line when more items arrive. Buying more than planned is allowed, needs a comment, and shows red.

## Substitution

When the shop has black pens instead of the requested blue ones, the Manager picks the subtype really bought. It must belong to the same product. Stock rises for the subtype bought, the line shows a "Substituted" label, and the request cannot be closed by the Manager alone; Finance reviews it. For a different product, mark the line "Not bought" and create a new request.

## Fixing a mistake

- While the request is Open, the Manager can cancel a purchase record with a reason. Stock goes down by the same quantity.
- Cancelling is blocked when it would push stock below zero, which happens when the items were already issued. The message says to take the items back from the department first, or to use a write-off.
- Editing means cancel and enter again. Cancelled records stay visible, crossed out. Every cancel sends a notification to the Head, and the request header shows how many records were cancelled.
- After the request is Closed, only a reopen by the Head allows corrections.

## Finishing

The "Finish purchasing" button turns on when every line is Done, Done short, or Not bought. It shows a summary of all differences and then follows the closing rules in section 8.
