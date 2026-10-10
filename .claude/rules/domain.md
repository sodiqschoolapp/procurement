---
paths:
  - "src/domain/**"
---

# Business rules (`src/domain/`)

Read first, under `docs/spec/`: `edge-cases/developer-rules.md` rules 1, 2, 6; `08-money-and-settlement.md` (Numbers the system calculates; The three colours; Exact match; Money ledger); `06-approval-workflow.md` (Allowed moves); `09-warehouse.md` (Stock value).

- Pure functions only: no database, no clock, no network, no import from outside `src/domain/`.
- Money goes in and out as whole so'm (`bigint`). decimal.js is used for quantity × price. Rounding is always half up. No `number` arithmetic on money.
- A formula exists once. If a screen, a PDF or a report needs a value, it calls the function here.
- The state machine is one file. A status move that is not a row of the allowed-moves table does not exist.
- Every function has unit tests that name the spec rule, and the worked example of section 8 is among them.
