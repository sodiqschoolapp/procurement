# Catalogs

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Only the Head creates and edits catalogs; everyone else picks from them. One exception: a Manager adds products and subtypes while ordering (rule 8). "Categories" is my addition, for search and reports.

| Catalog | Fields | Notes |
| --- | --- | --- |
| Branches | Name, short code, address, active | The code is 2 to 4 Latin capital letters, unique, used in order numbers. It locks after the first order. |
| Measures | Name, short name, allows decimals | "kg" allows decimals, "pcs" does not. |
| Categories | Name | Stationery, cleaning, food, furniture, IT and so on. |
| Products and services | Name, type (product or service; product is the default), category, measure, photo, default brand or company, reference price, description, active | Type and measure lock after first use. |
| Subtypes | Product, name, own photo (optional), own reference price (optional), active | See the subtype rule below. |
| Extra cost types | Name | Delivery, loading, installation and so on. |
| Companies and brands | Name, kind (brand, supplier or both), tax ID, phone, note | One list serves both the "brand" on an order and the "supplier" on a purchase. |
| Departments | Branch, name, responsible person (name and phone) | The responsible person is plain text, not an app user. |
| Users | Full name, username, phone, role, branches, language, active | See section 3. |

## Rules

1. **Subtype rule.** Inside the database every product has at least one subtype. A product without subtypes gets one hidden subtype called "default". Orders and stock always point to a subtype, so there is one rule everywhere. When the first real subtype is added to a product that has none, from the catalog page or from an order (rule 8), whoever adds it also names the existing items: the hidden default takes that name and keeps its orders, stock and price, and the new subtype is a new one (owner's decision of 25 October 2026).
2. **Nothing used is deleted.** Entries are deactivated instead. Inactive entries leave the pickers but stay visible in old records. An inactive product or subtype can still be issued, written off and transferred up to the stock the branch holds, and returned by a department that received it; the stock pickers list it marked "inactive". It can no longer be ordered or bought.
3. **No duplicates.** Names are unique inside their catalog, ignoring capital letters and extra spaces. Subtype names are unique inside a product; department names inside a branch.
4. **Price memory.** Each subtype has one reference price, set by the Head. When a price changes, the Head adds the new price with a short note, and older prices stay in the price history. The system also saves every real purchase price. When recent purchases differ from the reference price by more than 20%, the Head sees a prompt to update it in one click. New prices for many products can be loaded at once from Excel.
5. **Minimum stock.** The Head, or a Manager for their own branches, can set a minimum level per subtype per branch. It drives the low-stock alert in section 9.
6. **Photos.** JPG, PNG, WebP or HEIC up to 10 MB. The system stores a small version (160 px) for lists and a large one (1200 px) for viewing.
7. **Excel import.** Products, subtypes, prices, departments and existing stock can be imported from an Excel template. The import shows a preview with errors per row and saves nothing unless every row is valid.
8. **Managers add products and subtypes.** A Manager whose right "Add products and subtypes" is on (section 3) adds a missing item from an order's product search, without leaving the order (owner's decision of 25 October 2026; this replaced product suggestions).
   - **A new product:** name, product or service, category and measure picked from their catalogs, and an optional photo. No reference price, brand or description; the Head adds them later if wanted.
   - **A new subtype of a product:** name and an optional photo. When the product has no subtypes yet, the Manager also names what its existing items are (for example "48 varaq" beside the new "96 varaq"): the hidden default subtype takes that name, so existing orders, stock and prices keep pointing at the same items.
   - Rule 3 holds: when the typed name already exists, the existing entry is offered instead; an inactive one is named, and only the Head can switch it on again.
   - The new entry can be ordered at once; nobody approves it. The Manager cannot edit or deactivate catalog entries, and cannot add measures, categories, companies or extra cost types.
   - The Head's home lists the products and subtypes added by Managers until the Head marks them checked; the Head fixes or deactivates them like any catalog entry.
   - Suggestions sent before 25 October 2026 are decided as before, and the Manager is notified either way; no new ones are sent.
9. **Change history.** Every catalog entry shows who changed what and when.
