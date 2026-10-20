# What you need to buy

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

Running the app costs about $25 a month for hosting, from the day the live app is set up (task 9.4). Before the school's real data goes in, the live app is tried with invented data, then emptied. The address is a sub-address of the school's own domain, so it costs nothing. Everything else is free or already yours. Prices were checked on 10 October 2026.

The app and the database are on DigitalOcean, in its Frankfurt data centre, and the files are on Cloudflare R2. Both are well-known providers, and nobody has to look after a server: updates, HTTPS and database backups are handled for you. The app is always on, so the first click of the day is as fast as the rest.

| # | Item | What it is for | Cost | Needed |
| --- | --- | --- | --- | --- |
| 1 | [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/details/pricing/), one container with 1 GiB memory | Runs the app. Publishes a new version each time a pull request is merged on GitHub. | $10 per month | Yes |
| 2 | [DigitalOcean Managed PostgreSQL](https://www.digitalocean.com/pricing/managed-databases), single node with 1 GiB memory | The database. Includes a daily backup and [restore to any moment of the last 7 days](https://www.digitalocean.com/products/managed-databases-postgresql). | $15 per month | Yes |
| 3 | [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | Product photos, receipts and a weekly extra copy of the database. | Free for the first 10 GB, then $0.015 per GB per month. No download fees. | Yes |
| 4 | Domain name | `ombor.sodiqschool.uz` for the app, a sub-address of the school's own domain. | Free | Yes |
| 5 | Claude plan with Claude Code | Builds and later changes the app. | You already have it | Yes |
| 6 | GitHub account | Keeps the code and its history. DigitalOcean reads new versions from it. | Free plan | Yes |
| 7 | ~~Test copy of the app: a second 1 GiB container and a development database~~ | ~~New versions are tried here before staff see them.~~ | None | No. Dropped on 19.10.2026: the live app is tried with invented data before the real data, then emptied. |
| 8 | Error and uptime alerts, for example Sentry and UptimeRobot | Tell you when something breaks before a user calls. | Free plans are enough to start | Yes, from the trial (owner, 20.10.2026) |
| 9 | Next.js, PostgreSQL and every library in section 13 | The building blocks. | Free, open source | Yes |

- **Total, required:** $25 per month from the day the live app is set up (task 9.4), about $300 per year. Nothing runs before it, and nothing runs beside it.
- **Why this size.** 1 GiB for the app and 1 GiB for the database is sized for 20 to 30 users, with room to spare for making PDFs and handling photos.
- **Paying.** DigitalOcean takes Visa, Mastercard and PayPal. The card must allow international online payments. Cloudflare needs its own free account.
- **Growing.** If the app ever feels slow or restarts, move the container to 2 GiB in the DigitalOcean control panel. That costs $25 instead of $10 and needs no rebuilding.
- **Not needed.** No email service, no SMS service, no app-store accounts, no paid design tools.
- **Cheaper route considered.** Render with a 512 MB app and a 256 MB database comes to $13 per month, but the app memory is tight and the restore history is 3 days. It was set aside on 10 October 2026.
