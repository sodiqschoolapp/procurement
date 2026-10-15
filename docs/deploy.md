# The test copy online

The owner's steps to put the test copy at `https://ombor-test.sodiqschool.uz` (build-plan 0.16; `docs/decisions.md`, D22 and "Decided ahead: task 0.16"), and to give it file storage and the four demo users (build-plan 0.15, steps 6 to 8). Steps 1 to 5 are done once, after task 0.16 is merged; steps 6 to 8 once, after task 0.15 is merged. Afterwards every pull request merged into `main` reaches the test copy by itself, with no step by anyone.

It costs $17 a month while it runs: a 1 GiB container ($10) and a development database ($7) (`docs/spec/18-hosting-and-costs.md`, row 7). It runs until go-live and is then switched off (D15). Its files on Cloudflare R2 are free up to 10 GB (row 3); the test copy holds a few invented pictures.

Steps 1 to 5 type no secret: the database address and its certificate are handed to the app by DigitalOcean itself. Steps 6 to 8 type eight values in the DigitalOcean dashboard, each as an encrypted variable: they are named here, never shown. Never paste a password, a database address or a token into a chat, an issue or a file of the repository.

## What runs where

| Part | Where | Comes from |
| --- | --- | --- |
| The app | DigitalOcean App Platform, Frankfurt, app `ombor-test`, component `web` | `Dockerfile`, built by DigitalOcean from `main` on every push |
| The database | A development database, PostgreSQL 17, component `db` of the same app | `.do/app.yaml` |
| The address | `ombor-test.sodiqschool.uz`, a CNAME in the DNS of `sodiqschool.uz` | Step 4 below |
| The files | Cloudflare R2, the private bucket `ombor-test-files` | Step 6 below |
| The demo users | `seed_head`, `seed_manager`, `seed_principal`, `seed_finance` in the database | `scripts/db-seed.mjs` at every start, step 7 below |

