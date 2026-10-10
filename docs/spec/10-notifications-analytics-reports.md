# Notifications, dashboards and reports

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Every user is told the moment something waits for them, and each role's home page starts with that list.

## Notifications

Notifications appear in an in-app bell with an unread count. No messenger, email or SMS is used.

| Event | Who is told |
| --- | --- |
| Request submitted or submitted again | Head |
| Head approved | Principal of the branch |
| Principal approved | Finance users of the branch |
| Finance approved | Owner, Head |
| Sent back, rejected | Owner, Head |
| Cash given, cash returned, paid back | Owner |
| Sent to settlement | Finance users of the branch |
| Overspend above the guard | Head |
| Overspend acknowledged | Finance users of the branch |
| Closed, reopened | Owner, Head, Finance users of the branch |
| Waiting more than 24 hours | Approvers of the current step |
| Waiting more than 48 hours | Head |
| Needed-by date is 2 days away and the line is not finished | Owner |
| Product suggested | Head; the decision goes back to the Manager |
| Write-off or correction asked | Head; the decision goes back to the Manager |
| Transfer sent | Managers of the receiving branch |
| Item reached its minimum stock | Managers of the branch, once per item until restocked |
| Branch has no active user for a role | Head |
| Purchase record cancelled | Head |
| Recent purchases differ from the reference price by more than 20% | Head |
| A Manager's right is switched on or off | That Manager |

## Home page per role

| Role | What the home page shows, in order |
| --- | --- |
| Manager | Sent back to me; my drafts; my open requests with progress bars; cash I hold; low stock; lines due soon |
| Head | Waiting for my approval; overspends to acknowledge; write-offs and corrections to approve; product suggestions; requests stuck over 48 hours; counts by status per branch; spending this month per branch |
| Principal | Waiting for my approval; my branch's requests by status; my branch's spending this month |
| Finance | Waiting for my approval; waiting for settlement; money with managers |

## Analytics page per role

Each role has its own Analytics page, separate from the home page: home is "what must I do now", Analytics is "what is happening and why". All four pages behave the same way.

1. **Period.** This month, last month, this quarter, this school year, or custom dates. The first day of the school year is set in Settings; until it is set, the school-year choice is hidden. Every number shows its change against the period before.
2. **Filters.** Branch (within the user's branches), category, department, Manager, supplier.
3. **Click to see behind.** Clicking any bar, slice or number opens the list of requests or records that make it up. Every number can be traced to its source.
4. **Export.** Each chart and table exports to Excel. The whole page downloads as a formal PDF report.
5. **Speed.** Summary tables are refreshed every 5 minutes, so the page opens as fast as any other.

**Head, all branches**

| Block | Shows |
| --- | --- |
| Spending | Total by month; branches side by side; by category; by department; top 10 suppliers; split by payment type |
| Plan vs actual | Share of requests ending green, orange and red; total overspent and total saved; by branch and by Manager |
| Prices | Price trend of any product; biggest price rises in the last 90 days; the same product bought at different prices by different branches or suppliers |
| Approval speed | Average hours at each step per branch; requests waiting now, by age; share sent back or rejected, with the most common reasons |
| Managers | Per Manager: number of requests, average difference from plan, cancelled purchase records, cash held and for how long |
| Warehouse | Stock value per branch; low-stock items; use by department; items with no movement for 90 days; value written off |

**Principal, own branch**

| Block | Shows |
| --- | --- |
| Spending | My branch by month against the period before; by category and department; top 10 products |
| Requests | By status; needed-by dates coming up; overdue lines |
| My approvals | Waiting now; my average time to decide |
| Warehouse | Stock value; low stock; what each department used |

**Finance, own branches**

| Block | Shows |
| --- | --- |
| Cash | Given, returned and paid back by month; money with managers by age: up to 7 days, 8 to 30 days, over 30 days |
| Cash needed soon | Planned cash of approved requests not yet paid, plus requests still in approval |
| Payments | Spending by payment type; bank transfers by supplier |
| Plan vs actual | Overspends and savings by branch and Manager; purchases without a receipt |
| Settlement speed | Average days from "Send to settlement" to Closed |

**Manager, own branches**

| Block | Shows |
| --- | --- |
| My requests | By status; average time to full approval; share sent back, with reasons |
| My estimates | Difference between planned and actual price per product, to help estimate better next time |
| My cash | Balance per open request |
| Stock planning | Use of each item per month; "runs out in about 12 days" at the current rate; low stock; suggested order quantity |

"Runs out in" is current stock divided by the average daily issues of the last 90 days.

## Reports

Every report filters by branch, date range and category, respects the user's branches, and exports to Excel.

| Report | Answers |
| --- | --- |
| Request register | All requests with status, totals and dates |
| Purchase register | Every purchase record with supplier, price and payment type |
| Planned vs actual | Differences per request, product and Manager |
| Spending | Totals by branch, category, department, supplier and month |
| Price history | How the price of one product changed over time, as a chart |
| Stock on hand | Quantities and value per branch |
| Stock movements | Everything that went in and out in a period |
| Use by department | What each department received, in quantity and value |
| Money with managers | Open cash balances and their age |
| Approval speed | Average hours a request waits at each step |
