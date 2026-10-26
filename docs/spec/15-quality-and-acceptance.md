# Quality: tests and acceptance scenarios

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The app is finished only when the 24 scenarios below pass as automated tests, on top of three layers of smaller tests.

## Test layers

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Vitest | Every function in `src/domain/`: totals, rounding, the three colours, cash count, the prefilled cash rows, average cost, every allowed and forbidden status move. |
| Database | Vitest with a real PostgreSQL | Every server action, on one order and on many ticked orders. The full permission matrix: each action × each role × own branch and other branch. Actions run two at a time to prove the locks work. |
| Full flow | Playwright | The scenarios below, clicked through in a real browser as each role, at phone and desktop width. |

Type checking, linting and all three layers run automatically on every commit.

## Acceptance scenarios

All use branch code CHL and the plan from section 8 unless stated: one order of 100 notebooks × 5 000 in cash plus 20 000 delivery, total 520 000.

| # | Scenario | Must end with |
| --- | --- | --- |
| S1 | Exact match. Three approvals, Finance gives 520 000, Manager buys exactly as planned. | All labels green. Manager closes. Stock +100. Cash count 0. |
| S2 | Cheaper. Manager pays 4 500 each. | Total orange "Left 50 000". Finance records 50 000 returned and closes. |
| S3 | Dearer. Manager pays 5 200 each and 30 000 delivery. | Total red "Over 30 000". Finance pays back 30 000 and closes. No Head step. |
| S4 | In parts. Monday 60 notebooks; 10 issued to a department; Friday 40 more. | Stock 60, then 50, then 90. The order stays Open until Friday. |
| S5 | Send back. Head sends the order back with a note; Manager changes 100 to 80 and submits again. | Same number, "rev 2". Head sees "100 → 80" highlighted. Approval restarts at Head. |
| S6 | Reject. Principal rejects with a reason. | Status Rejected, read-only. "Copy as new" creates a draft. |
| S7 | Branch wall. Principal of branch A opens an order address of branch B, and ticks an order of branch B through a forged action. | "Not found", and the action is refused with nothing saved. The same holds for stock and reports. |
| S8 | Same moment. Two Head users approve the same ticked orders together; two Managers issue the last 5 notebooks together. | One success each. The other gets a clear message. Stock never below 0. |
| S9 | Mixed payment. A cash order ends 10 000 over; a card order ends 40 000 under; both are ticked in settlement. | Settlement shows "Pay Manager 10 000" and card "Left 40 000". Both close after both are handled. |
| S10 | Substitution. Blue pens ordered, black pens bought at the same price. | Stock rises for black. The order shows "Substituted". Manager cannot close alone. |
| S11 | Blocked cancel. Manager records 100, issues 30, then tries to cancel the purchase record. | Blocked with the explanation. Stock stays 70. |
| S12 | Overspend guard. Actual total 600 000, which is about 15% and 80 000 so'm over. With the amount setting at 50 000 instead of 100 000, the same purchase. | At 100 000 Finance can close without the Head; at 50 000 Finance cannot close until the Head acknowledges. |
| S13 | Nothing bought. Finance gives 520 000; the order is "Not bought". | Settlement asks for 520 000 back. Closes with no stock change. |
| S14 | Numbering. Two Managers submit their first orders of 2027 in CHL at the same moment, two orders each. | Numbers CHL-27-0001 to CHL-27-0004, no duplicate, no gap. |
| S15 | Direct entry. The Head enters 200 chairs that branch CHL already owns. A Manager tries to do the same. | Stock +200 and the item card says Direct entry. The Manager has no button and the server refuses. |
| S16 | Right switched off. The Head switches off the right to close alone for a Manager, who then finishes an exact match. | The Manager has no Close button. The order goes to Finance, who closes it. |
| S17 | Download. A user filters the order list to one week and downloads Excel and PDF while an order waits for the Principal. | The files list exactly the filtered orders; the Head's name and time are in the order's row and Principal and Finance are empty; the totals equal the screen. |
| S18 | New price. The Head changes the notebook price from 5 000 to 6 500. | A new draft suggests 6 500. An older draft keeps 5 000 and shows -23% vs catalog price. The price history lists both. |
| S19 | One row per product. The Manager submits 10 Tata pens, then 10 more, then (after the Head approved the first 20) 10 more. | The Head first sees one row "Tata pens, 20"; after approving it, the Principal sees 20; once the Head approves the last 10, the Principal sees one row "Tata pens, 30" holding three orders. Approving that row moves all three; each keeps its own number and history. Adding 10 to a draft of the same pens for the same department raises that draft to 20 instead of making a second one. |
| S20 | Many orders, one action. Finance approves the three orders of the worked example in section 8 and gives 650 000; buying follows the example; a fourth ticked order was approved by another Finance user a moment earlier. | The first approval is refused whole and names the fourth order; approved again without it, the 650 000 is split 520 000, 100 000 and 30 000; 0144 is closed by the Manager; one settlement action receives 50 000 and pays 30 000, the screen shows the net 20 000, and both orders close. |
| S21 | Finance step off. The Head tries to switch the Finance step off while one order waits for Finance, and again once Finance has approved it. A second order is then approved by the Principal and bought at 6 500 each. Afterwards the Head switches the step on again. | The first switch is refused and names the waiting order. The second order goes from the Principal straight to Open; its stepper reads Finance "Skipped" and it has no Money tab and no cash count. Total red "Over 150 000"; the Head is told of the overspend; the Manager closes it with no settlement and no acknowledgment. After switching on, the next order the Principal approves waits for Finance. |
| S22 | A Manager adds what is missing. While ordering, the Manager types "Marker, black", which is not in the catalog, and adds it as a product in Stationery, measured in pcs. Then the Manager types "daftar 48 VARAQ" while "Daftar 48 varaq" exists. Last, the Manager adds the subtype "black" to "Pen", which had no subtypes and 40 in stock, naming the existing ones "blue". The Head then switches off the right "Add products and subtypes" for this Manager. | The marker is on the draft at once, with no price suggested and no price hint. The existing "Daftar 48 varaq" is offered and no second product is made. The 40 in stock and the earlier pen orders now read "Pen · blue", and the new draft uses "Pen · black". The Head's home lists the marker and "black" until the Head marks them checked. With the right off, the search offers no Add line and the server refuses the add. |
| S23 | The order sheet. A Manager with one branch types three rows: 100 notebooks for Maths needed by 05.11, 20 pens (department and date copied from the row above), and 5 markers with no price. The pens get "Urgent" under "More". An order the Principal sent back to this Manager also stands in the sheet. The Manager presses Submit without ticking anything. | The pens row came with Maths and 05.11 already filled. Two orders are submitted, each with its own number; the markers row stays in the sheet with its price cell marked and named on top, and the sent-back order stays, not submitted again. Once the price is typed, Submit sends it with the next number. No row showed a branch cell. |
| S24 | Fields the Head sets. With the Finance step off, the Head hides "Needed by" and makes department and price optional. A Manager submits 10 folders with no department and no price; the Principal approves, and the Manager buys them for 45 000 and closes the order. The Head then tries to switch the Finance step on, makes price required, and tries again. | The sheet shows no needed-by cell. The order is submitted with a number; approvers and the order page show "No planned price". After the purchase Number is green, Price and Total read "No planned price", the actual total is 45 000, no overspend notice is sent, and "Give straight to requester" was not offered. The first switch is refused because price is not required; the second goes through, and the next order the Principal approves waits for Finance. |

## Done-check for every phase

- [ ] Type check and lint pass with no warnings.
- [ ] All tests pass, including those of earlier phases.
- [ ] The seed script runs on an empty database.
- [ ] New screens were opened at 375 px and 1440 px widths.
- [ ] No translation key is missing in Uzbek, Russian or English.
- [ ] Every new rule from this spec has at least one test that names it.
