---
paths:
  - "src/features/money/**"
  - "src/features/purchasing/**"
---

# Purchasing, money and settlement

Read first, under `docs/spec/`: `07-purchasing.md`; `08-money-and-settlement.md`; `edge-cases/purchasing-and-money.md`.

- Saving a purchase record does all of its steps in one transaction or none.
- Totals, colours, exact match and the cash balance are read from `src/domain/`, never recalculated here.
- Purchase records and money entries are never deleted. A wrong one is cancelled with a reason and stays visible.
- A cancel that would push stock below zero is blocked, with the message that names the two ways out.
- A request closes only when the cash balance is exactly 0. Services change no stock.
