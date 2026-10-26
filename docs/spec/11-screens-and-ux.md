# Screens and UX rules

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The app has 16 screens. Each one shows only what the logged-in role may see and only the buttons that work right now.

## Screens

| Screen | Address | Who |
| --- | --- | --- |
| Login | `/login` | All |
| Home ("My tasks") | `/` | All |
| Order list, with the order sheet | `/orders` | All; the order sheet for Manager and Head |
| Order page | `/orders/[id]` | All |
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
| Manager | Home, Orders, Warehouse, Analytics, Reports | Doing the work. Home has three large buttons: New order, Record purchase, Issue from stock. Buying and issuing have phone layouts. |
| Head | Home, Orders, Warehouse, Money, Analytics, Reports, Admin | Control. Home lists every decision waiting across all branches. "Admin" groups catalogs, prices, users, branches and settings, so the daily menu stays short. |
| Principal | Home, Orders, Stock, Analytics, Reports | Approving. Home shows waiting group rows as large cards with total, urgent label and price hints. Ticking all and approving, sending back or rejecting takes two taps on a phone. No editing screens at all. |
| Finance | Home, Orders, Money, Stock, Analytics, Reports | Money. Home lists approvals and settlements with the exact amount to give or receive. Each one opens the order list filtered to those orders, ready to tick. |

A page a role cannot use is not shown greyed out; it is simply absent from the menu.

## Order list layout

1. **Top:** the filters (section 5) and the buttons Download Excel and Download PDF.
2. **Rows:** one group row per product subtype and status (section 5, Group rows), opening to its orders; a tick box on every group row and every order.
3. **Order sheet,** for the Manager and the Head: their drafts and the orders sent back or taken back to them, edited like a spreadsheet (rule 2), with one Submit (section 5, Drafts 4). A row shows six cells: product (the subtype picked in the same search; Product or Service, stock and measure shown under it), department, quantity with its measure, price, needed-by date and total; a user with several branches also sees the branch first. The other fields (brand, extra costs, payment type, priority, comment, requester, reference photo) open under "More" on the row. (Owner's decision of 25 October 2026.)
4. **Action bar,** fixed at the bottom when something is ticked: the count and totals of the ticked orders, and only the actions this user can take on all of them now.

## Order page layout

1. **Top:** order number and revision, status label, branch, owner, department, product and subtype, and one line saying who acts next and since when, for example "Waiting for Principal (Otabek N.) since 10.10.2026".
2. **Plan and actual,** one block: the planned total while nothing is bought; once something counted is bought, the plan beside the actual quantity, price and extra costs with what each did to the total, and the three colour labels. Nothing in it is shown twice.
3. **Tabs:** Details, Purchases, Money, History. Details leaves out fields that are empty. History starts with the steps Draft, Head, Principal, Finance, Open, Closed, with the name and time of each finished step; on an order that skipped Finance (section 6) the Finance step reads "Skipped". An order that skipped Finance has no Money tab.
4. **Action bar,** under the header and kept in view: the main next action this user can take as one button, and the user's other actions now under "More". If there are none, the top line already says who the order is waiting for.
(Owner's decision of 25 October 2026: a simpler order page.)

## Rules for a smooth feel

1. **Navigation.** A sidebar on desktop and a bottom tab bar on phones. Users with several branches get a branch switcher on top; the default is "All my branches".
2. **The order sheet like a spreadsheet.** Tab and Enter move between cells, and Enter on the last row adds a draft. Typing in the product cell opens the search with photo, name, category and stock; when nothing matches, its last line adds the product or subtype (`04-catalogs.md` rule 8). The total of the sheet stays visible (of the ticked drafts when some are ticked). On a phone each draft becomes a card with the same six fields and "More".
3. **Buying on a phone.** The purchase form is built for one hand: one order or group row at a time, large buttons, "Same as planned", and the camera for the receipt.
4. **Instant feedback.** Every button shows a loading state at once. Success shows a short message. Errors say in plain words what happened and what to do next.
5. **No blank waiting.** Pages show grey placeholders in the shape of the content while loading, never a full-page spinner.
6. **Safe actions.** Irreversible actions (submit, approve, reject, close, write-off) ask for confirmation, say how many orders they cover, and state the result. Leaving a form with unsaved changes asks first.
7. **Bad internet.** A form keeps what was typed when the connection drops and retries. A repeated save never creates a duplicate.
8. **Lists.** 25 rows per page, loaded from the server. Filters and sorting stay in the address, so a link reopens the same view.
9. **Search.** Ctrl+K or Cmd+K opens a search for order numbers, products and suppliers.
10. **Formats.** Money as `1 250 000 so'm`. Dates as `08.10.2026`. Time in 24 hours, Tashkent. Quantities without trailing zeros.
11. **Colours.** Status labels look the same everywhere: a dot and the word. Blue for the approval and buying flow, red for sent back and rejected, green for closed, grey for draft and cancelled; amber is kept for the three labels and alerts; the brand orange is a small highlight (active tab, active menu item, the one thing that needs you now) and is never a status colour.
12. **Empty screens.** An empty list explains what belongs there and offers the button to create it; on a home page an empty list is left out, and when every list is empty one line says nothing needs the person now.
13. **Access for everyone.** Everything works with the keyboard, text contrast meets WCAG AA, and touch targets are at least 44 px on phones.
14. **Languages.** Every label comes from translation files for Uzbek, Russian and English. No text is written directly in a screen.
15. **Look.** A clean, neutral look of this app's own that keeps the school's brand, written in `docs/design-system.md`: white and light grey surfaces, the school's navy for text and main actions, the school's orange as a small highlight, other colour used only for meaning (status, over or under plan, warnings), the Golos Text font and the school's logo built in. Light and dark themes; the theme follows the device until the user chooses one.
