# Restoring the database

The written restore procedure (build-plan 9.6; `docs/spec/13-technology.md`, Running it; `docs/spec/16-build-order.md`, phase 8 row: "restore yesterday's copy of the database into a new, empty database"). The database has two kinds of copies:

| Copy | Where | How far back | Restored by |
| --- | --- | --- | --- |
| DigitalOcean's daily backup | The cluster `ombor-db` → Backups | Any moment of the last 7 days | DigitalOcean, into a **new cluster** (part A) |
| The weekly copy | Cloudflare R2, bucket `ombor-copies`, `backups/database-<date>.dump` | Every Sunday, all kept | `npm run db:restore` into a **new database** (part B) |

A copy is always restored into something new. Never over the running app's database `defaultdb`: `db:restore` refuses it, and DigitalOcean's restore makes a new cluster by itself.

Every step is the owner's: it is production, and part A costs a little money (the drill cluster's hourly price, below). Never paste a password, a connection string or a token into a chat, an issue or a file of the repository. The lines the two scripts print hold counts, moments and database names only; they can be posted on issue #9.

The session that wrote this could not read DigitalOcean's documentation: the dashboard's screens are described from memory. If a screen differs, choose the nearest and say on issue #9 what you saw.

## The drill (during the trial, before 9.5)

Run parts A and B once while the trial runs, on the demo data. Task 9.5 (the end of the trial, `npm run trial:reset`) waits behind an owner gate line in `docs/build-plan.md` until the drill is done: after posting the four lines on issue #9, delete that line (the task's pull request or a commit of your own).

### A. Yesterday's copy (DigitalOcean's daily backup)

1. DigitalOcean → Databases → `ombor-db` → **Backups** (in some versions: the "…" menu → Restore from backup / Fork). Choose a moment of **yesterday**, Tashkent time (DigitalOcean may show UTC: Tashkent is UTC+5).
2. The new cluster: name **`ombor-db-drill`**, the same region (Frankfurt) and the same smallest plan. **Before pressing Create, check the price on the review page**: it is billed by the hour, about $15 a month, so a few cents for the hour of the drill. Stop if it is more; post what you saw on issue #9.
3. Wait until `ombor-db-drill` shows "Online". Open its **Connection details**, choose the connection string ("Connection string" / "URI") of the user `doadmin` and the database `defaultdb`, and copy it. It holds the drill cluster's password: paste it only at the prompt of step 5.
4. If `ombor-db-drill` → Settings → **Trusted sources** lists sources, add the app `ombor` there, so the app's console can reach it.
5. The app → component `web` → **Console**:

   ```
   npm run db:counts -- --ask
   ```

   Paste the connection string at the prompt `Address of the database to count (not shown):` and press Enter. It prints two lines, for example:

   ```
   Counts of database "defaultdb" at <drill host>:25060:
   orders 12, users 4, stock lines 2 (quantity 250.000), stock movements 4, newest row 2026-10-19T18:07:11.707Z
   ```

   If it prints `The server's certificate was refused: run it again with --ask --own-ca.`: download the CA certificate from the drill cluster's Connection details, run `npm run db:counts -- --ask --own-ca`, paste the address, then paste the whole certificate (from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`) and press Enter. The server is always verified; there is no way to switch that off.
6. In the same console, count the live database **up to the newest row** the copy showed (copy the moment exactly):

   ```
   npm run db:counts -- --until 2026-10-19T18:07:11.707Z
   ```

7. **Passed** when the second line of step 6 equals the second line of step 5, word for word. The copy then holds yesterday's demo orders, users and stock lines (build-plan 9.6, Done when). If they differ, see "When the two lines differ" below.
8. **Destroy `ombor-db-drill`** the same day (`ombor-db-drill` → Settings → Destroy, typing its name). Read the name twice: never destroy `ombor-db`. The drill cluster holds only a copy; the hourly charge stops when it is gone.

### B. The newest weekly copy (`ombor-copies`)

1. Choose a name for the new database: `drill_` and today's date, for example `drill_20261021`. Lower-case letters, digits and `_` only.
2. The app → component `web` → **Console**:

   ```
   npm run db:restore -- drill_20261021
   ```

   It takes the newest `backups/database-<date>.dump` of `ombor-copies` (by the date in its name), creates the database `drill_20261021` on the cluster `ombor-db`, restores the copy into it with `pg_restore` 17, and prints:

   ```
   restore ok backups/database-2026-10-18.dump into database "drill_20261021"
   Counts of database "drill_20261021":
   orders 12, users 4, stock lines 2 (quantity 250.000), stock movements 4, newest row 2026-10-18T03:41:02.120Z
   ```

   A copy other than the newest: `npm run db:restore -- drill_20261021 backups/database-2026-10-11.dump`.
