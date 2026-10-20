# Monitoring

Build-plan 9.3; `docs/spec/18-hosting-and-costs.md`, row 8 ("Error and uptime alerts, for example Sentry and UptimeRobot … Free plans are enough to start … Yes, from the trial"; D55 item 21). Everything here is done by the owner when the live app is set up (task 9.4; `docs/deploy.md`, step 9). Until then nothing is sent anywhere, and nothing here costs money.

## What the app does

- **Error alerts.** Every server error the app does not expect is sent as one event to Sentry, when the variable `ERROR_REPORT_DSN` is set: an error while a page or a route is made, a server action that fails with "Something went wrong", a scheduled job that fails, and every line of the nightly stock check that finds a stock number its movements do not give. The code is `src/server/error-report.ts`; it uses no Sentry library.
- **What an event holds:** the error's name and the same short text the app's log holds (a database error: only its PostgreSQL code and constraint), the file and line of each step that led to it, where it happened (`action <name>`, `job <name>`, `render /orders/[id]`: the page's pattern, never the address with what was searched), the commit, and the environment. Never a person's name, a phone, a password, a cookie, a header, what was typed in a form, or who was signed in.
- **Environment.** `trial` while `SEED_DEMO_DATA` is set (D52), `production` after the trial ends. Task 9.4 keeps that variable's name; the tag reads it.
- **A slow or broken Sentry** changes nothing for the users: a send is given up after 2 seconds, and a failed send only writes one line in the app's log.
- **Uptime.** `/health` answers 200 only when the app reaches its database (task 0.16). The uptime check calls it.

## For the owner, when the live app is set up (task 9.4)

### 1. Sentry (error alerts)

1. Create a free account at `sentry.io` (the Developer plan). Create one project, platform **Node.js**, named `ombor`. Alert rule: the default "alert on every new issue", sent to your e-mail.
2. Sentry shows the project's **DSN**, an address like `https://<key>@<something>.ingest.sentry.io/<number>`. Copy it.
3. In DigitalOcean: the app → component `web` → Settings → Environment Variables → Edit. Add `ERROR_REPORT_DSN` with the DSN as its value, **Encrypt** ticked. Save; the app restarts.
4. Applying `.do/app.yaml` again replaces the list of variables (`docs/deploy.md`): check afterwards that `ERROR_REPORT_DSN` is still there.

### 2. UptimeRobot (uptime alerts)

1. Create a free account at `uptimerobot.com`.
2. Add New Monitor: type **HTTP(s)**, friendly name `ombor`, URL `https://ombor.sodiqschool.uz/health`, interval **5 minutes** (the free plan's), alert contact: your e-mail.
3. The monitor turns green within 5 minutes. When the app or its database stops answering, the e-mail comes within about 5 minutes.

### 3. The check during the trial

1. In DigitalOcean, add the variable `FORCED_ERROR` with the value `on` (no encryption needed). Save; the app restarts.
2. Open `https://ombor.sodiqschool.uz/health?forced-error`. The page shows an error. Nothing is written anywhere; `/health` without `?forced-error` still answers as before.
3. Within a minute Sentry shows a new issue, `Error: Forced error for the monitoring check`, environment `trial`, release the commit that `/health` names. The e-mail of the alert rule arrives.
4. **Remove the variable `FORCED_ERROR`** and save.
5. If no issue appears: check that `ERROR_REPORT_DSN` is set, and look in the app's Runtime Logs for a line starting `Error report not sent` or `Error report not accepted`. Copy that line (it holds no secret) into a comment on issue #9.

## Reading an alert

- `action <name>`: a user's action failed and they saw "Something went wrong"; nothing of it was saved (`CLAUDE.md` rule 3). The name says which action.
- `job <name>`: a scheduled job failed; it runs again at its next time.
- `job stock_check` with `StockCheckMismatch`: a stock number disagrees with its movements. The Heads also got a bell notification. This is the most serious kind: tell the developer the same day.
- `render …`, `route …`: a page or a download failed to open.
