---
paths:
  - "src/features/warehouse/**"
---

# Warehouse

Read first, under `docs/spec/`: `09-warehouse.md`; `edge-cases/warehouse.md`; `14-data-model.md` (Warehouse).

- Stock changes only through `postMovement()`, which locks the balance row and writes the movement and the balance in one transaction.
- Stock never goes below zero: checked under the lock, and again by the database CHECK.
- Movements are never edited or deleted. A wrong document is fixed with Reverse.
- Quantities follow the measure: no decimals where the measure does not allow them.
- Direct entry is for the Head only. Write-offs and corrections change stock only after the Head approves.
