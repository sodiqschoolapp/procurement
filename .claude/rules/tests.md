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
- A test of two writes at the same moment, whose held side is a transaction that does what its action does, is run once with the held write left out and seen to fail; a row that already decides the outcome before the write makes it unable to fail (from sodiq-platform, review of its task 3.4c; D46).
- Each branch of a function that gives rows back or chooses where they go is reached by a test of its own, with nothing earlier in the function deciding it; a test named for a branch asserts an outcome only that branch gives (from sodiq-platform, review of its task 3.2c; D46).
- When the held side of a same-moment test would have to imitate a server action that writes many tables, run both real actions in a fixed order instead: a third transaction holds a row the first action waits on, the second starts once the first waits, and the asserts follow from which committed first (from sodiq-platform, review of its task 3.2c; D46).
- A test of one line of an answer (a history event, a row) reads that line from the returned data by its kind and record, never by a text search over the whole answer: another line with the same date or id makes it unable to fail (from sodiq-platform, review of its task 3.3b; D46).
- A same-moment test asserts the one code each side gives, not "one of" two codes, with the version each side would really send; a refusal alone passes on a stale version and proves nothing (from sodiq-platform, review of its task 3.3c; D46).
- A test that one condition keeps a row out (a draft, a deactivated row, another branch) gives the row every other value that would let it in; otherwise another value keeps it out alone and the test passes with the condition removed (from sodiq-platform, review of its task 3.6a; D46).
- A value the task reads in a new way has a test at every reader of it (every query, report and role that reads it); a test of one reader does not cover another (from sodiq-platform, review of its task 3.6b-1; D46).
- A same-moment test of a deferred check makes the held side run its check first (`set constraints <name> immediate`), sees the other side wait in `pg_locks`, and asserts the code the waiting side gets; a held side whose check runs only at its own commit proves an order, not the lock the check takes (from sodiq-platform, review of its task 3.4b; D46).
- The two sides of a same-moment test of an advisory lock meet on no row and no index besides that lock (a unique index both insert into, a row both update): otherwise the second side waits there and the test passes with the lock removed (from sodiq-platform, review of its task 5.1a; D46).
- An action that takes the id of a child row from the browser (a record, a trip, a line) beside the orders it locks has a test that sends an own order with a real child id of another branch, given every other value that would let it through: "Not found", nothing written. A same-branch id of another order does not test the wall. (Permission review of 3.7.)
- Every new Analytics query and list is in the matrix three ways: with the branch filter, without it (the wall in the SQL, asserting its totals as well as its rows), and with a department or a Manager id of the branch and no branch filter. (Permission review of 6.6a.)
- A test that reads which Manager right guards a permission reads every right of the rule (`right` and `alsoRight`), from `PERMISSIONS` or the oracle alike: one that reads `right` alone states a pre-D66 rule for `catalog.add`. (Permission review of 1.12c.)
