# Spec changes

Every change to `docs/spec/` after the baseline, newest on top. Only `/spec-change` writes here.

Baseline: 10 October 2026, document revision 123.

| Date | Files | What changed | Why | Affected tasks |
| --- | --- | --- | --- | --- |
| 12.10.2026 | `11-screens-and-ux.md`, `13-technology.md`, `14-data-model.md`, `17-later-ideas.md` | The look is the Sodiq School design system shared with the academic platform (`docs/design-system.md`): brand navy and orange, Golos Text, Material Symbols Rounded icons, light and dark themes, the logo built in; the three labels are green, amber and red; touch targets of 44 px on phones; the settings keys `logo_file_id` and `accent_color` are gone; one sign-in with the academic platform is a later idea. | Owner: "Design codes of both platforms should be exactly the same." "We will merge the platforms after both are live. We just join the logins." | 0.10, 1.1, 8.3 |
| 12.10.2026 | `14-data-model.md` | The first paragraph says in plain words that every table has `created_at`, and that a table with its own key has no `id`. | Answered in the plan review of task 0.2 (answer 5): the exception "unless a different key is shown" is about the key only. | None: task 0.2 is built this way (constraint style 2 and 3 in `docs/decisions.md`). |
| 12.10.2026 | `18-hosting-and-costs.md` | The running cost once the app is live is $25 a month, not $42: while the app is being built, from task 0.15, only the test copy runs ($17 a month); both run together ($42 a month) only for the short time between setting up the real app (task 9.4) and switching the test copy off after go-live; it can be switched on again for a period when the app is changed later. | Owner: "The owner chose the $25 setup for the real app. The test copy ($17 a month) runs only while the app is being built". D15 wrongly said the owner chose $42. | 9.6 |
