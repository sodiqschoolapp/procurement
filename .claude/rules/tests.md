---
paths:
  - "tests/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
---

# Tests

Read first, under `docs/spec/`: `15-quality-and-acceptance.md` (the whole file).

- Each test names the spec file and rule it checks, in its title or a comment.
- Database tests run against a real PostgreSQL. Nothing about locks, constraints or transactions is mocked.
- Time is set through the injected clock. No test waits, and no test depends on today's date.
- Names, phones and ids are invented. No real person, school record or price list appears in a test or a seed.
- A test is never skipped, weakened or deleted to make a build pass. A test that is wrong because a requirement or a decision changed is fixed, the reason is named in the report, and the decision is marked **Look first** (`CLAUDE.md`, "Stop and wait for the owner").
- A bug fix starts with the test that fails.
