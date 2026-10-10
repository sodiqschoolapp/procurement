# Edge cases: System

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

From spec chapter 12, which says: "These 41 situations are the ones most likely to cause trouble; each has a fixed answer, and each becomes a test." This file holds 2 of them.

| Situation | What the system does |
| --- | --- |
| The session ends in the middle of a form | The draft is already saved. After login the user returns to the same page. |
| A phone photo is very large | It is shrunk in the browser before upload. |