3. Count the live database up to the copy's newest row:

   ```
   npm run db:counts -- --until 2026-10-18T03:41:02.120Z
   ```

4. **Passed** when the two count lines are equal: the restored weekly copy holds the demo orders of its Sunday (build-plan 9.6, Done when). The restored database can be counted again at any time with `npm run db:counts -- --database drill_20261021`.
5. **Delete the drill database**: DigitalOcean → Databases → `ombor-db` → **Users & Databases** → `drill_20261021` → Delete. Read the name twice: never delete `defaultdb`. It holds only a copy; nothing of the app is in it.

What `db:restore` refuses, writing nothing:
- `Refused: "…" is the app's database or one of PostgreSQL's own; …`: the name is `defaultdb` (or the name in the app's `DATABASE_URL`), `postgres`, `template0` or `template1`.
- `Refused: database "…" already exists; …`: choose a new name (or delete the old drill database first, step 5).
- `Refused: "…" is not a plain lower-case database name, …`.
- `Refused: no copy is in the bucket of the copies.` or `the copy "…" is not in the bucket of the copies`: check `ombor-copies` → `backups/` in Cloudflare (`docs/deploy.md`, "The weekly copy").
- `Refused: "…" is not a pg_dump custom-format file.`: the file is damaged; post the line on issue #9 and try the copy before it.

What can fail:
- `restore failed: BACKUP_S3_… is not set.`, or `(HTTP 403)`, `(HTTP 404)`: as for the weekly copy (`docs/deploy.md`, "When something is wrong"); the restore reads with the same token of step 6.5 there.
- `restore failed: pg_restore ended with code …. Database "…" was created and is left as it is: delete it in the dashboard`: the copy did not restore whole. Delete that database (step 5) and post the line on issue #9. A half-restored copy is never a pass.
- `restore failed: permission denied to create database`: `doadmin` may not create a database on this cluster; post the line on issue #9.
- The cluster's disk is full: a copy needs about as much room as the live database. During the trial it is small; post what DigitalOcean shows on issue #9.

### When the two lines differ

Each side is counted up to the same moment, so a good restore gives equal lines. Two causes of a difference are not a bad restore:
- **A deleted draft.** A draft that was never submitted can be deleted (the one deletion the app allows). One deleted on the live side after the copy makes the live `orders` lower than the copy's, and nothing else differs.
- **A row dated before its commit.** A row's time is set when it is written, and a deploy's seed during the trial writes missing demo rows dated days back. A write that was still open at the instant of the copy, or demo rows the seed wrote after it, put rows on the live side up to the moment that the copy does not have: the live line is higher. Count both sides again with an `--until` a little earlier than the newest row (both sides with the same `--until`); the lines should then be equal.

Post both pairs of lines on issue #9 with the difference named. Any other difference (fewer users, fewer movements, other stock lines) is a failed drill: post the lines and stop; a fix task decides.

### The drill's record

| Part | Date | Copy restored | Copy's line | Live line, `--until` the copy's newest row | Passed |
| --- | --- | --- | --- | --- | --- |
| A | | `ombor-db-drill`, moment … | | | |
| B | | `backups/database-….dump` into `drill_…` | | | |

The owner posts the four lines on issue #9; task 9.5 copies them into this table.

## When it is real

The live database is lost or damaged (a wrong mass change, a failed migration that broke data, the cluster gone). This is the owner's production step, never the loop's. Not run in the drill: no step of the drill touches the live app.

1. **Stop the writes.** Tell the users to stop working. Nothing in the app does this.
2. **Restore the last good moment** as in part A, steps 1 to 4, into a new cluster, for example `ombor-db-2`: the moment just before the damage. The daily backups reach back 7 days. Only when the damage is older than that, restore the newest weekly copy from before it as in part B into a new database of a new cluster; everything after its Sunday is then lost.
3. **Point the app at the new cluster.** `cluster_name` of the database component in `.do/app.yaml` names `ombor-db`; it must name the new cluster. Either a task pull request changes the file and the owner applies it (`docs/deploy.md`, step 7), or the owner edits the App Spec in the dashboard first (the app → Settings → App Spec) and a task brings `.do/app.yaml` in line afterwards. Either way, check every typed value of `docs/deploy.md` step 8.1 right after: applying a spec can drop them.
4. **Check** `/health` (`status` `ok`), sign in as a Head, and run `npm run db:counts` in the console: the counts are those of the moment restored.
5. Keep the damaged cluster until the owner is sure nothing more is needed from it, then destroy it (it costs its monthly price while it exists).
6. Post on issue #9 what happened, the moment restored and the counts.
