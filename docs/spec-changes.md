# Spec changes

Every change to `docs/spec/` after the baseline, newest on top. Only `/spec-change` writes here.

Baseline: 10 October 2026, document revision 123.

| Date | Files | What changed | Why | Affected tasks |
| --- | --- | --- | --- | --- |
| 12.10.2026 | `14-data-model.md` | The first paragraph says in plain words that every table has `created_at`, and that a table with its own key has no `id`. | Answered in the plan review of task 0.2 (answer 5): the exception "unless a different key is shown" is about the key only. | None: task 0.2 is built this way (constraint style 2 and 3 in `docs/decisions.md`). |
| 12.10.2026 | `18-hosting-and-costs.md` | The running cost is $25 a month, not $42: the test copy ($17 a month) runs only from task 0.15 until go-live, is switched off after go-live, and can be switched on again for a period when the app is changed later. | Owner: "The owner chose the $25 setup for the real app. The test copy ($17 a month) runs only while the app is being built". D15 wrongly said the owner chose $42. | 9.6 |
