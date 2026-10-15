# Tech stack and architecture

> Part of the School Procurement & Warehouse Platform spec, baseline of 10 October 2026 (document revision 123).
> Index and reading order: `docs/spec/00-index.md`. Read-only: this folder changes only through `/spec-change`.

The stack is one TypeScript codebase on Next.js and PostgreSQL, chosen because Claude Code knows it well and it runs anywhere in Docker.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | [Next.js](https://nextjs.org/blog) 16, App Router, React, TypeScript in strict mode | One project for screens and server logic. Use the newest 16.x and apply its security updates. |
| Database | PostgreSQL 17 or newer | Transactions, row locks and constraints protect money and stock. |
| Database access | Drizzle ORM with SQL migrations | Typed queries and direct control over locks. |
| Login | Better Auth with its username plugin: username and password, sessions in the database, public sign-up off. The plugin still stores an email, so the app fills in a placeholder. A session ends 24 hours after sign-in, and several devices can be signed in at once. Users have no change-password screen; the Head renews a password on the user's page, typed or generated, and a renewal ends that user's sessions at once. There are no password rules | Accounts are created only by the Head. |
| Components | Tailwind CSS, shadcn/ui, Material Symbols Rounded icons (filled), TanStack Table | A consistent look and good keyboard behaviour. The icons match the school's brand book. |
| Fonts | Golos Text, and Bitter for the sign-in and empty pages, served from the app's own files | The same fonts as the academic platform; Golos Text covers Uzbek Latin and Cyrillic and is used in the PDFs too. |
| Forms and checks | React Hook Form with Zod | The same check runs in the browser and on the server. |
| Reads and writes | Server Components for reading, Server Actions for writing | Fewer moving parts. TanStack Query only where live refresh is needed. |
| Languages | next-intl with `uz`, `ru`, `en` files |  |
| Files | S3-compatible storage (Cloudflare R2; MinIO on the developer's computer), sharp for resizing | The bucket is private; files are served through a route that checks access. |
| Excel and PDF | ExcelJS for import and export; @react-pdf/renderer for the PDFs (the order list download, the issue note, the analytics report), with fonts for Uzbek and Russian built in |  |
| Charts | Recharts |  |
| Numbers | decimal.js for quantity × price; money stored as whole numbers | No floating-point errors. |
| Tests | Vitest for unit and database tests, Playwright for full flows | See section 15. |
| Running it | DigitalOcean, Frankfurt: App Platform runs the app's Docker image, Managed PostgreSQL holds the data. Cloudflare R2 holds the files. Docker Compose with MinIO on the developer's computer | The managed database is backed up daily and can be restored to any moment of the last 7 days. A weekly copy is also saved to R2. |
| Scheduled jobs | A scheduler inside the app, guarded by a database lock | Runs the reminders, the 5-minute analytics refresh and the nightly stock check. The lock makes sure a job never runs twice at once. |

## Architecture rules

The fifteen architecture rules are in `docs/spec/edge-cases/developer-rules.md`. They apply to every task.
