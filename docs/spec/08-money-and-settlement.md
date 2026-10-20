# Money and settlement

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Every order keeps its own money count, so every order can be settled, checked and closed on its own. Finance still gives, takes back and pays back money for many ticked orders on one screen, and every so'm belongs to exactly one order.

## Numbers the system calculates

| Name | Formula |
| --- | --- |
| Planned total (order) | round(planned quantity × planned price) + planned extra costs |
| Actual quantity | Sum of quantities of the order's purchase records that are not cancelled |
| Actual goods | Sum of round(quantity × price) over those records |
| Actual extra | Sum of extra costs over those records |
| Actual total | Actual goods + actual extra |
| Difference | Planned total − actual total |

A positive difference means money is left. A negative difference means more was spent. The totals of a group row or of ticked orders are the sums of the order values. Rounding is always half up, to whole so'm.

## The three colours

Each order shows three labels; a group row and the totals of ticked orders show the same three for all of their orders.

| Label | Green | Orange | Red |
| --- | --- | --- | --- |
| Number | Actual quantity equals planned | Bought less | Bought more |
| Price | Every record's unit price equals the planned price | Otherwise, actual goods at or below round(planned price × actual quantity): paid less per unit | Otherwise, actual goods above it: paid more per unit |
| Total | Difference is 0 | Difference above 0: money left | Difference below 0: overspent |

- While an order's buying is still Open, Number and Total show grey "In progress". Price shows grey until something is bought.
- For a group row or ticked orders, Total uses the summed difference. Number and Price take the worst colour among the orders: red beats orange, orange beats green.
- A label is never colour alone. It carries an icon, a word and the amount, for example "Left 50 000" or "Over 30 000".

## Exact match

An order matches exactly when Number and Price are green, actual extra costs equal planned extra costs, the subtype was not substituted, the payment type is the planned one, and its cash count is 0. An order whose differences cancel each other out (the price 10 000 lower, the extra costs 10 000 higher) is not an exact match and goes to Finance.

## Money ledger

Finance records every movement of money as an **action**: one date, not later than today, an optional document number, an optional file and a comment, split into **rows**, one per order. Each row has its order, its kind and an amount above 0. The action's total is the sum of its rows; nobody types a total that could disagree with them. Actions are never deleted; a wrong one is cancelled whole, with a reason, while none of its orders is Closed, and entered again. When one of its orders is already Closed, the Head reopens that order first.

| Kind of row | Direction | Changes the order's cash count |
| --- | --- | --- |
| Cash given | Finance to Manager | Up |
| Cash returned | Manager to Finance | Down |
| Paid back | Finance to Manager, for his own money spent | Up |
| Bank transfer | Finance to supplier | No, shown for information |
| Card top-up | Finance to corporate card | No, shown for information |
| Card money returned | Corporate card to Finance | No, shown for information |

1. **One Manager per action.** Cash moves between Finance and one Manager, so an action's rows belong to the orders of one owner. When the ticked orders belong to several Managers, the screen shows one block per Manager and saves one action per Manager, all in one transaction.
2. **One kind per action,** with one exception: a settlement action may hold Cash returned rows and Paid back rows together, so that only the net changes hands. The screen shows the net: "the Manager hands Finance 20 000" or "Finance pays the Manager 20 000".
3. **No crossing over.** A Cash returned row cannot be larger than the order's cash count, and a Paid back row cannot be larger than what the school owes on the order (its count without the minus sign). So an action never turns an order from "holds money" into "is owed money". Cash given has no such limit.

**Order's cash count** = cash given + paid back − cash returned − cash spent, over the order's rows and records that are not cancelled. "Cash spent" is every purchase and extra cost of the order with payment type Cash that is not cancelled.

- Above 0: the Manager holds school money for this order and must return it.
- Below 0: the Manager spent his own money and Finance pays him back.
- The count must be 0 before the order can close.

**Manager's cash balance** is shown as two numbers, never netted: what the Manager holds (the sum of the positive counts of his orders that are not Closed) and what he is owed (the sum of the negative ones).

## When Finance approves

The approval dialog shows the planned totals of the ticked orders per payment type, and a table "Cash given to the Manager now" with one row per order that has planned cash, prefilled with that order's planned cash: its planned total when its payment type is Cash, else 0. Finance can change any row or set it to 0, and give cash later; rows of 0 write nothing. The cash action is saved in the same transaction as the approval. Finance can add more actions at any time while the orders are Open; a later Cash given row is prefilled with the order's planned cash not yet given, never below 0. The Manager may buy before cash is given; the count then goes below 0 until Finance pays.

