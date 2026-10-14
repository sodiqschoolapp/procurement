# The test copy online

The owner's steps to put the test copy at `https://ombor-test.sodiqschool.uz` (build-plan 0.16; `docs/decisions.md`, D22 and "Decided ahead: task 0.16"). Done once, after task 0.16 is merged. Afterwards every pull request merged into `main` reaches the test copy by itself, with no step by anyone.

It costs $17 a month while it runs: a 1 GiB container ($10) and a development database ($7) (`docs/spec/18-hosting-and-costs.md`, row 7). It runs until go-live and is then switched off (D15).

No secret is typed anywhere in these steps. The database address and its certificate are handed to the app by DigitalOcean itself. Never paste a password, a database address or a token into a chat, an issue or a file of the repository.

## What runs where

| Part | Where | Comes from |
| --- | --- | --- |
| The app | DigitalOcean App Platform, Frankfurt, app `ombor-test`, component `web` | `Dockerfile`, built by DigitalOcean from `main` on every push |
| The database | A development database, PostgreSQL 17, component `db` of the same app | `.do/app.yaml` |
| The address | `ombor-test.sodiqschool.uz`, a CNAME in the DNS of `sodiqschool.uz` | Step 4 below |

When a new version starts, the container first applies the database migrations (`scripts/start.sh`), then starts the app. DigitalOcean sends visitors to the new version only after `/health` answers. If the migration fails, the new container stops and the deploy is marked failed; the old version should keep running (DigitalOcean's documented behaviour as remembered by the session that wrote this, not read: check it the first time a deploy fails).

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
2. Open `https://ombor-test.sodiqschool.uz`. The start page opens and shows "Versiya" with the first seven characters of that commit.
3. After the next merge into `main`: the app's Activity shows a new deploy by itself, and `/health` then names the new commit.

## The variables

Every variable but one is in `.do/app.yaml`; the owner types only `BETTER_AUTH_SECRET` (below). Where to see them: the app → component `web` → Settings → Environment Variables. The values of `DATABASE_URL` and `DATABASE_CA_CERT` are filled in by DigitalOcean from the database; they are not shown in a chat or written anywhere.

| Name | Value in `.do/app.yaml` | What it is |
| --- | --- | --- |
| `DATABASE_URL` | `${db.DATABASE_URL}` | The database's address, with its user and password. A secret: DigitalOcean binds it. |
| `DATABASE_CA_CERT` | `${db.CA_CERT}` | The certificate the app checks the database against. Public, but bound too. |
| `GIT_COMMIT` | `${_self.COMMIT_HASH}` | The commit the app was built from, shown by `/health` and the start page. |
| `NODE_ENV` | `production` | Runs Next.js as a production server. |
| `PORT` | none: `8080` is set in `Dockerfile` | The port the app listens on, the same as `http_port` in `.do/app.yaml`. |
| `BETTER_AUTH_SECRET` | none: typed in the dashboard only (task 0.6) | Signs the session cookie. A secret: never in the repository, a chat or an issue. |

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
- **`/health` shows `"status":"database unavailable"`.** The app runs but does not reach the database in 3 seconds. Check the database component is running; then post the line on issue #9.
- **The page does not open at all.** Check the CNAME record of step 4 and that the domain shows as active.

## Switching it off

After go-live (D15), or for a period when nothing is built: the app → Settings → Destroy. That removes the app and its development database with its invented data; nothing real is lost, because the test copy holds no real data. To switch it on again, repeat step 3 and step 4 (the CNAME record can stay).
