# Assumptions (all confirmed)

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The chapter keeps its original heading text. All fourteen points are confirmed and are standing decisions.

These fourteen points were not in your description, so I chose a default for each. Change any of them before the build starts; each one is cheap to change now and expensive later. All fourteen were confirmed on 10 October 2026; A7, A8 and A11 were confirmed with the changes shown here.

| # | Topic | Default in this spec |
| --- | --- | --- |
| A1 | Currency | Only so'm (UZS), whole numbers, no tiyin, no second currency. |
| A2 | Languages | Uzbek (Latin), Russian and English. Each user picks one; Uzbek is the default. Catalog names are typed once, in one language. |
| A3 | Roles per person | One account has exactly one role. |
| A4 | After "send back to edit" | The corrected order starts approval again from the Head. |
| A5 | Absent approver | The Head cannot approve in place of the Principal or Finance. If a Finance user is away, the Head adds a second Finance user to the branch. If the Principal is away, the Head hands the branch to an acting Principal. The Head can switch the Principal step or the Finance step off for the whole school (section 6, "Principal step switched off", "Finance step switched off"). |
| A6 | Departments | Each department belongs to one branch. |
| A7 | Services | Every catalog item is a product or a service; product is the default. Services (repair, delivery, printing) never enter the warehouse. When the Manager records the actual price and number, a service counts as used. |
| A8 | Login | Username and password. The Head creates each account and its password, and can renew any user's password at any time; users cannot change their own. A Head's password can also be renewed from a command in the hosting console (03 rule 4). When creating or renewing, the Head types a password or has one generated. A renewal signs that user out on every device at once. There are no password rules, and no change is forced at first sign-in. A session lasts 24 hours after sign-in, on any device. No self-registration and no email. |
| A9 | Order numbers | Each order has its own number, counted per branch and restarting every calendar year. |
| A10 | Big overspend | If an order's real total is more than 10% and more than 100 000 so'm above its approved total, the Head must acknowledge it before Finance can close. Both numbers are settings (changed on 15 October 2026: the amount was added when requests became orders). |
| A11 | Corporate card | Leftover money stays on the card, or the Manager sends it back from the card to Finance and Finance records that. The app does not track the card's balance. |
| A12 | Hosting | App and database on DigitalOcean in Frankfurt, files on Cloudflare R2. Costs are in section 18. |
| A13 | Manager rights | The switches in section 3 apply to a Manager in all of their branches, not branch by branch. |
| A14 | Prices | One reference price per product subtype for the whole school, not a separate price per branch. |
