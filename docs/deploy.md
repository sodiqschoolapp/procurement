# The live app

The owner's steps to put the live app at `https://ombor.sodiqschool.uz` (build-plan 9.4; `docs/spec/18-hosting-and-costs.md`; `docs/decisions.md`, D52). There is no test copy: the live app first runs **in trial**, with the four demo users and invented data, until the owner is satisfied; then the trial ends (task 9.5, "The end of the trial" below) and the real data comes in. Steps 1 to 10 are done once, after task 9.4 is merged. Afterwards every pull request merged into `main` reaches the live app by itself, with no step by anyone (open question 10).

It costs $25 a month from the day the app and its database are created: a 1 GiB container ($10) and a Managed PostgreSQL cluster of 1 GiB ($15) (`18-hosting-and-costs.md`, rows 1 and 2). The files on Cloudflare R2 are free up to 10 GB (row 3). Sentry and UptimeRobot are free plans (row 8).

Steps 1 to 5 type no secret: the database address and its certificate are handed to the app by DigitalOcean itself. Steps 6 to 8 type values in the DigitalOcean dashboard, each as an encrypted variable: they are named here, never shown. Never paste a password, a database address or a token into a chat, an issue or a file of the repository.

## What runs where

| Part | Where | Comes from |
| --- | --- | --- |
| The app | DigitalOcean App Platform, Frankfurt, app `ombor`, component `web` | `Dockerfile`, built by DigitalOcean from `main` on every push |
| The database | A Managed PostgreSQL 17 cluster `ombor-db`, one node of 1 GiB, Frankfurt; component `db` of the app, database `defaultdb`, user `doadmin` | Step 3 below, then `.do/app.yaml` |
| The address | `ombor.sodiqschool.uz`, a CNAME in the DNS of `sodiqschool.uz` | Step 5 below |
| The files | Cloudflare R2, the private bucket `ombor-files` | Step 6 below |
| The weekly copy of the database | Cloudflare R2, a bucket of its own, `ombor-copies`, under `backups/`, one file `database-<date>.dump` per copy | The job `database_copy` (tasks 8.2 and 8.2b); the section "The weekly copy" below |
| The demo users (trial only) | `seed_head`, `seed_manager`, `seed_principal`, `seed_finance` in the database, with invented catalogs, orders and stock | `scripts/db-seed.mjs` at every start while `SEED_DEMO_DATA` is `yes`, step 8 below |
| The alerts | Sentry (errors) and UptimeRobot (`/health`) | Step 9 below and `docs/monitoring.md` |

