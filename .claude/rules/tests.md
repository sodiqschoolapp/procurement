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
- Each wall a query keeps in its SQL (the branch wall, the draft wall) has a test of its own, beyond the matrix's one status: a numbered Draft is the case the matrix misses. (Permission review of 2.10.)
- Notices whose recipients are worked out per branch are tested with orders of two branches in one action, for every recipient list (owners, Heads, a branch's role). (Permission review of 2.10.)
- A fixture step a test depends on (an action that sets the scene) asserts its own success, so a broken fixture never reads as the expected refusal (D38). (Spec review of 2.10.)
