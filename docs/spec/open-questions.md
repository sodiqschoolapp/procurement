# Open questions

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The spec is silent on these, or says them two ways. The task that meets a question uses the owner's answer under "Decided ahead" in `docs/decisions.md` when there is one; otherwise it decides, marks the decision Look first on issue #9 and goes on. The owner's confirmed answer enters the spec through `/spec-change`, and the question is then struck here, not deleted.

Each line names the first build-plan task that needs the answer.

## Sign-in

1. ~~**Lost or leaked password.** A8 says the Head creates a password once and nobody changes it afterwards. What happens when a user forgets a password, or it becomes known to someone else? The spec gives no way out.~~ **Answered 10.10.2026:** the Head can renew any user's password at any time, typed or generated. Written into A8.
2. ~~**Password rules.** The spec gives no minimum length or required characters for the password the Head types.~~ **Answered 10.10.2026:** there are no password rules. Written into A8.

## Records and repository

3. **Append-only and the cancel fields.** Architecture rule 7 says money actions are never updated. The data model gives `money_actions` and `purchases` the columns `is_cancelled`, `cancel_reason`, and section 8 says a wrong action "is cancelled whole, with a reason". Is cancelling a change to those fields only, or a new row? Needed by task 3.2.
4. **Licence.** The spec names no licence and the owner answered "maybe". No `LICENSE` file exists until this is answered. Needed by nothing; ask before the repository is ever made public.

## Orders

5. **Take back and the order number.** The data model says `orders.number` is "empty while Draft". The allowed-moves table says an order taken back to Draft keeps its number. Which statement gives way? Needed by task 2.2.
6. **An order created by the Head.** Rule 7 of section 3 says the owner is "the Manager who created it". When the Head creates an order and buys, is the Head the owner, and does the Head then hold the cash balance? Needed by task 2.2.
7. **Reminders.** Orders waiting more than 24 hours "trigger a reminder", grouped once a day. Once per order, or again every day while it waits? The same for the 48-hour notice to the Head. Needed by task 8.1.

## Purchasing

8. **"Recent purchases".** The Head is prompted when "recent purchases" differ from the reference price by more than 20%. How many purchases, or how many days, is "recent"? Needed by task 3.9.
9. **Services and "Give straight to requester".** The tick creates a stock issue. Is it hidden for service orders? Needed by task 5.4.

## Release

10. **From test to production.** Section 18 says a new version is published each time a pull request is merged, and that new versions are tried on the test copy first. What moves a version from the test copy to production: every merge, or a step the owner takes by hand? Needed by task 9.4.

## Warehouse

11. **Cost of a return.** Stock value: issues, write-offs and transfers out use the average at that moment. At what cost does a return from a department come back in? Needed by task 5.6.
12. **Cost of a direct entry.** A direct entry has a cost per unit. Does it enter the moving average like a receipt? Needed by task 5.8.
13. **Write-off reasons.** The reason comes "from a fixed list". The spec names damaged, expired, lost, returned to supplier, and "Lost in transfer". Is that the whole list? Needed by task 5.11.

## Analytics

14. **"This quarter".** A calendar quarter, or a quarter of the school year? Needed by task 6.3.
15. **Suggested order quantity.** The Manager's Stock planning block shows a "suggested order quantity". The spec gives no formula. Needed by task 6.5.
16. **Analytics page as a PDF.** "The whole page downloads as a PDF report, without signature lines." The spec describes the order list PDF but not this one. Needed by task 6.7.

## System

17. **The nightly stock check.** The job "recomputes it from the movements and reports any mismatch". To whom, and how: a bell notification to the Head, or something else? Needed by task 8.2.

## Catalog

18. **Adding subtypes to a product that had none.** A product without subtypes has one hidden subtype called "default". When the Head later adds real subtypes to it, what happens to the default one, and to the orders, stock and price that point to it? Needed by task 1.8.

## Warehouse documents

19. **Who may reverse which document.** "A posted issue can be reversed by its creator or the Head." The spec says a wrong document of any type is fixed with Reverse, but names who may do it only for an issue. Who may reverse a return, a direct entry, an approved write-off, a received transfer or an approved count? Needed by task 5.7.

## Sign-in, added with the answers to 1 and 2

20. ~~**Sessions after a password renewal.** When the Head renews a user's password, are that user's open sessions ended at once, or do they run on until their 24 hours are over?~~ **Answered 10.10.2026:** they are ended at once, on every device. Written into A8.
