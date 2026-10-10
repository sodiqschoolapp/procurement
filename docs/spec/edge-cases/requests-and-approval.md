# Edge cases: Requests and approval

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec chapter 12, which says: "These 41 situations are the ones most likely to cause trouble; each has a fixed answer, and each becomes a test." This file holds 16 of them.

| Situation | What the system does |
| --- | --- |
| Two approvers click at the same moment | The first wins. The second sees who acted and when. |
| Submit is clicked twice | One submit only. The button disables and the server ignores the repeat. |
| The needed item is not in the catalog | The Manager sends a product suggestion to the Head. |
| A product is deactivated while it sits in a draft | Submit is blocked and the line is marked. |
| The catalog price changes after the draft was written | The draft keeps the typed price; a hint shows the new suggestion. |
| Stock changes between submit and approval | Approvers see both numbers: at submit and now. |
| The needed-by date passes while the request waits | The line shows "Overdue". Nothing is blocked. |
| The same item is needed by two departments | Two lines. The same item for the same department twice is blocked. |
| A delivery fee covers the whole order | Add a service line "Delivery" from the catalog. |
| An approver is on holiday | Reminders, then a notice to the Head. The Head adds a second Finance user, or hands the branch to an acting Principal. |
| A user is deactivated with work waiting | Approval tasks stay with the role. The Head moves that user's own requests to another Manager. |
| A Manager with cash in hand leaves the branch | The request cannot change owner until the cash balance is 0. |
| The Head wants to close a branch | Blocked while it has unfinished requests or stock above 0. |
| The year changes | The counter restarts at 0001 with the new year in the number. |
| A Manager's right is switched off in the middle of a task | The buttons disappear at once and saved work stays. The Head finishes it or moves the request to another Manager. |
| The branch's Principal changes while requests wait | Waiting requests pass to the new Principal. Past approvals keep the old name. |
