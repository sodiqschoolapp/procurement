# Design system

The look of every screen of the procurement and warehouse app (`sodiqschoolapp/procurement`). This app's own text since 21.10.2026 (D60, which replaces D23): it no longer shares the sodiq-platform design system word for word. The brand comes from the Sodiq School brand guidelines: the navy, the orange and the logo.

The spec says what a screen must do; this file says how it looks. Where they differ, the spec wins and the difference is reported. Every screen is checked against this file by the builder before the report and by the reviewer on every pull request that changes a screen.

## Direction: calm, clean, obvious

The app is used every day by people who are not technical, half of them on a phone. A screen is calm when the eye goes first to what the person must do now, and everything else is quiet.

- **Neutral surfaces.** White panels with hairline borders on a very light cool grey page. No heavy shadows, no gradients, no large coloured areas.
- **Navy is the brand.** The school's navy (#06113C) is the text, the primary button and every active state.
- **Orange is a small highlight.** The school's orange (#FF8A32) marks what is current or what needs the person now: the active tab underline, the active menu marker, the one "needs you now" accent on a row. Never a large area, never text on a light background, never a status colour.
- **Colour means something.** Red for refused, sent back or over plan; amber for due soon, overdue or waiting on you; green for done, even or money left; blue for "in the approval or buying flow"; grey for neutral. Never colour alone: always a word or an icon with it.
- **Less text.** A page explains itself through its title and its content. Text stays only when it says why something is refused or disabled, warns about a money or stock consequence, or tells the person what to do next.
- **One next step.** Each screen leads with the one action that moves the work forward; other actions are secondary or quiet.

## Colour

The tokens keep the names of shadcn/ui and are written in `src/app/globals.css` in oklch (the exact conversion of the hex values below); `tests/contrast.test.ts` reads them there and checks the values and the contrast of every pair named under "Accessibility".

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | #F5F6F8 | #0A0F1E | The page. |
| `--foreground` | #06113C | #E8EBF3 | Text and headings: the school's navy in the light theme. |
| `--card`, `--popover` | #FFFFFF | #111831, popover #151D3A | Panels, tables, menus, dialogs. |
| `--primary` | #06113C | #E8ECF6 | The primary button and selected controls. |
| `--primary-foreground` | #FFFFFF | #06113C | Text on the primary button. |
| `--primary-hover` | #1B2754 | #CBD3E8 | Its hover and press. |
| `--secondary` | #FFFFFF | #172041 | The secondary button (with a `--border-strong` edge). |
| `--secondary-hover` | #F1F3F7 | #1F2A50 | Its hover. |
| `--muted` | #F8F9FB | #151C36 | Table headers, quiet fills inside a panel. |
| `--muted-foreground` | #5A6278 | #9AA3BC | Second lines, captions, column headers. |
| `--accent` | #F1F3F7 | #1A2343 | Hover of rows, quiet buttons and menu items. |
| `--border` | #E3E6EC | #232C4A | Hairlines: panel edges and dividers (decorative). |
| `--border-strong` | #D2D7E0 | #2E3858 | The edge of a secondary button, a chip, a checkbox. |
| `--input` | #868EA3 | #5E6990 | The border of fields and selects (3 : 1 on the page and on a panel). |
| `--ring` | #06113C | #FF8A32 | Focus: 2 px outline, 2 px offset. Navy in the light theme, because orange on white is 2.35 : 1; orange in the dark theme. |
| `--brand` | #FF8A32 | #FF8A32 | The orange highlight: active tab underline, active menu marker, the "needs you now" accent. Fills and lines only. |
| `--brand-foreground` | #06113C | #06113C | Text on an orange fill (7.75 : 1). |
| `--destructive`, `--destructive-bg` | #B42318 on #FEF1F0 | #FF8F85 on #372B3E | Refused, sent back, over plan, danger buttons. |
| `--warning`, `--warning-bg` | #8A4B00 on #FFF5DB | #FFD27A on #37363D | Overdue, due soon, waiting on you, money left. Amber, never the brand orange. |
| `--success`, `--success-bg` | #13703A on #EBF7EF | #6FD08C on #203540 | Done, even, saved. |
| `--info`, `--info-bg` | #2348A8 on #EEF3FD | #9DBBFF on #273252 | In approval, open, in settlement; notices. |
| `--today`, `--today-muted` | #FFF6EE, #5A6278 | #2E2631, #C9C2C4 | A row or item that needs the person now (an orange tint). |
| `--topbar` | #FFFFFF | #111831 | The top bar. |
| `--link` | #06113C | #E8EBF3 | Plain links: weight 500, underlined on hover. |
| `--sidebar` | #FFFFFF | #0D1328 | The menu. |
| `--sidebar-foreground` | #3D4560 | #B7BFD4 | Menu items at rest. |
| `--sidebar-primary`, `--sidebar-primary-foreground` | #EDF0F7, #06113C | #1C2547, #FFFFFF | The active menu item: a light navy tint and navy text. |
| `--sidebar-accent`, `--sidebar-accent-foreground` | #F1F3F7, #06113C | #161E38, #FFFFFF | Menu hover. |
| `--sidebar-border` | #E3E6EC | #1E2642 | The menu's hairline edge. |
| `--sidebar-ring` | #06113C | #FF8A32 | Focus inside the menu. |
| `--sidebar-avatar` | #06113C | #2A3561 | The round avatar behind white initials. |
| `--chart-1` … `--chart-5` | #34498A, #7C8DBF, #B9C3DE, #5A6278, #C9CED9 | #8EA2DA, #5D6FA6, #3A4877, #9AA3BC, #2E3858 | Chart marks: one navy-blue series; the others for a second series or a total. |

