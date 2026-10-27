# Edge cases: Requests and approval

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec chapter 12, which says: "These 41 situations are the ones most likely to cause trouble; each has a fixed answer, and each becomes a test." This file holds 16 of them, and 2 more added with the order list on 15 October 2026, and 1 more on 25 October 2026.

| Situation | What the system does |
| --- | --- |
| Two approvers click at the same moment | The first wins. The second sees who acted and when; when the second action covered more orders, nothing of it is saved and the list refreshes. |
| Submit is clicked twice | One submit only. The button disables and the server ignores the repeat. |
| One of many ticked orders changed a moment ago | Nothing is saved. The screen names the order that changed and refreshes; the user acts again. |
| The needed item is not in the catalog | The Manager adds it from the order's product search (`04-catalogs.md` rule 8); with the right "Add products and subtypes" switched off, the Head adds it. |
| A product is deactivated while it sits in a draft | The draft is marked and not submitted; the other ready drafts are (when drafts are ticked, nothing is submitted). |
| The catalog price changes after the draft was written | The draft keeps the typed price; a hint shows the new suggestion. |
| Stock changes between submit and approval | Approvers see both numbers: at submit and now. |
| The needed-by date passes while the order waits | The order shows "Overdue". Nothing is blocked. |
| The same item is needed by two departments | Two orders, one per department. Lists show them in one group row. |
| The same item for the same department is added again while a draft for it exists | The draft's quantity rises; no second draft. Once submitted, a new order is made and lists show both in one group row. |
| A delivery fee covers a whole shop visit | It is its own order, a service such as "Delivery", planned and approved like any other. A fee that only turns up at the shop is an extra cost on one order of the trip (section 7). |
| An approver is on holiday | Reminders, then a notice to the Head. The Head adds a second Finance user, or hands the branch to an acting Principal. |
| The Head switches the Principal step off while orders wait for the Principal | Refused; the Head sees those orders and switches off once none is left (`06-approval-workflow.md`, "Principal step switched off"). |
| The Head switches the Finance step off while orders wait for Finance or for settlement | Refused; the Head sees those orders and switches off once none is left (`06-approval-workflow.md`, "Finance step switched off"). |
| A user is deactivated with work waiting | Approval tasks stay with the role. The Head moves that user's own orders to another Manager. |
| A Manager with cash in hand leaves the branch | An order cannot change owner until its cash count is 0. |
| The Head wants to close a branch | Blocked while it has unfinished orders or stock above 0. |
| The year changes | The counter restarts at 0001 with the new year in the number. |
| A Manager's right is switched off in the middle of a task | The buttons disappear at once and saved work stays. The Head finishes it or moves the orders to another Manager. |
| The branch's Principal changes while orders wait | Waiting orders pass to the new Principal. Past approvals keep the old name. |
