---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/features/**/components/**"
  - "src/i18n/**"
---

# Screens and texts

Read first, under `docs/spec/`: `11-screens-and-ux.md` (the whole file); `10-notifications-analytics-reports.md` (Home page per role). Then `docs/design-system.md` before building or changing any screen or PDF: its tokens, sizes and parts, and its list "What we never do" (D23).

- No text in a screen: every label is a key in `uz.json`, `ru.json` and `en.json`, added in the same task.
- Money, dates, time and quantities go through the shared formatters: `1 250 000 so'm`, `08.10.2026`, 24-hour Tashkent time.
- A screen never calculates a total or decides a permission. It shows what the domain and the server return.
- A page a role cannot use is absent from the menu, not greyed out. Hiding it is not the protection; the server check is.
- Every screen works at 375 px and 1440 px, with the keyboard, with 44 px touch targets on phones, and with skeleton placeholders instead of a full-page spinner.
- Irreversible actions ask for confirmation and state the result. A colour label always carries an icon, a word and the amount.
- Whatever a screen holds while a call runs (a held save queue, a pending flag, an open dialog) is released in a `finally`, so a dropped connection never leaves a row waiting for ever. (Spec review of 2.5b.)
- A refusal that only the server would give is not offered: a button that every chosen row would refuse is not shown (read the rights the page computed for each row). (Spec review of 2.5b.)
- A callback a child puts in an effect's dependencies is stable: never a function made anew on every render (a factory such as `typedOf(name)` returns the same function each time). Otherwise the effect runs on every render and can loop. (Build of 2.6.)
- A write retried after a lost answer may count as saved from a reread only when the reread version is the one its own write made (`sent + 1`) and the row holds what was sent; a newer version is someone else's write and takes the stale path. (Permission review of 2.6.)
