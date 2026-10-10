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
- A test is never skipped, weakened or deleted to make a build pass. If a test is wrong, say so and ask.
- A bug fix starts with the test that fails.