## Closing

1. **Exact match.** The Manager ticks finished orders that match exactly and sees "Close" with the text "I confirm that all items entered the warehouse of this branch". One click closes them. Finance and the Head are notified. If the Head has switched off this Manager's right to close alone, these orders go to settlement instead.
2. **Any difference.** The Manager ticks finished orders and clicks "Send to settlement". Finance sees one screen for the ticked orders in settlement, with a block per Manager and, inside it, a block for each payment type that was used:

| Block | Shows, per order | Finance does |
| --- | --- | --- |
| Cash | Given, spent, returned, paid back, count | One settlement action: a Receive row (kind Cash returned) for each order whose count is above 0 and a Pay row (kind Paid back) for each order below 0, prefilled with the count; partial amounts are allowed; the net is shown |
| Bank transfer | Planned, transferred, value of goods received | Ticks "Confirmed" per order. If transferred and received differ, a note is required: the supplier owes goods or a refund |
| Corporate card | Planned, actually charged | Ticks "Confirmed" per order. Leftover stays on the card, or Finance records a Card money returned row when the Manager sends it back |

3. **Close.** Finance ticks orders and clicks "Close". It works when, for every ticked order, the cash count is 0, every block is confirmed, and any required Head acknowledgment is given; otherwise nothing closes and the screen names the orders that are not ready.
4. **Send back.** If Finance finds a wrong record, it sends the order back to Open with a reason.

The settlement screen also shows how many purchase records were cancelled on each order, with a link to each one.

## Overspend guard

When an order's actual total is above its planned total by more than 10% **and** by more than 100 000 so'm, the Head is notified and must click "Acknowledge overspend" with a comment before Finance can close it. Both numbers are settings. With the percent at 0 only the amount counts; with the amount at 0 only the percent counts; with both at 0 every overspend needs the Head; the guard can be switched off. The Head can acknowledge several ticked orders with one comment. A reopen by the Head clears the acknowledgment together with the settlement confirmations, so a reopened order is checked again.

## Worked example

Plan: 100 notebooks × 5 000 in cash, plus 20 000 delivery. Planned total 520 000. Finance gives 520 000 in cash.

| Case | What was bought | Labels | Cash count | Ending |
| --- | --- | --- | --- | --- |
| Exact | 100 × 5 000 + 20 000 | All green | 0 | Manager closes |
| Cheaper | 100 × 4 500 + 20 000 = 470 000 | Number green, Price orange, Total orange "Left 50 000" | +50 000 | Manager returns 50 000, Finance closes |
| Dearer | 100 × 5 200 + 30 000 = 550 000 | Number green, Price red, Total red "Over 30 000" | −30 000 | Finance pays back 30 000 and closes. 5.8% and 30 000 so'm are under the guard |
| Fewer | 90 × 5 000 + 20 000 = 470 000 | Number orange, Price green, Total orange "Left 50 000" | +50 000 | Manager returns 50 000, Finance closes |

**Three orders, one action.** Three cash orders of one Manager in branch CHL; Finance ticks all three, approves, and gives 650 000, prefilled per order.

| Order | Planned | Cash given | Spent | Count | Ending |
| --- | --- | --- | --- | --- | --- |
| CHL-26-0142, 100 notebooks × 5 000 + 20 000 delivery | 520 000 | 520 000 | 470 000 | +50 000 | Settlement: Receive 50 000 |
| CHL-26-0143, 50 pens × 2 000 | 100 000 | 100 000 | 130 000 | −30 000 | Settlement: Pay 30 000. 30% over, but only 30 000 so'm: no Head step |
| CHL-26-0144, 10 folders × 3 000 | 30 000 | 30 000 | 30 000 | 0 | Exact match: the Manager closes it alone |

The Manager ticks 0142 and 0143 and sends them to settlement. Finance's one settlement action holds a Cash returned row of 50 000 on 0142 and a Paid back row of 30 000 on 0143; the screen shows "the Manager hands Finance 20 000". Both counts reach 0, and Finance closes both orders.

## Money with managers

Finance and the Head have a page listing every Manager's cash balance (held and owed, apart), oldest first, with the date since when, and the orders behind it. It answers "who is holding school money right now, and since when".
