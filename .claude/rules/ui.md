---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**"
  - "src/features/**/components/**"
  - "src/i18n/**"
---

# Screens and texts

Read first, under `docs/spec/`: `11-screens-and-ux.md` (the whole file); `10-notifications-analytics-reports.md` (Home page per role).

- No text in a screen: every label is a key in `uz.json`, `ru.json` and `en.json`, added in the same task.
- Money, dates, time and quantities go through the shared formatters: `1 250 000 so'm`, `08.10.2026`, 24-hour Tashkent time.
- A screen never calculates a total or decides a permission. It shows what the domain and the server return.
- A page a role cannot use is absent from the menu, not greyed out. Hiding it is not the protection; the server check is.
- Every screen works at 375 px and 1440 px, with the keyboard, with 44 px touch targets, and with skeleton placeholders instead of a full-page spinner.
- Irreversible actions ask for confirmation and state the result. A colour label always carries an icon, a word and the amount.
