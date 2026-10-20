# Edge cases: Purchasing and money

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec chapter 12, which says: "These 41 situations are the ones most likely to cause trouble; each has a fixed answer, and each becomes a test." This file holds 16 of them, and 4 more added with the order list on 15 October 2026.

| Situation | What the system does |
| --- | --- |
| The shop has only part of the quantity | Record what was bought. The order stays Open. |
| The item cannot be found at all | "Not bought" with a reason. |
| A different colour or size was bought | Substitution inside the same product, with a comment. Finance reviews. |
| A completely different product is needed | "Not bought", then a new order. |
| More was bought than approved | Allowed, with a comment. Number shows red. The overspend guard may apply. |
| The item was free | Price 0 with a comment. |
| A typo in a purchase record | Cancel it and enter it again while the order is Open. The Head is notified of every cancel. If the order was moved to another Manager since, the Head first moves it back to the Manager who held it when the record was written. |
| A purchase record must be cancelled but the items were already issued | Blocked, with an explanation of how to bring the stock back first. |
| The Manager bought before cash was given | The order's cash count goes below 0 and Finance pays him back. |
| Cash was given but nothing was bought | The order is "Not bought"; in settlement the Manager returns the full amount. |
| Planned by card, paid in cash | The Manager sets the real payment type on the record. The cash count follows. |
| Delivery for a bank-transfer item was paid in cash | An extra cost row with payment type Cash. |
| No receipt photo | Allowed. Finance sees a "No receipt" label. A setting can make receipts required for cash: for a trip paid in cash, and for a trip with an extra cost paid in cash. |
| Finance finds an error during settlement | Sends that order back to Open with a reason. |
| Faulty goods go back to the supplier | While Open: cancel the purchase record. After closing: a write-off with reason "Returned to supplier". |
| An error is found after closing | The Head reopens the order with a reason. Its counts are recalculated, earlier settlement confirmations and the overspend acknowledgment are cleared, and Finance settles it again. |
| A money action must be cancelled but one of its orders is already Closed | The Head reopens that order first; then Finance cancels the action and enters it again. |
| Finance gives cash for several orders | One row per order, prefilled with that order's planned cash and changeable; no single amount is typed, so every so'm belongs to one order. |
| One order holds money and another of the same Manager is owed | One settlement action receives on the first and pays on the second; only the net changes hands. Neither order crosses from holding to owed. |
| The ticked orders in settlement belong to two Managers | One block and one action per Manager, saved together. |