The dark tints of danger, warning, success and info are the colour at 16% over the dark card, composited in sRGB; `--today` dark is the orange at 12% over the card.

The theme follows the device by default; the person can choose light or dark on Profile or on the sign-in page, and the choice is kept in the browser.

## Type

**Golos Text** only (ParaType, SIL Open Font License), served from the app's own files. It covers Latin and Cyrillic. It has no U+02BB (the Uzbek oʻ and gʻ), so the app adds one face of the same family, limited to U+02BB, from the PDF fonts in `src/features/orders/download/fonts/`, where U+02BB is mapped to the turned comma; the browser test checks every letter of "Oʻgʻil, Ўзбекистон, Қашқадарё, Ғулом, Ҳамид" comes from the app's own files at 400, 500 and 600.

Every number and amount is set with `tabular-nums` (not the whole page: Golos Text's tabular figures widen the hyphen of "CHL-26-0142"), and amounts in tables are right-aligned.

| Style | Class | Size / line | Weight | Use |
| --- | --- | --- | --- | --- |
| Title | `text-title` | 24 / 32 (22 / 28 on phones), −0.015em | 600 | The page title, one per page |
| Heading | `text-heading` | 18 / 26 | 600 | A section of a page |
| Subheading | `text-subheading` | 15 / 22 | 600 | Panel titles, card titles |
| Body | `text-sm` | 14 / 20 | 400 | Text, table cells, fields, buttons |
| Small | `text-small` | 13 / 18 | 400 | Secondary lines in dense rows |
| Caption | `text-xs` | 12 / 16 | 400–500 | Column headers, field hints, chip words |
| Figure | `text-figure` | 22 / 28 | 600 | A number in the summary strip or a total |

Weights in use: 400, 500 (links, menu items, labels of fields) and 600 (titles, buttons, the figure of an amount). No 700.

## Spacing, corners, elevation

- One spacing scale in steps of 4: 4, 8, 12, 16, 20, 24, 32, 48.
- **Content width.** Every page sits in one column of at most 1280 px, centred, with 16 px sides on a phone, 24 on a tablet and 32 on a desktop; the page starts 24 px (phone 16 px) under the top bar. A form keeps its fields in a readable grid inside that column; it does not shrink the column.
- **Corners.** 6 for every control (buttons, fields, selects, chips, menu items, labels), 8 for panels, cards and dialogs, round for avatars and status dots.
- **Elevation.** Panels have a 1 px `--border` edge and no shadow. Only floating things have a shadow: menus, popovers, dialogs, toasts and the selection bar, `0 8px 24px -8px` of navy at 20% (`shadow-float`).

## Icons

- **Material Symbols Rounded**, weight 400, drawn from SVG paths (never a font ligature). **Outlined** at rest; **filled** only for the active menu item.
- 20 px in menus, buttons and fields; 16 px inline with small text; 24 px in the phone tab bar.
- An icon stands next to its word. An icon alone is a button with an `aria-label`, or decoration with `aria-hidden`.
- Common actions: `search`, `notifications`, `download`, `print`, `add`, `edit`, `close`, `expand_more`, `chevron_left`, `chevron_right`, `arrow_back`, `check_circle`, `warning`, `error`, `info`, `inventory_2`, `logout`, `dark_mode`, `light_mode`, `language`, `tune`, `filter_list`.

## Parts

### Page shell

- **Sidebar** (from 640 px): white (dark `--sidebar`), 240 wide, a hairline right edge. At the top the school's colour logo (on-dark in the dark theme), 56 high; then the role's items: icon and word, 36 high, corner 6, `--sidebar-foreground`. The **active item** has `--sidebar-primary` behind it, navy text, its icon filled, and a small orange marker: a 3 × 16 px rounded bar at the item's left edge. At the bottom the person (avatar, name, role) and the sign-out icon button. It collapses to a 64-wide rail of icons with the shield; the choice is kept in the browser. In the rail the active item is its filled icon on the tint, with the same orange marker.
- **Top bar:** white, 56 high, a hairline bottom edge: the branch context on the left, the search field ("Ctrl K" as quiet text) and the bell on the right; on a phone the search is a button and the avatar opens Profile.
- **Phone tab bar** (below 640 px): white, a hairline top edge, the role's menu (the first four and "More" when there are more than five), icon above word, every target at least 44 px. The active tab has navy text, its icon filled and the orange marker above the icon (16 × 3 px).
- **Page header:** a back link on inner pages ("← Orders"), then the title, and on the same line at the right the page's actions. A short fact may follow the title in `--muted-foreground` ("12 orders"). No sentence under a title.

### Panels and lists

- **Panel:** `--card`, 1 px `--border`, corner 8. A panel title is `text-subheading` with 16 px (phone) or 20 px (desktop) padding; the content keeps the same side padding.
- **Table:** in a panel; header row 40 high on `--muted`, `text-xs` medium `--muted-foreground` words in sentence case; rows at least 48 high with hairline dividers and `--accent` on hover; numbers and amounts right-aligned. Below 640 px a list of more than three columns becomes **cards** (one per row: the name and status on top, two or three facts, the row's action at the bottom), never a table that scrolls sideways.
- **Tabs:** words in a row over a hairline; the current tab is navy with a 2 px orange underline, the others `--muted-foreground`. A count follows the word as a plain number. On a phone the row scrolls sideways inside itself.
- **Summary strip:** at the top of a list, three or four figures the person acts on (needs action, to buy, cash in hand, due this week), each a caption over a `text-figure` value, side by side in one panel divided by hairlines (two by two on a phone). Each figure that has a list behind it is a link to that list. Built only from figures the app already shows.
- **Filter bar:** a search field, two or three key filters, and a secondary "More filters" button with the count of active ones that opens the rest. Each active filter shows below as a removable chip (word, value, ✕), and "Clear all" ends the row.
- **Selection bar:** when rows are ticked, a bar floats at the bottom of the page (above the phone tab bar): the count and the total in `text-subheading`, the actions this person can take on all of them now, and a quiet "Clear". `--card`, a hairline edge, the floating shadow, corner 8.
- **Empty state:** inside the panel, centred: an outlined icon in `--muted-foreground`, a `text-subheading` title that says what belongs there, at most one short line, and the button that creates it when the person can. When a whole home page has nothing to do, one calm empty state replaces all its sections.

### Status and outcome

- **Status:** a coloured dot (8 px) and the status word, in the foreground colour. Blue (`--info`): waiting for Head, Principal or Finance, Open, waiting for settlement. Red: sent back, rejected. Green: closed. Grey: draft, cancelled. One status per row. A document status uses the same dots.
- **Flags** beside the status, word and icon in their colour: Urgent (red, `warning`), Overdue (amber, `schedule`).
- **Outcome** of a row: one phrase that says how the money ended, from the Total label: "Over by 15 000 so'm" (red, `error`), "Left 50 000 so'm" (amber, `warning`), "Even" (green, `check_circle`), "In progress" (grey, `schedule`). Number and Price follow as small words only when they are orange or red ("Bought less", "Dearer").
- **The three colour labels** (08 The three colours), in full on the order page and in the selection bar: a light tint of their colour, corner 6, 24 high, the icon, the word and the amount.

### Buttons

| Size | Height (desktop / phone) | Padding | Text |
| --- | --- | --- | --- |
| `sm` | 32 / 44 | 0 12 | 13 / 500 |
| `default` | 36 / 44 | 0 14 | 14 / 500 |
| `lg` | 44 / 48 | 0 20 | 15 / 600 |

| Kind | Look |
| --- | --- |
| `default` (primary) | `--primary` fill, `--primary-foreground` text. One per area. |
| `secondary` | `--secondary` fill, a 1 px `--border-strong` edge, foreground text. |
| `ghost` (quiet) | No fill; `--accent` on hover. |
| `destructive` | No fill, `--destructive` text; `--destructive-bg` on hover. |

- A button that cannot be pressed now says why, on a line next to or under it (`text-xs`, `--muted-foreground`, with the `info` icon): "Write a comment to save". It is never greyed out without a reason.
- An icon-only button is square (36, 44 on a phone) and has an `aria-label`.
- A link styled as a button uses the same classes. Plain links are `--link`, weight 500, underlined on hover.

### Fields

- Fields and selects: 36 high (44 on a phone, 44 on sign-in), `--card` fill, 1 px `--input` border, corner 6; focus is the 2 px ring. An error is a `--destructive` border and one line under the field.
- A label sits above its field (`text-sm` 500). A hint, only when it prevents a mistake, sits under the field in `text-xs`.
- **Dates** are shown and typed as dd.mm.yyyy everywhere, never the browser's own date format.
- A **segmented control** (two to four short choices): a `--muted` track with a hairline edge, the chosen item `--card` with navy text and a hairline edge; when the words do not fit on one line the choices stack, one per line, so no word is ever cut or overlapped.
- Checkboxes and radios use `--primary` when chosen.

## Motion

Short and quiet: 120 ms for hover and press, 160 ms for menus and dialogs opening, ease-out; nothing moves on its own. People who ask the system for reduced motion get none.

## Accessibility

Text 4.5 : 1 and controls 3 : 1 in both themes (checked by `tests/contrast.test.ts`), full keyboard use with a visible focus ring, text that can be enlarged to 200%, touch targets of 44 px on phones, and no information by colour alone.

## This app

- **Files.** Tokens and type utilities in `src/app/globals.css`; the contrast test is `tests/contrast.test.ts`; the button is `src/components/ui/button.tsx`; the page parts (page header, panel, tabs, summary strip, empty state) are in `src/components/`; the logo files are in `public/brand/`; icons are generated into `src/components/icon-paths.ts` by `npm run icons`.
- **Menu icons.** Home `home`, Orders `receipt_long`, Warehouse and Stock `inventory`, Money `payments`, Analytics `bar_chart`, Reports `description`, Admin `tune`, Notifications `notifications`, Profile `person`.
- **Sign-in.** The form on a white panel with the colour logo, the language select and the theme button; on a desktop a quiet panel beside it with the shield, the school's slogan in navy and a short orange line. No "Forgot your password?" link: the Head renews passwords (`02-assumptions.md`, A8).
- **Home.** What the person must do now comes first, each item with its action; sections with nothing in them are hidden; when everything is empty, one calm empty state. The Manager's three main actions (New order, Record purchase, Issue from stock) are large buttons, New order primary.
- **Printouts and PDFs.** Unchanged by this file: A4, the letterhead strip (a navy tab with the on-dark logo, an orange band), Golos Text, navy text; the grey word on Draft, Rejected and Cancelled stays as the spec asks.

## Logo

| File | Use |
| --- | --- |
| `sodiq-logo-horizontal.svg`, `sodiq-logo-horizontal-on-dark.svg` | One line: the sidebar (colour, on-dark in the dark theme), sign-in, the PDF letterhead (on-dark) |
| `sodiq-logo.svg`, `sodiq-logo-on-dark.svg` | Stacked logo |
| `sodiq-mark.svg`, `sodiq-mark-on-dark.svg` | The shield alone: collapsed menu, the sign-in panel, the browser tab |
| `favicon.ico`, `icon-*.png` | Browser and home-screen icons |

The brand book's rules: keep clear space around the logo; never recolour, stretch, rotate, outline, shadow or blur it; never place it on a busy or orange background; the on-dark version goes on a dark background. Its smallest height is 24 px on screen (the shield alone below that).
