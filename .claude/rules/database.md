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
- Dropping a column or a table needs the owner's yes first.
