# Screens and UX rules

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The app has 17 screens. Each one shows only what the logged-in role may see and only the buttons that work right now.

## Screens

| Screen | Address | Who |
| --- | --- | --- |
| Login | `/login` | All |
| Home ("My tasks") | `/` | All |
| Requests list | `/requests` | All |
| Request editor | `/requests/new`, `/requests/[id]/edit` | Manager, Head |
| Request page | `/requests/[id]` | All |
| Stock on hand | `/warehouse/stock` | All |
| Item card | `/warehouse/items/[id]` | All |
| Warehouse documents | `/warehouse/documents` | All |
| New issue, return, transfer, write-off | `/warehouse/documents/new?type=` | Manager, Head |
| Stock counts | `/warehouse/counts` | Manager, Head |
| Money with managers | `/money` | Finance, Head |
| Reports | `/reports` | All |
| Catalogs | `/catalog/...` | Head |
| Users and branches | `/users`, `/branches` | Head |
| Settings | `/settings` | Head |
| Notifications, profile | `/notifications`, `/profile` | All |
| Analytics | `/analytics` | All, each role sees its own page |

## Interface per role

Each role gets a short menu and a home page shaped around its main job, so nobody has to look past pages they never use.

| Role | Menu, in order | Built around |
| --- | --- | --- |
| Manager | Home, Requests, Warehouse, Analytics, Reports | Doing the work. Home has three large buttons: New request, Record purchase, Issue from stock. Buying and issuing have phone layouts. |
| Head | Home, Requests, Warehouse, Money, Analytics, Reports, Admin | Control. Home lists every decision waiting across all branches. "Admin" groups catalogs, prices, users, branches and settings, so the daily menu stays short. |
| Principal | Home, Requests, Stock, Analytics, Reports | Approving. Home shows waiting requests as large cards with total, urgent label and price hints. Approve, send back or reject takes two taps on a phone. No editing screens at all. |
| Finance | Home, Requests, Money, Stock, Analytics, Reports | Money. Home lists approvals and settlements with the exact amount to give or receive. Each item opens straight on the request's Money tab. |

A page a role cannot use is not shown greyed out; it is simply absent from the menu.

## Request page layout

1. **Top:** order number, status label, branch, owner, planned and actual totals, the three colour labels.
2. **Stepper:** Draft, Head, Principal, Finance, Open, Closed, with the name and time of each finished step.
3. **Tabs:** Items, Purchases, Money, History.
4. **Action bar,** fixed at the bottom: only the actions this user can take now. If there are none, a line says who the request is waiting for. Download PDF is available at every status.

## Rules for a smooth feel

1. **Navigation.** A sidebar on desktop and a bottom tab bar on phones. Users with several branches get a branch switcher on top; the default is "All my branches".
2. **Editor like a spreadsheet.** Tab and Enter move between cells, and Enter on the last row adds a row. Typing in the product cell opens the search with photo, name, category and stock. The totals footer stays visible. On a phone each line becomes a card.
3. **Buying on a phone.** The purchase form is built for one hand: one line at a time, large buttons, "Same as planned", and the camera for the receipt.
4. **Instant feedback.** Every button shows a loading state at once. Success shows a short message. Errors say in plain words what happened and what to do next.
5. **No blank waiting.** Pages show grey placeholders in the shape of the content while loading, never a full-page spinner.
6. **Safe actions.** Irreversible actions (submit, approve, reject, close, write-off) ask for confirmation and state the result. Leaving a form with unsaved changes asks first.
7. **Bad internet.** A form keeps what was typed when the connection drops and retries. A repeated save never creates a duplicate.
8. **Lists.** 25 rows per page, loaded from the server. Filters and sorting stay in the address, so a link reopens the same view.
9. **Search.** Ctrl+K or Cmd+K opens a search for request numbers, products and suppliers.
10. **Formats.** Money as `1 250 000 so'm`. Dates as `08.10.2026`. Time in 24 hours, Tashkent. Quantities without trailing zeros.
11. **Colours.** Status labels look the same everywhere. Green, orange and red are kept for the three labels and for alerts.
12. **Empty screens.** An empty list explains what belongs there and offers the button to create it.
13. **Access for everyone.** Everything works with the keyboard, text contrast meets WCAG AA, and touch targets are at least 44 px.
14. **Languages.** Every label comes from translation files for Uzbek, Russian and English. No text is written directly in a screen.
15. **Look.** Light theme, plenty of white space, one accent colour, rounded cards, the Inter font. The school's logo and accent colour are set in Settings.
