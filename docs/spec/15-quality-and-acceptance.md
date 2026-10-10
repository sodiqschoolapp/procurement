# Quality: tests and acceptance scenarios

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The app is finished only when the 18 scenarios below pass as automated tests, on top of three layers of smaller tests.

## Test layers

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Vitest | Every function in `src/domain/`: totals, rounding, the three colours, cash balance, average cost, every allowed and forbidden status move. |
| Database | Vitest with a real PostgreSQL | Every server action. The full permission matrix: each action × each role × own branch and other branch. Actions run two at a time to prove the locks work. |
| Full flow | Playwright | The scenarios below, clicked through in a real browser as each role, at phone and desktop width. |

Type checking, linting and all three layers run automatically on every commit.

## Acceptance scenarios

All use branch code CHL and the plan from section 8 unless stated: 100 notebooks × 5 000 in cash plus 20 000 delivery, total 520 000.

| # | Scenario | Must end with |
| --- | --- | --- |
| S1 | Exact match. Three approvals, Finance gives 520 000, Manager buys exactly as planned. | All labels green. Manager closes. Stock +100. Cash balance 0. |
| S2 | Cheaper. Manager pays 4 500 each. | Total orange "Left 50 000". Finance records 50 000 returned and closes. |
| S3 | Dearer. Manager pays 5 200 each and 30 000 delivery. | Total red "Over 30 000". Finance pays back 30 000 and closes. No Head step. |
| S4 | In parts. Monday 60 notebooks; 10 issued to a department; Friday 40 more. | Stock 60, then 50, then 90. Request stays Open until Friday. |
| S5 | Send back. Head sends back with a note on one line; Manager changes 100 to 80 and submits again. | Same number, "rev 2". Head sees "100 → 80" highlighted. Approval restarts at Head. |
| S6 | Reject. Principal rejects with a reason. | Status Rejected, read-only. "Copy as new" creates a draft. |
| S7 | Branch wall. Principal of branch A opens a request address of branch B. | "Not found". The same holds for stock and reports. |
| S8 | Same moment. Two Head users approve together; two Managers issue the last 5 notebooks together. | One success each. The other gets a clear message. Stock never below 0. |
| S9 | Mixed payment. A cash line ends 10 000 over; a card line ends 40 000 under. | Settlement shows "Pay Manager 10 000" and card "Left 40 000". Closes after both are handled. |
| S10 | Substitution. Blue pens requested, black pens bought at the same price. | Stock rises for black. Line shows "Substituted". Manager cannot close alone. |
| S11 | Blocked cancel. Manager records 100, issues 30, then tries to cancel the purchase record. | Blocked with the explanation. Stock stays 70. |
| S12 | Overspend guard. Actual total 600 000, which is about 15% over. | Finance cannot close until the Head acknowledges. |
| S13 | Nothing bought. Finance gives 520 000; every line "Not bought". | Settlement asks for 520 000 back. Closes with no stock change. |
| S14 | Numbering. Two Managers submit their first requests of 2027 in CHL at the same moment. | Numbers CHL-27-0001 and CHL-27-0002, no duplicate, no gap. |
| S15 | Direct entry. The Head enters 200 chairs that branch CHL already owns. A Manager tries to do the same. | Stock +200 and the item card says Direct entry. The Manager has no button and the server refuses. |
| S16 | Right switched off. The Head switches off the right to close alone for a Manager, who then finishes an exact match. | The Manager has no Close button. The request goes to Finance, who closes it. |
| S17 | Formal PDF. A user downloads the PDF while the request waits for the Principal. | The Head's name, decision and time are printed. Principal and Finance say Waiting. Totals equal the screen. |
| S18 | New price. The Head changes the notebook price from 5 000 to 6 500. | A new draft suggests 6 500. An older draft keeps 5 000 and shows -23% vs catalog price. The price history lists both. |

## Done-check for every phase

- [ ] Type check and lint pass with no warnings.
- [ ] All tests pass, including those of earlier phases.
- [ ] The seed script runs on an empty database.
- [ ] New screens were opened at 375 px and 1440 px widths.
- [ ] No translation key is missing in Uzbek, Russian or English.
- [ ] Every new rule from this spec has at least one test that names it.
