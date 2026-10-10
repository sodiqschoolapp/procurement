# Edge cases: Warehouse

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec chapter 12, which says: "These 41 situations are the ones most likely to cause trouble; each has a fixed answer, and each becomes a test." This file holds 7 of them.

| Situation | What the system does |
| --- | --- |
| Two Managers issue the last items at the same moment | One succeeds. The other sees how many are left. |
| A wrong issue was posted | "Reverse" with a reason. |
| Half a piece is typed for an item counted in pieces | Blocked. Decimals follow the measure. |
| The school already has stock on launch day | The Head enters it directly, by form or Excel import, with the reason: stock we already had. |
| An item goes straight from the shop to a classroom | "Give straight to requester" on the purchase record. |
| A transfer arrives short | The shortage becomes a write-off request for the Head. |
| A gift or donation arrives without a request | The Head records a direct entry with the reason: gift or donation. |
