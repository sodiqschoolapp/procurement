---
paths:
  - "drizzle/**"
  - "src/server/db/**"
---

# Database and migrations

Read first, under `docs/spec/`: `14-data-model.md` (the whole file); `edge-cases/developer-rules.md` rules 5, 6, 7, 10, 11, 12 and "Constraints the spec names".

- A merged migration is never edited. A change is a new migration.
- Every relation has a foreign key; every foreign key and filter column has an index; statuses and kinds are PostgreSQL enums; amounts and stock have CHECKs.
- Money is `bigint`; quantities are `numeric(14,3)`; timestamps are `timestamptz` in UTC.
- No table gets a delete path except drafts that were never submitted. Stock movements, money entries and events get no update path either.
- Each constraint has a database test that tries the forbidden write directly.
- Dropping a column or a table is a **Look first** decision: only when a requirement or a decision changed, with the reason named, and as a new migration.
- PostgreSQL locks the row an UPDATE changes before its BEFORE ROW triggers run: a lock of a shared parent row taken inside such a trigger comes after the row lock, and two updaters of two rows deadlock there. Take the shared lock before the write (the action wrapper's lock step) or as an advisory lock in the commit check, never in a before-row trigger (from sodiq-platform, build of its task 3.4b; D46).
- A row that waives a claim or a check is honoured only while every condition that justified it still holds: read each time the claim is computed, and recomputed by a write of any table those conditions read (from sodiq-platform, review of its task 5.1b; D46).
- A rule between a child row and a column of its parent, checked on the child's insert and on the parent's update, is checked again after the parent row is locked, in a statement of its own: a trigger that read the parent before the parent's update committed passes on the old value (from sodiq-platform, review of its task 5.1b; D46).
- A trigger path that waives checks for one kind of write holds the row at the commit to exactly what justified the waiver, keyed on that write's own event, never on "a write of that kind happened in this transaction" (from sodiq-platform, review of its task 3.5c; D46).
- A migration that changes how rows are written handles every shape the earlier code wrote, emptied rows included, and its test writes the rows the way that code did (from sodiq-platform, review of its task 3.5c; D46).
