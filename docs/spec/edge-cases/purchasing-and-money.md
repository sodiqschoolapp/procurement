# Edge cases: Purchasing and money

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec chapter 12, which says: "These 41 situations are the ones most likely to cause trouble; each has a fixed answer, and each becomes a test." This file holds 16 of them.

| Situation | What the system does |
| --- | --- |
| The shop has only part of the quantity | Record what was bought. The line stays Open. |
| The item cannot be found at all | "Not bought" with a reason. |
| A different colour or size was bought | Substitution inside the same product, with a comment. Finance reviews. |
| A completely different product is needed | "Not bought", then a new request. |
| More was bought than approved | Allowed, with a comment. Number shows red. The overspend guard may apply. |
| The item was free | Price 0 with a comment. |
| A typo in a purchase record | Cancel it and enter it again while the request is Open. The Head is notified of every cancel. |
| A purchase record must be cancelled but the items were already issued | Blocked, with an explanation of how to bring the stock back first. |
| The Manager bought before cash was given | The cash balance goes below 0 and Finance pays him back. |
| Cash was given but nothing was bought | All lines "Not bought"; in settlement the Manager returns the full amount. |
| Planned by card, paid in cash | The Manager sets the real payment type on the record. The cash balance follows. |
| Delivery for a bank-transfer item was paid in cash | An extra cost row with payment type Cash. |
| No receipt photo | Allowed. Finance sees a "No receipt" label. A setting can make receipts required for cash. |
| Finance finds an error during settlement | Sends the request back to Open with a reason. |
| Faulty goods go back to the supplier | While Open: cancel the purchase record. After closing: a write-off with reason "Returned to supplier". |
| An error is found after closing | The Head reopens the request with a reason. Balances are recalculated, earlier settlement confirmations are cleared, and Finance settles again. |
