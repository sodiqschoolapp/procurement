# Money and settlement

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

A request closes only when planned and actual are compared line by line and the Manager's cash balance is exactly zero. All amounts are whole so'm, and rounding is always half up.

## Numbers the system calculates

| Name | Formula |
| --- | --- |
| Planned total (line) | round(planned quantity × planned price) + planned extra costs |
| Actual quantity | Sum of quantities of the line's purchase records that are not cancelled |
| Actual goods | Sum of round(quantity × price) over those records |
| Actual extra | Sum of extra costs over those records |
| Actual total | Actual goods + actual extra |
| Difference | Planned total − actual total |

A positive difference means money is left. A negative difference means more was spent. Request totals are the sums of the line values.

## The three colours

Each line shows three labels, and the request header shows the same three for the whole request.

| Label | Green | Orange | Red |
| --- | --- | --- | --- |
| Number | Actual quantity equals planned | Bought less | Bought more |
| Price | Actual goods equals planned price × actual quantity | Paid less per unit | Paid more per unit |
| Total | Difference is 0 | Difference above 0: money left | Difference below 0: overspent |

- While a line is still Open, Number and Total show grey "In progress". Price shows grey until something is bought.
- At request level, Total uses the summed difference. Number and Price take the worst colour among the lines: red beats orange, orange beats green.
- A label is never colour alone. It carries an icon, a word and the amount, for example "Left 50 000" or "Over 30 000".

## Exact match

A line matches exactly when Number and Price are green, actual extra costs equal planned extra costs, the subtype was not substituted, and the payment type is the planned one. A request matches exactly when every line does and the Manager's cash balance is 0.

## Money ledger

Finance records every movement of money on the request. Entries are never deleted; a wrong one is cancelled with a reason while the request is not Closed.

| Entry | Direction | Changes the Manager's cash balance |
| --- | --- | --- |
| Cash given | Finance to Manager | Up |
| Cash returned | Manager to Finance | Down |
| Paid back | Finance to Manager, for his own money spent | Up |
| Bank transfer | Finance to supplier | No, shown for information |
| Card top-up | Finance to corporate card | No, shown for information |
| Card money returned | Corporate card to Finance | No, shown for information |

Each entry has an amount above 0, a date, an optional document number, an optional file and a comment.

**Manager's cash balance** = cash given + paid back − cash returned − cash spent. "Cash spent" is every purchase and extra cost with payment type Cash that is not cancelled.

- Above 0: the Manager holds school money and must return it.
- Below 0: the Manager spent his own money and Finance pays him back.
- The balance must be 0 before the request can close.

## When Finance approves

The approval dialog shows the planned totals per payment type. A field "Cash given to the Manager now" is prefilled with the planned cash total; Finance can change it or set it to 0 and give cash later. Finance can add more entries at any time while the request is Open. The Manager may buy before cash is given; the balance then goes below 0 until Finance pays.

## Closing

1. **Exact match.** The Manager sees "Close request" with the text "I confirm that all items entered the warehouse of this branch". One click closes it. Finance and the Head are notified. If the Head has switched off this Manager's right to close alone, the request goes to Finance instead.
2. **Any difference.** The Manager clicks "Send to settlement". Finance sees one screen with a block for each payment type that was used:

| Block | Shows | Finance does |
| --- | --- | --- |
| Cash | Given, spent, returned, paid back, balance | Clicks "Receive from Manager" or "Pay Manager"; the amount is prefilled and partial amounts are allowed |
| Bank transfer | Planned, transferred, value of goods received | Ticks "Confirmed". If transferred and received differ, a note is required: the supplier owes goods or a refund |
| Corporate card | Planned, actually charged | Ticks "Confirmed". Leftover stays on the card, or Finance records a Card money returned entry when the Manager sends it back |

3. **Close.** The "Close request" button for Finance turns on when the cash balance is 0, every block is confirmed, and any required Head acknowledgment is given.
4. **Send back.** If Finance finds a wrong record, it sends the request back to Open with a reason.

Lines whose differences cancel each other out (one 10 000 cheaper, another 10 000 dearer) still go to Finance. No money moves, but Finance confirms. The settlement screen also shows how many purchase records were cancelled on the request, with a link to each one.

## Overspend guard

When the request's actual total is above the planned total by more than 10%, the Head is notified and must click "Acknowledge overspend" with a comment before Finance can close. The percent is a setting; 0 means every overspend needs the Head, and it can be switched off.

## Worked example

Plan: 100 notebooks × 5 000 in cash, plus 20 000 delivery. Planned total 520 000. Finance gives 520 000 in cash.

| Case | What was bought | Labels | Cash balance | Ending |
| --- | --- | --- | --- | --- |
| Exact | 100 × 5 000 + 20 000 | All green | 0 | Manager closes |
| Cheaper | 100 × 4 500 + 20 000 = 470 000 | Number green, Price orange, Total orange "Left 50 000" | +50 000 | Manager returns 50 000, Finance closes |
| Dearer | 100 × 5 200 + 30 000 = 550 000 | Number green, Price red, Total red "Over 30 000" | −30 000 | Finance pays back 30 000 and closes. 5.8% is under the guard |
| Fewer | 90 × 5 000 + 20 000 = 470 000 | Number orange, Price green, Total orange "Left 50 000" | +50 000 | Manager returns 50 000, Finance closes |

## Money with managers

Finance and the Head have a page listing every Manager's open cash balance across all requests, oldest first. It answers "who is holding school money right now, and since when".