When a new version starts, the container first applies the database migrations (`scripts/start.sh`), then, on the test copy only (`SEED_DEMO_DATA=yes`), writes the demo users that are missing, then starts the app. DigitalOcean sends visitors to the new version only after `/health` answers. If the migration fails, the new container stops and the deploy is marked failed; the old version should keep running (DigitalOcean's documented behaviour as remembered by the session that wrote this, not read: check it the first time a deploy fails).

## The owner's steps

### 1. The DigitalOcean account

1. Sign in at `cloud.digitalocean.com`, or create the account there.
2. Billing → add the card. It must allow international online payments (`18-hosting-and-costs.md`, "Paying").

### 2. DigitalOcean may read the repository

1. In DigitalOcean: Create → App Platform → GitHub. DigitalOcean asks to install its GitHub app.
2. Install it on the organization `sodiqschoolapp` for the one repository `sodiqschoolapp/procurement` ("Only select repositories"). Read access to the code is all it needs.
3. Close the "Create app" page without creating anything: the app is created from the spec file in step 3.

### 3. Create the app from `.do/app.yaml`

1. Open `.do/app.yaml` on GitHub (`main` branch) and copy its whole text.
2. In DigitalOcean: Create → App Platform → choose the option to create from an app spec (in some versions of the dashboard: the "…" or "Import" option on the create page), and paste the text. With the command line instead: `doctl apps create --spec .do/app.yaml` from a clone of the repository.
3. **Before pressing Create, check the review page**: region Frankfurt (`fra`); one web service of 1 GiB, one container; one development database; and the monthly total **$17.00**.
4. **Stop here if anything differs**: DigitalOcean refuses the spec (an unknown size, database version or variable), or the total is not $17. Do not pick another size or version in the dashboard. Copy DigitalOcean's message (it holds no secret) into a comment on issue #9; a fix task then corrects `.do/app.yaml`. The session that wrote the spec could not read DigitalOcean's documentation, so the size name, PostgreSQL 17 for a development database, and the two variables `CA_CERT` and `COMMIT_HASH` were written from memory.
5. Create. The first build takes a few minutes. Activity shows "Deployed" when it is done.

### 4. The address

1. In DigitalOcean: the app → Settings → Domains. The domain `ombor-test.sodiqschool.uz` is listed, with the CNAME target it wants (an address ending in `ondigitalocean.app`).
2. Where the DNS of `sodiqschool.uz` is managed, add one record:

   | Type | Name | Value |
   | --- | --- | --- |
   | CNAME | `ombor-test` | the target DigitalOcean shows |

3. Wait until DigitalOcean shows the domain as active. It makes the HTTPS certificate itself; this can take up to an hour after the record appears.

### 5. Check it

1. Open `https://ombor-test.sodiqschool.uz/health`. It shows one line like `{"status":"ok","commit":"…","timezone":"UTC"}`:
   - `status` is `ok`: the app reaches its database.
   - `commit` is the full sha of the newest commit of `main` on GitHub. If it is `unknown`, the variable `GIT_COMMIT` is not bound; say so on issue #9.
   - `timezone` is `UTC` (`developer-rules.md` rule 10). Anything else: say so on issue #9.
2. Open `https://ombor-test.sodiqschool.uz/login`. The sign-in page opens and shows "Versiya" with the first seven characters of that commit at the bottom of the form.
3. After the next merge into `main`: the app's Activity shows a new deploy by itself, and `/health` then names the new commit.

### 6. File storage on Cloudflare R2

1. Sign in at `dash.cloudflare.com`, or create the free account there (`18-hosting-and-costs.md`, "Paying": Cloudflare needs its own account).
2. R2 Object Storage → turn it on. Cloudflare may ask for a card even for the free 10 GB; nothing is charged below that.
3. Create bucket: name `ombor-test-files` (exactly this: `.do/app.yaml` names it), location Automatic with the hint Eastern Europe (EEUR), the nearest to Frankfurt, default storage class Standard. Leave **public access off**: no `r2.dev` address and no custom domain. Every file goes through the app, which checks who may see it (`13-technology.md`, Files).
4. R2 → Manage API tokens → Create API token: permission **Object Read & Write**, applied to the one bucket `ombor-test-files` only, no expiry needed. Cloudflare shows three things once: the Access Key ID, the Secret Access Key, and the S3 endpoint for your account (`https://<account id>.r2.cloudflarestorage.com`). Keep the page open for step 8; do not paste them anywhere else.
5. If a screen differs from these words (another name for the permission, no location hint), choose the nearest and say on issue #9 what you saw. Stop if R2 asks for money beyond the free tier.

### 7. Update the app from `.do/app.yaml`

Task 0.15 added `SEED_DEMO_DATA`, `S3_REGION` and `S3_BUCKET` to `.do/app.yaml`. The running app does not read the file again by itself.

1. The app → Settings → App Spec → Edit, and paste the whole text of `.do/app.yaml` from `main`; or `doctl apps update <app id> --spec .do/app.yaml`.
2. **Applying the spec replaces the list of variables.** A value typed in the dashboard that is not in the file can be gone afterwards: `BETTER_AUTH_SECRET` included. So step 8 comes right after, and it types or checks all eight typed values.

### 8. The typed values, the demo users and the checks

1. The app → component `web` → Settings → Environment Variables → Edit. Add or check each of these, every one with **Encrypt** ticked:

   | Name | Value |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | the value of "`BETTER_AUTH_SECRET` (task 0.6)" below; type it again if it is gone. Without it every sign-in is refused. |
   | `S3_ENDPOINT` | the S3 endpoint Cloudflare showed in step 6.4 |
   | `S3_ACCESS_KEY_ID` | the Access Key ID of step 6.4 |
   | `S3_SECRET_ACCESS_KEY` | the Secret Access Key of step 6.4 |
   | `SEED_HEAD_PASSWORD` | a password you choose for `seed_head` |
   | `SEED_MANAGER_PASSWORD` | a password you choose for `seed_manager` |
   | `SEED_PRINCIPAL_PASSWORD` | a password you choose for `seed_principal` |
   | `SEED_FINANCE_PASSWORD` | a password you choose for `seed_finance` |

   Four different passwords, so one that leaks opens one role only (0.14, decision 3). Keep them where you keep passwords; never in a chat, an issue or a file of the repository.
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

   In the same transaction it also writes the demo catalogs (measures, categories, extra cost types, companies, departments of both branches, and 30 products with their subtypes and prices); they print no line.

   On every later deploy the same lines say `kept` instead of `created`.
3. Sign in at `https://ombor-test.sodiqschool.uz/login` as each of `seed_head`, `seed_manager`, `seed_principal` and `seed_finance` with its password. Each sees its own empty home page.
4. The storage check: the app → component `web` → Console, and type `node scripts/storage-check.mjs`. It makes an invented picture, makes its small version with sharp, writes it to R2, reads it back, and prints `storage ok`. Anything else is one line `storage failed: …` (below). If the console says a variable `S3_…` is not set although step 8.1 has it, the console may not carry the component's variables: say so on issue #9.
5. A photo uploaded through a screen and shown again comes with the first task that has a photo field (the catalog tasks); that task's report asks you to try it here.

How the demo users behave (0.14, decision 4): the seed runs on every deploy and **keeps what is there**. It never changes a password, a name or a branch, and never activates a user again. A demo user you deactivate or change by hand stays so; a changed password in the dashboard does not change the user's password. It refuses, writing nothing, when a user with a demo name exists with another role, or when `seed_principal` is missing and branch CHL already has an active Principal: the log then shows that reason and `db:seed failed: …`, and the app starts all the same.

## The variables

Seven variables are in `.do/app.yaml`; the owner types eight more in the dashboard, encrypted (steps 8.1 and `BETTER_AUTH_SECRET` below). Where to see them: the app → component `web` → Settings → Environment Variables. The values of `DATABASE_URL` and `DATABASE_CA_CERT` are filled in by DigitalOcean from the database; they are not shown in a chat or written anywhere. Applying `.do/app.yaml` again (step 7) can drop the typed ones: check them after every apply.

| Name | Value in `.do/app.yaml` | What it is |
| --- | --- | --- |
| `DATABASE_URL` | `${db.DATABASE_URL}` | The database's address, with its user and password. A secret: DigitalOcean binds it. |
| `DATABASE_CA_CERT` | `${db.CA_CERT}` | The certificate the app checks the database against. Public, but bound too. |
| `GIT_COMMIT` | `${_self.COMMIT_HASH}` | The commit the app was built from, shown by `/health` and the sign-in page. |
| `NODE_ENV` | `production` | Runs Next.js as a production server. |
| `PORT` | none: `8080` is set in `Dockerfile` | The port the app listens on, the same as `http_port` in `.do/app.yaml`. |
| `BETTER_AUTH_SECRET` | none: typed in the dashboard only (task 0.6) | Signs the session cookie. A secret: never in the repository, a chat or an issue. |
| `SEED_DEMO_DATA` | `yes` | Writes the demo users at every start (task 0.15). Production never has it; without the exact word `yes` the seed refuses a hosted database. |
| `SEED_HEAD_PASSWORD`, `SEED_MANAGER_PASSWORD`, `SEED_PRINCIPAL_PASSWORD`, `SEED_FINANCE_PASSWORD` | none: typed in the dashboard only (step 8) | The passwords the seed gives the four demo users when it creates them. Secrets. |
| `S3_REGION` | `auto` | R2's region for the S3 API. |
| `S3_BUCKET` | `ombor-test-files` | The private bucket of step 6. |
| `S3_ENDPOINT` | none: typed in the dashboard only (step 8) | `https://<account id>.r2.cloudflarestorage.com`. Not a secret, but your own. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | none: typed in the dashboard only (step 8) | The R2 token of step 6.4, for the one bucket. Secrets. |

### `BETTER_AUTH_SECRET` (task 0.6)

Without it the test copy answers on `/`, `/login` and `/health`, but every sign-in is refused and the log shows `Sign-in refused: BETTER_AUTH_SECRET is not set`. To set it:

1. On your own computer, make a random value of at least 32 characters, for example with `openssl rand -base64 32`. Do not paste it anywhere else.
2. The app → component `web` → Settings → Environment Variables → Edit → add `BETTER_AUTH_SECRET`, tick **Encrypt** (type Secret), paste the value, Save. DigitalOcean deploys again by itself.
3. Changing it later signs everyone out once; nothing else is lost.

It is not declared in `.do/app.yaml`, so no value and no empty placeholder sits in the repository (0.16, decision 14). If a deploy from `.do/app.yaml` ever removes it, type it again.

## When something is wrong

- **The deploy fails at the migration.** The app → Activity → the failed deploy → Runtime logs. The first lines are `Migrating database …` then `db:migrate failed: …`.
  - The reason names a certificate (for example `self-signed certificate in certificate chain` or `unable to verify`): the binding `${db.CA_CERT}` did not arrive. Open the database component → Connection details → download the CA certificate, then in the component `web` → Settings → Environment Variables change `DATABASE_CA_CERT` to its whole text (from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`), and save. Say on issue #9 that this was needed, so the spec file is corrected.
  - The reason says `permission denied for database` or `for schema`: the development database's user may not create the schema `drizzle`. Post the line on issue #9.
- **The log shows `db:seed failed: …`.** The line before it says why: `Refused: SEED_… is not set` (step 8.1 is missing that password), `Refused: the user … exists with the role …`, or `Refused: branch CHL already has an active Principal` (see "How the demo users behave"). The app runs; only the missing demo users are not there. Fix the cause; the next deploy seeds again.
- **No `seed` line at all in the log.** `SEED_DEMO_DATA` is not `yes`: apply `.do/app.yaml` again (step 7), then check step 8.1.
- **A demo user cannot sign in.** The log shows `Sign-in refused: BETTER_AUTH_SECRET is not set`: type it again (below). Otherwise the password typed at sign-in is not the one the seed used when it created the user; a later change in the dashboard does not change it.
- **`storage failed: S3_… is not set.`** That variable is missing in step 8.1.
- **`storage failed: … (HTTP 403).`** The token's keys are wrong, or the token is not for the bucket `ombor-test-files`: make a new token (step 6.4) and type both keys again.
- **`storage failed: … (HTTP 404).`** The bucket is not named `ombor-test-files`, or the endpoint is of another account.
- **Another `storage failed: …` line.** Post the line on issue #9; it holds no secret.
- **`/health` shows `"status":"database unavailable"`.** The app runs but does not reach the database in 3 seconds. Check the database component is running; then post the line on issue #9.
- **The page does not open at all.** Check the CNAME record of step 4 and that the domain shows as active.

## Switching it off

After go-live (D15), or for a period when nothing is built: the app → Settings → Destroy. That removes the app and its development database with its invented data; nothing real is lost, because the test copy holds no real data. The R2 bucket `ombor-test-files` stays until you delete it in Cloudflare (R2 → the bucket → Settings → Delete bucket, after emptying it), and its API token until you revoke it; both hold only invented pictures. To switch it on again, repeat step 3 and step 4 (the CNAME record can stay), then step 8 (and step 6 if the bucket was deleted).
