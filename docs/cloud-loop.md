# Claude Code sessions in the cloud

How a Claude Code session at claude.ai/code gets the same working project a laptop has: Node 24, the packages, a running PostgreSQL 17 with the migrations applied. This is the first step towards a build loop that runs without the owner in the middle; the later steps (the review routine, the start routine, the bridge from GitHub) are added to this file as each one is built and proved.

Nothing here changes how a session on the laptop works.

## What happens when a cloud session starts

| When | What runs | What it does |
| --- | --- | --- |
| Once per environment, then kept for about a week | `scripts/cloud-setup.sh`, pasted into the environment's "Setup script" field | Installs Node 24 into `/opt/node24`, starts Docker once and downloads the `postgres:17` image. |
| At every session start and every resume | `scripts/cloud-session-start.sh`, the `SessionStart` hook of `.claude/settings.json` | Writes the local `.env`, starts Docker, runs `docker compose up -d --wait`, `npm ci`, `npm run db:migrate`, and fetches the browser Playwright needs. |

On the laptop the hook ends at once: it does its work only when `CLAUDE_CODE_REMOTE` is `true`, which only a cloud session sets.

Both scripts never abort. A step that fails prints a line that starts with `!!`, and the session still starts, so that the session can report what failed. The full output of the session start is in `/tmp/procurement-cloud-session-start.log` on the cloud machine.

The database of a cloud session is the PostgreSQL service of `docker-compose.yml`, the same one the laptop starts and the same one CI will start. No second way to run PostgreSQL exists in this project.

## One-time set-up

### 1. The cloud environment

At claude.ai/code, select the cloud icon with the environment's name in the row above the message box, then "Add cloud environment":

| Field | Value |
| --- | --- |
| Name | `procurement` |
| Network access | Custom. Tick "Also include default list of common package managers" (it covers npm, Docker Hub, GitHub and nodejs.org) and add two domains, one per line: `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` (the browser for the Playwright tests) |
| Environment variables | One line: `PATH=/opt/node24/bin:/nix/var/nix/profiles/default/bin:/root/.local/bin:/root/.cargo/bin:/usr/local/go/bin:/opt/node22/bin:/opt/maven/bin:/opt/gradle/bin:/opt/rbenv/bin:/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` (the machine's own PATH with `/opt/node24/bin` in front; without it `node` is version 22) |
| Setup script | The whole of `scripts/cloud-setup.sh`, pasted |

No secret goes into this dialog. Whoever uses the environment can read its variables.

When `scripts/cloud-setup.sh` changes, paste it again: the copy in the dialog must equal the file.

The Claude GitHub App must be installed on `sodiqschoolapp/procurement` (GitHub: organization settings, GitHub Apps, Claude, repository access).

### 2. The trial

Start a session at claude.ai/code on this repository with the `procurement` environment and send:

```
Change nothing in the repository. First show the whole output of the session-start hook as you received it. Then run these and report every output in full:
echo $PATH; which node; node --version; npm --version;
docker compose ps;
docker compose exec -T postgres psql -U procurement -Atc "show cluster_name" -c "show server_version";
tail -n 40 /tmp/procurement-cloud-session-start.log
Then run npm run lint, npm run typecheck, npm test and npm run test:e2e, one after another, and report the last lines of each. If a step fails, do not fix anything: report the error in full.
```

Expected:

- `node --version` is 24.x and `which node` is `/opt/node24/bin/node`.
- `docker compose ps` shows the service `postgres` as healthy on `127.0.0.1:5433`.
- The two `psql` lines are `procurement-compose` and `17.` something.
- No line of the hook's output starts with `!!`.
- Lint and typecheck pass; `npm test` passes every unit and database test; `npm run test:e2e` passes at both widths.

Nothing is automated before this trial is green. It was green on 12.10.2026: every point above, 47 tests, both browser tests.

### 3. One task by hand in the cloud

Before any routine exists, one task is built in a cloud session with the owner passing the messages on, as on the laptop. It shows that a cloud session can push a branch, open a pull request and mark it ready.

1. Start a session at claude.ai/code on this repository with the `procurement` environment and send `/next-task`. It plans, opens a draft pull request and stops.
2. Paste its last message to the reviewer chat. When the `[review]` comment is on the pull request, send `/next-task` again in the same session; it builds. Then send `/finish-task`.
3. Paste its last message to the reviewer chat again. At `[review] ready to merge`, merge.

The session can be closed and opened again: `/next-task` in a new session finds the task's branch and goes on from it.

## Rules that keep it working

- A task that adds a name to `.env.example` also gives its local value in `scripts/cloud-session-start.sh`. A value that must stay secret is made up afresh in each session by that script; it is never written into the repository.
- A task that adds a service to `docker-compose.yml` adds its image to `scripts/cloud-setup.sh`, and the owner pastes the script again.
- A cloud session never points `DATABASE_URL` anywhere but at the local service. It holds invented data only.
- The hook loads from `.claude/settings.json` only in a session with one repository.

## What was learned

- 12.10.2026: the cloud machine has Docker, but its service is not running. Started by hand (`dockerd`), it runs containers and publishes a port on `127.0.0.1`. Tried on a cloud machine before the scripts were written. The image download could not be tried there (that session's network list had no Docker Hub); the trial shows it.
- 12.10.2026, the trial: the image download works with the default network list. `node` is 24 from `/opt/node24`; `npm` is the machine's own (10.9), running under Node 24. A new session downloads the Playwright browser again (about 120 MiB, a few seconds), because the machine's own copy is for another Playwright version and the kept disk does not hold ours; a session that is resumed has it.
- GitHub's GraphQL is blocked in a cloud session, so `gh pr ...` fails there. The skills use `gh api`; marking a pull request ready has its own address for cloud sessions (`.claude/skills/finish-task`).
