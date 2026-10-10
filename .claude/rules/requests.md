---
paths:
  - "src/features/requests/**"
---

# Requests and approval

Read first, under `docs/spec/`: `05-order-request-form.md`; `06-approval-workflow.md`; `edge-cases/requests-and-approval.md`.

- The buttons a user sees come from the state machine, and the server asks it again before acting.
- The order number is made inside the submit transaction with a lock on the counter row. It never changes and is never reused.
- Once a request is Open its planned lines never change.
- Approvers change no field, except that Finance may change a line's payment type while approving.
- Every move writes a history event with user, time and comment. Send back, reject, cancel and reopen need a reason of at least 5 characters.