When a new version starts, the container first applies the database migrations (`scripts/start.sh`), then, while the trial runs (`SEED_DEMO_DATA=yes`), writes the demo data that is missing, then starts the app. DigitalOcean sends visitors to the new version only after `/health` answers. If the migration fails, the new container stops and the deploy is marked failed; the old version should keep running (DigitalOcean's documented behaviour as remembered by the session that wrote this, not read: check it the first time a deploy fails).

## The owner's steps

### 1. The DigitalOcean account

1. Sign in at `cloud.digitalocean.com`, or create the account there.
2. Billing → add the card. It must allow international online payments (`18-hosting-and-costs.md`, "Paying").

### 2. DigitalOcean may read the repository

1. In DigitalOcean: Create → App Platform → GitHub. DigitalOcean asks to install its GitHub app.
2. Install it on the organization `sodiqschoolapp` for the one repository `sodiqschoolapp/procurement` ("Only select repositories"). Read access to the code is all it needs.
3. Close the "Create app" page without creating anything: the app is created from the spec file in step 4.

### 3. The database cluster

1. In DigitalOcean: Create → Databases → PostgreSQL.
2. Version **17**. Datacenter **Frankfurt** (FRA1). Plan: **Basic**, shared CPU, **1 GiB RAM / 1 vCPU**, one node (no standby node), the smallest disk offered. Name: **`ombor-db`** (exactly this: `.do/app.yaml` names it).
3. **Before pressing Create, check the price: $15 a month.** Stop if it differs; post what you saw on issue #9.
4. Create. It takes a few minutes until the cluster shows "Online".
5. Do **not** add a connection pool, a database or a user: the app connects as `doadmin` to `defaultdb` directly (plan of 9.4, decided items 1 and 9). A pool would drop the settings the app sends on each connection (`timezone=UTC`, `jit=off`).
6. The cluster's **Backups** tab: DigitalOcean makes a daily backup by itself and can restore to any moment of the last 7 days (`13-technology.md`, Running it). The first one shows within a day. Nothing is switched on by hand.

### 4. Create the app from `.do/app.yaml`

1. Open `.do/app.yaml` on GitHub (`main` branch) and copy its whole text.
2. In DigitalOcean: Create → App Platform → choose the option to create from an app spec (in some versions of the dashboard: the "…" or "Import" option on the create page), and paste the text. With the command line instead: `doctl apps create --spec .do/app.yaml` from a clone of the repository.
3. **Before pressing Create, check the review page**: region Frankfurt (`fra`); one web service of 1 GiB, one container, **$10.00** a month; the database `db` attached to the existing cluster `ombor-db` (no new database is charged).
4. **Stop here if anything differs**: DigitalOcean refuses the spec (an unknown size, an unknown field of the database, a variable), it offers to create a new database instead of attaching `ombor-db`, or the app's total is not $10. Do not pick another size or database in the dashboard. Copy DigitalOcean's message (it holds no secret) into a comment on issue #9; a fix task then corrects `.do/app.yaml`. The session that wrote the spec could not read DigitalOcean's documentation, so the size name, the database fields `production`, `cluster_name`, `db_name` and `db_user`, and the two variables `CA_CERT` and `COMMIT_HASH` were written from memory.
5. Create. The first build takes a few minutes. Activity shows "Deployed" when it is done. Until step 8 the sign-in refuses everyone and the log says `db:seed failed` (the seed passwords are not typed yet): expected.

### 5. The address

1. In DigitalOcean: the app → Settings → Domains. The domain `ombor.sodiqschool.uz` is listed, with the CNAME target it wants (an address ending in `ondigitalocean.app`).
2. Where the DNS of `sodiqschool.uz` is managed, add one record:

   | Type | Name | Value |
   | --- | --- | --- |
   | CNAME | `ombor` | the target DigitalOcean shows |

3. Wait until DigitalOcean shows the domain as active. It makes the HTTPS certificate itself; this can take up to an hour after the record appears.

### 6. File storage on Cloudflare R2

1. Sign in at `dash.cloudflare.com`, or create the free account there (`18-hosting-and-costs.md`, "Paying": Cloudflare needs its own account).
2. R2 Object Storage → turn it on. Cloudflare may ask for a card even for the free 10 GB; nothing is charged below that.
3. Create bucket: name `ombor-files` (exactly this: `.do/app.yaml` names it), location Automatic with the hint Eastern Europe (EEUR), the nearest to Frankfurt, default storage class Standard. Leave **public access off**: no `r2.dev` address and no custom domain. Every file goes through the app, which checks who may see it (`13-technology.md`, Files).
4. R2 → Manage API tokens → Create API token: permission **Object Read & Write**, applied to the one bucket `ombor-files` only, no expiry needed. Cloudflare shows three things once: the Access Key ID, the Secret Access Key, and the S3 endpoint for your account (`https://<account id>.r2.cloudflarestorage.com`). Keep the page open for step 8; do not paste them anywhere else.
5. The bucket of the copies of the database (task 8.2b): Create bucket `ombor-copies` the same way, public access off. Then a second API token, **Object Read & Write** on the one bucket `ombor-copies` only. Its Access Key ID and Secret Access Key go into step 8 as `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY`; the endpoint is the same. The copies hold password hashes, so the files token never reaches them, and this token reaches nothing else.
6. If a screen differs from these words (another name for the permission, no location hint), choose the nearest and say on issue #9 what you saw. Stop if R2 asks for money beyond the free tier.

### 7. Applying `.do/app.yaml` again later

The running app does not read the file again by itself. When a task changes `.do/app.yaml` (9.5 does: it removes `SEED_DEMO_DATA`):

1. The app → Settings → App Spec → Edit, and paste the whole text of `.do/app.yaml` from `main`; or `doctl apps update <app id> --spec .do/app.yaml`.
2. **Applying the spec replaces the list of variables.** A value typed in the dashboard that is not in the file can be gone afterwards: `BETTER_AUTH_SECRET` included. So check every typed value of step 8 right after.

### 8. The typed values, the demo users and the checks

1. The app → component `web` → Settings → Environment Variables → Edit. Add or check each of these, every one with **Encrypt** ticked:

   | Name | Value |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | the value of "`BETTER_AUTH_SECRET`" below. Without it every sign-in is refused. |
   | `S3_ENDPOINT` | the S3 endpoint Cloudflare showed in step 6.4 |
   | `S3_ACCESS_KEY_ID` | the Access Key ID of step 6.4 |
   | `S3_SECRET_ACCESS_KEY` | the Secret Access Key of step 6.4 |
   | `BACKUP_S3_ACCESS_KEY_ID` | the Access Key ID of the token of step 6.5 |
   | `BACKUP_S3_SECRET_ACCESS_KEY` | the Secret Access Key of the token of step 6.5 |
   | `SEED_HEAD_PASSWORD` | a password you choose for `seed_head` |
   | `SEED_MANAGER_PASSWORD` | a password you choose for `seed_manager` |
   | `SEED_PRINCIPAL_PASSWORD` | a password you choose for `seed_principal` |
   | `SEED_FINANCE_PASSWORD` | a password you choose for `seed_finance` |
   | `ERROR_REPORT_DSN` | the DSN of the Sentry project, step 9.1 (can be added then) |

   Four different seed passwords, so one that leaks opens one role only (0.14, decision 3). Keep them where you keep passwords; never in a chat, an issue or a file of the repository. They are needed only during the trial.
2. Save. DigitalOcean deploys again. In Activity → the new deploy → Runtime logs, after the `applied …` lines, the seed prints:

   ```
   created branch CHL
   created branch YUN
   created user seed_head
   created user seed_manager
   created user seed_principal
   created user seed_finance
   seed done
   ```

   In the same transaction it also writes the demo catalogs, orders, money and stock; they print no line. On every later deploy the same lines say `kept` instead of `created`.
3. Open `https://ombor.sodiqschool.uz/health`. It shows one line like `{"status":"ok","commit":"…","timezone":"UTC"}`:
   - `status` is `ok`: the app reaches its database.
   - `commit` is the full sha of the newest commit of `main` on GitHub. If it is `unknown`, the variable `GIT_COMMIT` is not bound; say so on issue #9.
   - `timezone` is `UTC` (`developer-rules.md` rule 10). Anything else: say so on issue #9.
4. **Done when of 9.4:** sign in at `https://ombor.sodiqschool.uz/login` as each of `seed_head`, `seed_manager`, `seed_principal` and `seed_finance` with its password. Each sees its home page with the invented data. The sign-in page shows "Versiya" with the first seven characters of the commit.
5. **Done when of 9.4:** the database cluster `ombor-db` → Backups shows a daily backup (the day after step 3). Say on issue #9 that both checks passed.
6. The storage check: the app → component `web` → Console, and type `node scripts/storage-check.mjs`. It makes an invented picture, makes its small version with sharp, writes it to R2, reads it back, and prints `storage ok`. Anything else is one line `storage failed: …` (below). If the console says a variable `S3_…` is not set although step 8.1 has it, the console may not carry the component's variables: say so on issue #9.
7. After the next merge into `main`: the app's Activity shows a new deploy by itself, and `/health` then names the new commit.

How the demo users behave (0.14, decision 4): the seed runs on every deploy and **keeps what is there**. It never changes a password, a name or a branch, and never activates a user again. A demo user you deactivate or change by hand stays so; a changed password in the dashboard does not change the user's password. It refuses, writing nothing, when a user with a demo name exists with another role, when `seed_principal` is missing and branch CHL already has an active Principal, and always once the trial has ended (below): the log then shows that reason and `db:seed failed: …`, and the app starts all the same.

### 9. The error and uptime alerts

From the trial on (`18-hosting-and-costs.md` row 8; D55 item 21), not optional: follow `docs/monitoring.md` step 1 (Sentry, which gives `ERROR_REPORT_DSN` for step 8.1), step 2 (UptimeRobot on `https://ombor.sodiqschool.uz/health`) and step 3 (the forced-error check, then remove `FORCED_ERROR`). Sentry tags the events `trial` while `SEED_DEMO_DATA` is set, and `production` after the trial ends.

### 10. The weekly copy

Check it once the first night has passed: "The weekly copy" below, items 1 and 2.

## The weekly copy (tasks 8.2 and 8.2b)

Every Sunday at 04:00 Tashkent time the app saves a copy of the whole database, made by `pg_dump` 17 in the image, to the bucket of its own `ombor-copies` as `backups/database-<YYYY-MM-DD>.dump` (`13-technology.md`, Running it). It uses the database's own `DATABASE_URL` and `DATABASE_CA_CERT`, `S3_ENDPOINT` and `S3_REGION` of the files, and `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY` of step 8. Every copy is kept; nothing deletes them. DigitalOcean's own daily backups of the database are separate and stay as they are.

When a copy fails, every active Head gets a notice in the bell ("The weekly copy of the database failed"), and the copy is tried again the next night at 04:00, every night until one succeeds. A Sunday missed while the app was down is copied the first night the last good copy is 7 days old. The Head's Settings page shows the date of the last good copy. A missing `BACKUP_S3_…` value is a failed copy too: the Heads are told every night until it is typed. The cause is in the runtime log, one line `Job database_copy: copy failed: …`.

The first version that carries the job copies on its first night, so a file is there soon after the deploy.

1. In Cloudflare: R2 → `ombor-copies` → the folder `backups/` holds `database-<date>.dump`; `ombor-files` holds no `backups/` folder. Settings in the app (as the Head) shows the same date.
2. Also, in the app → component `web` → Console: `node scripts/db-copy.mjs` makes a copy now, named by today's date, and prints `copy ok backups/database-….dump (<size> bytes)`. Anything else is one line `copy failed: …` (below). A copy made here does not change the date on the Settings page.

To restore a copy, always into a new database and never into the running app's database: `docs/restore.md` (task 9.6), with `npm run db:restore` in the console.

The copies hold everything in the database, password hashes and sign-in sessions included. That is why they are in a bucket of their own, reached by a token of their own (step 6.5).

## The end of the trial (task 9.5)

When the owner is satisfied with the trial and the restore drill (9.6, `docs/restore.md`) is done, the trial ends, in this order (D52):

1. **`SEED_DEMO_DATA` removed.** Task 9.5 removes it from `.do/app.yaml`; apply the file (step 7), then check that the variable is gone from the component's Environment Variables and that the typed values of step 8 are all still there. The four `SEED_*_PASSWORD` values can be deleted. Wait until Activity shows the new deploy as "Deployed": its log has no `seed` line.
2. **No deploy in progress.** Activity shows nothing building or deploying. A deploy that starts during the reset migrates the database at the same moment, and one of the two fails (decision 5 of 9.4's plan); nothing worse, but run it at a quiet time, when nobody is signed in.
3. **`npm run trial:reset`** in the app → component `web` → Console. It names the database (`database "defaultdb" at …`), then asks for its name. Type `defaultdb` and press Enter. It deletes every row of the database: users, sessions, catalogs, orders, money, stock, the audit log, everything (the `public` and `drizzle` schemas are dropped), applies the migrations from zero, and records in the database that the trial has ended. It prints:

   ```
   Trial ended: database "defaultdb" is empty and migrated (<n> migrations). Create the first Head with npm run user:first-head.
   ```

   Everyone is signed out (the sessions are gone). The running app works on the new, empty tables at once.
4. **`npm run user:first-head`** in the same console: the real first Head, then a second Head created by that Head in the app (9.5; D55 item 8).

What the reset refuses, writing nothing:
- A confirmation that is not exactly the database's name: `Refused: the confirmation is not the database's name "defaultdb". Nothing was written.` Run it again.
- A second run, once the end of the trial is recorded: `Refused: the trial of database "defaultdb" has already ended; it may hold the real data. Nothing was written.` This is the guard that it can never run over the real data. There is no way around it in the app.
- After the reset the seed refuses too, whatever `SEED_DEMO_DATA` says: `Refused: the trial of this database has ended (npm run trial:reset); …`. A deploy that still has the variable writes no demo data; remove the variable all the same.

What the reset does **not** empty (the top paragraph of `18-hosting-and-costs.md`: "tried with invented data, then emptied"):
- The trial's photos and receipts stay in the bucket `ombor-files`, referenced by nothing any more. Empty the bucket in Cloudflare (R2 → `ombor-files` → select every object → Delete) before or right after the reset if you want them gone; the bucket and its token stay.
- The weekly copies in `ombor-copies` still hold the trial's invented data, users and password hashes included. Delete the `backups/` files of the trial in Cloudflare if you want them gone; the next Sunday makes the first copy of the real data.
- DigitalOcean's own daily backups of the trial expire by themselves after 7 days.

If it fails with a message from PostgreSQL (`trial:reset failed: …`, for example `must be owner of …`, which can appear if DigitalOcean keeps an object of its own in the schema `public` of `defaultdb`): the drops run in one transaction, so nothing was deleted. Copy the line (it holds no secret) into a comment on issue #9 and stop; a fix task decides. If it fails after the drops (a line naming a migration), the database is empty without the record: run `npm run trial:reset` again; that is allowed, because the end of the trial is recorded only at the very end.

## A Head forgot the password (task 8.2b)

A Head's password is renewed by another Head on the user's page. When no other Head can (one Head, or every Head locked out), it is renewed from the console (`03-roles-and-permissions.md` rule 4):

1. The app → component `web` → Console.
2. Type `npm run user:renew-head`. It asks for the Head's username, then the new password twice; the password is not shown while typed and is never printed.
3. It prints `Renewed the password of "<username>". Every session of this Head is ended.` The Head signs in with the new password. The audit log shows the renewal, with the Head as the one who made it.

It refuses, changing nothing, a username that is not an active Head, an empty password, two passwords that differ, and a Head with no password account. Nothing in the app changes; a Head still cannot renew their own password on a screen.

## The variables

Eight variables are in `.do/app.yaml`; the owner types eleven more in the dashboard, encrypted (step 8.1). Where to see them: the app → component `web` → Settings → Environment Variables. The values of `DATABASE_URL` and `DATABASE_CA_CERT` are filled in by DigitalOcean from the database; they are not shown in a chat or written anywhere. Applying `.do/app.yaml` again (step 7) can drop the typed ones: check them after every apply.

| Name | Value in `.do/app.yaml` | What it is |
| --- | --- | --- |
| `DATABASE_URL` | `${db.DATABASE_URL}` | The database's address, with its user and password. A secret: DigitalOcean binds it. |
| `DATABASE_CA_CERT` | `${db.CA_CERT}` | The certificate the app checks the database against. Public, but bound too. |
| `GIT_COMMIT` | `${_self.COMMIT_HASH}` | The commit the app was built from, shown by `/health` and the sign-in page. |
| `NODE_ENV` | `production` | Runs Next.js as a production server. |
| `PORT` | none: `8080` is set in `Dockerfile` | The port the app listens on, the same as `http_port` in `.do/app.yaml`. |
| `BETTER_AUTH_SECRET` | none: typed in the dashboard only | Signs the session cookie. A secret: never in the repository, a chat or an issue. |
| `SEED_DEMO_DATA` | `yes` during the trial; removed by 9.5 | Writes the demo users and invented data at every start (D52). Without the exact word `yes` the seed refuses a hosted database; after the trial it refuses whatever this says. Sentry's environment tag reads it. |
| `SEED_HEAD_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_PRINCIPAL_PASSWORD`, `SEED_FINANCE_PASSWORD` | none: typed in the dashboard only (step 8) | The passwords the seed gives the four demo users when it creates them. Secrets. Trial only. |
| `S3_REGION` | `auto` | R2's region for the S3 API. |
| `S3_BUCKET` | `ombor-files` | The private bucket of step 6. |
| `S3_ENDPOINT` | none: typed in the dashboard only (step 8) | `https://<account id>.r2.cloudflarestorage.com`. Not a secret, but your own. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | none: typed in the dashboard only (step 8) | The R2 token of step 6.4, for the one bucket. Secrets. |
| `BACKUP_S3_BUCKET` | `ombor-copies` | The private bucket of the copies of the database, step 6.5 (task 8.2b). |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | none: typed in the dashboard only (step 8) | The R2 token of step 6.5, for the bucket of the copies only. Secrets. |
| `ERROR_REPORT_DSN` | none: typed in the dashboard only (step 8; `docs/monitoring.md` step 1) | Where the error reports go (task 9.3). A secret of a kind: whoever has it can send events to the project. |
| `FORCED_ERROR` | none: set to `on` only for the check of `docs/monitoring.md` step 3, then removed | Lets `/health?forced-error` throw. |

### `BETTER_AUTH_SECRET`

Without it the app answers on `/`, `/login` and `/health`, but every sign-in is refused and the log shows `Sign-in refused: BETTER_AUTH_SECRET is not set`. To set it:

1. On your own computer, make a random value of at least 32 characters, for example with `openssl rand -base64 32`. Do not paste it anywhere else.
2. The app → component `web` → Settings → Environment Variables → Edit → add `BETTER_AUTH_SECRET`, tick **Encrypt** (type Secret), paste the value, Save. DigitalOcean deploys again by itself.
3. Changing it later signs everyone out once; nothing else is lost.

It is not declared in `.do/app.yaml`, so no value and no empty placeholder sits in the repository (0.16, decision 14). If a deploy from `.do/app.yaml` ever removes it, type it again.

## When something is wrong

- **The deploy fails at the migration.** The app → Activity → the failed deploy → Runtime logs. The first lines are `Migrating database …` then `db:migrate failed: …`.
  - The reason names a certificate (for example `self-signed certificate in certificate chain` or `unable to verify`): the binding `${db.CA_CERT}` did not arrive. Open the database cluster → Connection details → download the CA certificate, then in the component `web` → Settings → Environment Variables change `DATABASE_CA_CERT` to its whole text (from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`), and save. Say on issue #9 that this was needed, so the spec file is corrected.
  - The reason says `permission denied for database` or `for schema`: the app does not connect as `doadmin`. Check the database component of the app spec (step 4.4) and post the line on issue #9.
- **The log shows `db:seed failed: …`.** The line before it says why: `Refused: SEED_… is not set` (step 8.1 is missing that password), `Refused: the user … exists with the role …`, `Refused: branch CHL already has an active Principal` (see "How the demo users behave"), or `Refused: the trial of this database has ended` (remove `SEED_DEMO_DATA`, "The end of the trial" step 1). The app runs; only the missing demo data is not there.
- **No `seed` line at all in the log during the trial.** `SEED_DEMO_DATA` is not `yes`: apply `.do/app.yaml` again (step 7), then check step 8.1.
- **A demo user cannot sign in.** The log shows `Sign-in refused: BETTER_AUTH_SECRET is not set`: type it again. Otherwise the password typed at sign-in is not the one the seed used when it created the user; a later change in the dashboard does not change it.
- **`storage failed: S3_… is not set.`** That variable is missing in step 8.1.
- **`storage failed: … (HTTP 403).`** The token's keys are wrong, or the token is not for the bucket `ombor-files`: make a new token (step 6.4) and type both keys again.
- **`storage failed: … (HTTP 404).`** The bucket is not named `ombor-files`, or the endpoint is of another account.
- **Another `storage failed: …` line.** Post the line on issue #9; it holds no secret.
- **The log shows `Job database_copy failed: copy failed: …`, or the console prints `copy failed: …`.**
  - `pg_dump ended with code …`: the dump did not finish. A reason with a certificate: see the first item of this list (`DATABASE_CA_CERT`). Otherwise post the line on issue #9.
  - `S3_… is not set`, or `(HTTP 403)`, `(HTTP 404)`: as for the storage check, with the bucket `ombor-copies` and the token of step 6.5.
  - The scheduler tries the copy again the next night; the console line makes one at once.
- **The log shows `Stock check: branch …, subtype …`** (and the Head has the bell notification "The nightly stock check found …"): a stored stock number is not what its movements say. Nothing was changed. Post the lines on issue #9; they hold ids and numbers only.
- **`/health` shows `"status":"database unavailable"`.** The app runs but does not reach the database in 3 seconds. Check that the cluster `ombor-db` is "Online"; then post the line on issue #9.
- **The page does not open at all.** Check the CNAME record of step 5 and that the domain shows as active.
- **`npm run trial:reset` fails.** See the end of "The end of the trial".
