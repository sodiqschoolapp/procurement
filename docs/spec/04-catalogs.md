# Catalogs

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Only the Head creates and edits catalogs; everyone else picks from them. "Categories" is my addition, for search and reports.

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

1. **Subtype rule.** Inside the database every product has at least one subtype. A product without subtypes gets one hidden subtype called "default". Orders and stock always point to a subtype, so there is one rule everywhere.
2. **Nothing used is deleted.** Entries are deactivated instead. Inactive entries leave the pickers but stay visible in old records. An inactive product or subtype can still be issued, written off and transferred up to the stock the branch holds, and returned by a department that received it; the stock pickers list it marked "inactive". It can no longer be ordered or bought.
3. **No duplicates.** Names are unique inside their catalog, ignoring capital letters and extra spaces. Subtype names are unique inside a product; department names inside a branch.
4. **Price memory.** Each subtype has one reference price, set by the Head. When a price changes, the Head adds the new price with a short note, and older prices stay in the price history. The system also saves every real purchase price. When recent purchases differ from the reference price by more than 20%, the Head sees a prompt to update it in one click. New prices for many products can be loaded at once from Excel.
5. **Minimum stock.** The Head, or a Manager for their own branches, can set a minimum level per subtype per branch. It drives the low-stock alert in section 9.
6. **Photos.** JPG, PNG, WebP or HEIC up to 10 MB. The system stores a small version (160 px) for lists and a large one (1200 px) for viewing.
7. **Excel import.** Products, subtypes, prices, departments and existing stock can be imported from an Excel template. The import shows a preview with errors per row and saves nothing unless every row is valid.
8. **Suggest a product.** A Manager who needs something missing from the catalog sends a suggestion: name, measure, photo, note. The Head adds it (possibly edited) or declines with a reason. The Manager is notified either way.
9. **Change history.** Every catalog entry shows who changed what and when.
