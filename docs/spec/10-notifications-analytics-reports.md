# Notifications, dashboards and reports

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Every user is told the moment something waits for them, and each role's home page starts with that list.

## Notifications

Notifications appear in an in-app bell with an unread count. No messenger, email or SMS is used.

One action sends one notification to each person told, never one per order: "Dilnoza submitted 15 orders in CHL", "Principal approved 8 orders in CHL", "Finance gave 650 000 for 3 orders". Its link opens the order list filtered to those orders. The bell shows only notifications of branches the reader has now.

| Event | Who is told |
| --- | --- |
| Orders submitted or submitted again | Head |
| Head approved | Principal of the branch |
| Principal approved | Finance users of the branch; for orders that skipped Finance (section 6), owner and Head |
| Finance approved | Owner, Head |
| Sent back, rejected | Owner, Head |
| Cancelled by someone other than its owner | Owner |
| Orders moved to another Manager | The new owner and the old one |
| Cash given, cash returned, paid back | Owner |
| Sent to settlement | Finance users of the branch |
| Overspend above the guard | Head |
| Overspend acknowledged | Finance users of the branch |
| Closed, reopened | Owner, Head, Finance users of the branch |
| Orders waiting more than 24 hours | Approvers of their step, once a day, grouped: "9 orders have waited more than 24 hours" |
| Orders waiting more than 48 hours | Head, grouped the same way |
| Needed-by date is 2 days away and the order's buying is not finished | Owner |
| Product suggested | Head; the decision goes back to the Manager |
| Write-off or correction asked | Head; the decision goes back to the Manager |
| Transfer sent | Managers of the receiving branch |
| Transfer cancelled | Managers of the receiving branch |
| Item reached its minimum stock | Managers of the branch, once per item until restocked |
| Branch has no active user for a role | Head; not for Finance while the Finance step is off |
| Purchase record cancelled | Head |
| Recent purchases differ from the reference price by more than 20% | Head |
| A Manager's right is switched on or off | That Manager |
| The weekly copy of the database failed | Every active Head, each night until a copy succeeds |

## Home page per role

Each list on a home page with something in it shows counts and group rows, with a link to the filtered order list; an empty one is left out.

| Role | What the home page shows, in order |
| --- | --- |
| Manager | Sent back to me; my drafts; my open orders with progress; cash I hold; low stock; orders due soon |
| Head | Waiting for my approval, by branch; overspends to acknowledge; write-offs and corrections to approve; product suggestions; orders stuck over 48 hours; counts by status per branch; spending this month per branch |
| Principal | Waiting for my approval, with the total amount; my branch's orders by status; my branch's spending this month |
| Finance | Waiting for my approval; waiting for settlement; money with managers |

## Analytics page per role

Each role has its own Analytics page, separate from the home page: home is "what must I do now", Analytics is "what is happening and why". All four pages behave the same way.

1. **Period.** This month, last month, this quarter, this school year, or custom dates. The first day of the school year is set in Settings; until it is set, the school-year choice is hidden. Every number shows its change against the period before: on screen in short ("+1 285 000 (+12 %)", "+29 333 (new)"), in the PDF and Excel in a sentence. While a period is still running, it is compared with the same number of days at the start of the period before (1 to 18 October against 1 to 18 September), and the page says so.
2. **Filters.** Branch (within the user's branches), category, department, Manager, supplier.
3. **Click to see behind.** Clicking any bar, slice or number opens the list of orders or records that make it up. Every number can be traced to its source.
4. **Export.** Each chart and table exports to Excel. The whole page downloads as a PDF report, without signature lines.
5. **Speed.** Summary tables are refreshed every 5 minutes, so the page opens as fast as any other.

**Head, all branches**

| Block | Shows |
| --- | --- |
| Spending | Total by month; branches side by side; by category; by department; top 10 suppliers; split by payment type |
| Plan vs actual | Share of orders ending green, orange and red; total overspent and total saved; by branch and by Manager |
| Prices | Price trend of any product; biggest price rises in the last 90 days; the same product bought at different prices by different branches or suppliers |
| Approval speed | Average hours at each step per branch; orders waiting now, by age; share sent back or rejected, with the most common reasons |
| Managers | Per Manager: number of orders, average difference from plan, cancelled purchase records, cash held and for how long |
| Warehouse | Stock value per branch; low-stock items; use by department; items with no movement for 90 days; value written off |

**Principal, own branch**

| Block | Shows |
| --- | --- |
| Spending | My branch by month against the period before; by category and department; top 10 products |
| Orders | By status; needed-by dates coming up; overdue orders |
| My approvals | Waiting now; my average time to decide |
| Warehouse | Stock value; low stock; what each department used |

**Finance, own branches**

| Block | Shows |
| --- | --- |
| Cash | Given, returned and paid back by month; money with managers by age: up to 7 days, 8 to 30 days, over 30 days |
| Cash needed soon | Planned cash of approved orders not yet paid, plus orders still in approval |
| Payments | Spending by payment type; bank transfers by supplier |
| Plan vs actual | Overspends and savings by branch and Manager; purchases without a receipt |
| Settlement speed | Average days from "Send to settlement" to Closed |

**Manager, own branches**

| Block | Shows |
| --- | --- |
| My orders | By status; average time to full approval; share sent back, with reasons |
| My estimates | Difference between planned and actual price per product, to help estimate better next time |
| My cash | Count per open order |
| Stock planning | Use of each item per month; "runs out in about 12 days" at the current rate; low stock; suggested order quantity |

"Runs out in" is current stock divided by the average daily issues of the last 90 days.

## Reports

Every report filters by branch, date range and category, respects the user's branches, and exports to Excel. The branch filter starts at the branch picked in the branch switcher on top.

| Report | Answers |
| --- | --- |
| Order register | All orders with status, totals and dates (the order list download, section 5) |
| Purchase register | Every purchase record with supplier, price and payment type |
| Planned vs actual | Differences per order, product and Manager |
| Spending | Totals by branch, category, department, supplier and month |
| Price history | How the price of one product changed over time, as a chart; the Head's notes on reference prices and who set them are shown to the Head and Finance only |
| Stock on hand | Quantities and value per branch |
| Stock movements | Everything that went in and out in a period |
| Use by department | What each department received, in quantity and value |
| Money with managers | Open cash balances and their age; Head and Finance only |
| Approval speed | Average hours an order waits at each step |
