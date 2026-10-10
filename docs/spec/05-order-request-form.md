# Order request form

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

A request has a short header and any number of lines; all 16 fields you listed are here, plus created by, priority, note and payment type.

## Header

| Field | How it is filled | Rule |
| --- | --- | --- |
| Branch | Picked; prefilled when the Manager has one branch | Required. Locked once the request has lines. |
| Date | Automatic: the day the request was created | The submit date and time are saved separately. |
| Order number | Automatic at first submit | See "Order number" below. |
| Created by | Automatic: the logged-in user | This user is the owner. |
| Priority | Normal or Urgent | Urgent needs a short reason and is pinned on top for approvers. |
| Note | Free text | Optional, up to 1000 characters. |

## Line

| # | Field | How it is filled | Rule |
| --- | --- | --- | --- |
| 1 | Product or service | Picked from the catalog; search by name, shows photo and category. A Type column beside it shows Product or Service, filled from the catalog | Required. |
| 2 | Subtype | Picked from the product's subtypes | Required when the product has subtypes. |
| 3 | In stock ("how many left") | Automatic: current stock of this branch | Read-only. A copy is saved at submit. Services show a dash. |
| 4 | Photo | Automatic from the catalog: subtype photo, else product photo | The Manager may attach one extra reference photo. |
| 5 | Brand or company | Picked; prefilled from the product | Optional. |
| 6 | Requested by | Department picked from this branch; shows its responsible person | Required. An optional text field names a specific person. |
| 7 | Needed by | Date | Required. Not in the past at submit. One click applies a date to all lines. |
| 8 | Measure | Automatic from the product | Read-only. |
| 9 | Quantity | Typed | More than 0. Up to 3 decimals, only when the measure allows decimals. |
| 10 | Price per unit | Suggested: the reference price set by the Head, else the last purchase price, else empty | Editable. Whole so'm, more than 0. |
| 11 | Extra costs | Zero or more rows: type from the catalog plus amount | Each amount more than 0. The cell shows the sum. |
| 12 | Payment type | Cash, Bank transfer or Corporate card | Required. Default is Cash (a setting). Finance can change it at approval. |
| 13 | Comment | Free text | Optional, up to 500 characters. |
| 14 | Line total | Automatic | Quantity × price, rounded to whole so'm, plus extra costs. |

The footer shows the goods total, the extra-cost total, the grand total, and the grand total split by payment type.

## Order number

The format is branch code, two-digit year, four-digit counter: `CHL-26-0142`.

1. The number is given at the first submit. Drafts show the word "Draft", so deleted drafts leave no gaps.
2. The counter runs per branch per calendar year in Tashkent time and starts at 0001. After 9999 it simply grows to five digits.
3. A number never changes and is never reused. Rejected and cancelled requests keep theirs.
4. A request sent back and submitted again keeps its number and shows "rev 2", "rev 3" beside it.
5. The number is created inside the submit transaction with a lock on the counter row. Two people submitting at the same instant cannot get the same number.

## Checks at submit

- At least 1 line and at most 200.
- Every required field is filled, and no line uses a deactivated catalog entry.
- The same subtype for the same department appears only once. Two departments needing the same item get two lines.
- No needed-by date is in the past.
- Errors appear on the exact cell and in a short list on top; the screen scrolls to the first one.

## Helpers

- **Autosave.** A draft saves itself after each change and shows "Saved". The owner can delete a draft that was never submitted.
- **Price hint.** When the typed price differs from the reference price by more than 20% (a setting), a label such as "+35% vs catalog price" is shown to the Manager and to every approver.
- **Copy as new.** Any request, including a rejected one, can be copied into a new draft.
- **Print.** At any status the request can be downloaded as a formal PDF or printed. The layout is described under Formal PDF below.

## Formal PDF

At every status, from Draft to Closed, anyone who can see a request can press "Download PDF" and get an official document ready to print, sign and file. It is plain and formal: black text on white, no decoration.

| Part | Content |
| --- | --- |
| Page | A4 landscape, so all columns fit. Fonts are built into the file, so Uzbek and Russian letters print correctly on any computer. |
| Top | School name and logo, the title "Order request", order number and revision, branch, date, owner, and the status at the moment of download. |
| Lines table | Number, product, subtype, brand or company, requested by, needed by, measure, quantity, price, extra costs, payment type, total, comment. |
| Actual columns | From status Open onward the table adds actual quantity, actual price, actual extra costs, actual total and difference. |
| Totals | Goods, extra costs, grand total, and the split by payment type. After buying: planned total, actual total, difference. |
| Approval block | One row each for Head, Principal and Finance: full name, decision, date and time, and an empty line for a handwritten signature. A step not reached yet says "Waiting". |
| Every page | Order number, "Page 2 of 3", who downloaded it and when. A small QR code opens the request in the app, so a reader of the paper can check its live status. |
| Mark | Draft, Rejected and Cancelled requests carry that word in large grey letters across the page. |

1. The PDF is made on the server from the same data and the same calculation functions as the screen, so paper and screen can never disagree.
2. It uses the language of the user who downloads it.
3. The file name is the order number and revision: `CHL-26-0142_rev2.pdf`.
4. Product photos are left out to keep the document formal and small.
5. Warehouse issue notes and transfer notes use the same style, with "Given by" and "Received by" signature lines.
6. The browser's Print button on the request page stays available for a quick copy.
