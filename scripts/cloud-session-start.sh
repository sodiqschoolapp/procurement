#!/usr/bin/env bash
# SessionStart hook (see .claude/settings.json). On a laptop it does nothing.
# In a Claude Code cloud session it prepares the clone, with the same commands
# README.md gives a person: the local .env, `docker compose up`, `npm ci`,
# `npm run db:migrate` (docs/cloud-loop.md).
#
# The database is the PostgreSQL service of docker-compose.yml, as on a laptop
# and in CI, so the tests meet the same server everywhere. The cloud machine is
# thrown away with the session and holds invented data only. Nothing here is a
# secret.
#
# It never aborts: a step that fails says so, and the session reports it.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
export PATH=/opt/node24/bin:$PATH

# The local address of README.md, "Run it". It holds no secret: the local
# database has no password and answers on this machine only.
LOCAL_DATABASE_URL="postgres://procurement@127.0.0.1:5433/procurement"
LOG=/tmp/procurement-cloud-session-start.log
: > "$LOG"

step() { echo; echo "== $*"; }
failed() { echo "!! $* failed"; }
# Runs a noisy command quietly; on failure shows the end of what it printed.
quietly() {
  local before
  before=$(wc -c < "$LOG")
  if "$@" >> "$LOG" 2>&1; then return 0; fi
  tail -c "+$((before + 1))" "$LOG" | tail -n 15
  return 1
}
as_root() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo -n "$@"; fi
}

step "cloud session start"
echo "node: $(command -v node || echo none) $(node --version 2>/dev/null || true)"
echo "npm: $(command -v npm || echo none) $(npm --version 2>/dev/null || true)"
case "$(node --version 2>/dev/null)" in
  v24.*) ;;
  *) echo "!! node is not 24 here; the environment variable PATH must start with /opt/node24/bin (docs/cloud-loop.md)" ;;
esac

step ".env (the public local address)"
# .env.example holds names only. The one value so far is the local database
# address. A task that adds a name to .env.example also gives its local value
# here; a value that must stay secret is made up afresh in each session and
# never written into this file.
if [ -f .env ]; then
  echo "kept the .env that is there"
else
  echo "DATABASE_URL=$LOCAL_DATABASE_URL" > .env
  echo "written"
fi

install_packages() {
  # npm ci removes node_modules and installs again, which takes minutes. A
  # session that is resumed with an unchanged package-lock.json skips it.
  local wanted stamp=node_modules/.cloud-session-lock
  wanted=$(sha256sum package-lock.json | cut -d' ' -f1)
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$wanted" ]; then
    echo "node_modules matches package-lock.json"
    return 0
  fi
  # Without the registry npm waits for minutes before it gives up. Asking
  # first keeps a session whose network does not allow npm from hanging here.
  if ! timeout 20 npm ping > /dev/null 2>&1; then
    echo "the npm registry cannot be reached from this session"
    return 1
  fi
  quietly timeout 600 npm ci --no-audit --no-fund --loglevel=error || return 1
  echo "$wanted" > "$stamp"
  echo "installed"
}

# The review environment sets PROCUREMENT_REVIEW_ONLY=1: a review reads code
# and the result of CI, so it needs the packages but no database.
if [ "${PROCUREMENT_REVIEW_ONLY:-}" = "1" ]; then
  step "review session: packages only"
  install_packages || failed "npm ci"
  step "ready"
  exit 0
fi

step "PostgreSQL (docker compose up)"
# The machine has Docker, but its service does not run by itself, and what is
# kept of a machine is its disk, not its running programs. So the service is
# started here, detached from this script.
docker_ready() { as_root docker info >/dev/null 2>&1; }
database_ready=no
if ! command -v docker >/dev/null 2>&1; then
  failed "Docker is not on this machine"
else
  if ! docker_ready; then
    as_root sh -c 'setsid nohup dockerd >> /var/log/dockerd.log 2>&1 < /dev/null &'
    for _ in $(seq 1 30); do
      if docker_ready; then break; fi
      sleep 1
    done
  fi
  if ! docker_ready; then
    failed "Docker did not start ($(as_root tail -n 2 /var/log/dockerd.log 2>/dev/null | tr '\n' ' '))"
  # --wait returns when the health check of docker-compose.yml passes.
  elif ! quietly as_root timeout 300 docker compose up -d --wait; then
    failed "docker compose up"
  else
    shown=$(as_root docker compose exec -T postgres psql -U procurement -Atc "show cluster_name" 2>> "$LOG")
    version=$(as_root docker compose exec -T postgres psql -U procurement -Atc "show server_version" 2>> "$LOG")
    if [ -n "$shown" ]; then
      database_ready=yes
      echo "PostgreSQL $version answers as \"$shown\" on $(as_root docker compose port postgres 5432 2>/dev/null)"
    else
      failed "the check of the database (see $LOG)"
    fi
  fi
fi

step "packages"
packages_ready=no
if install_packages; then packages_ready=yes; else failed "npm ci"; fi

step "migrations"
if [ "$database_ready" = yes ] && [ "$packages_ready" = yes ]; then
  npm run --silent db:migrate || failed "npm run db:migrate"
else
  echo "skipped: the database or the packages are not ready"
fi

step "the browser for Playwright"
# The machine carries a Chromium for one Playwright version, and the variable
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD stops a download. This asks for the browser
# of the version in package-lock.json; it is quick when it is there. If it
# fails, the browser tests cannot run in this session; CI runs them.
if [ "$packages_ready" = yes ]; then
  quietly timeout 300 env -u PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD npx playwright install chromium --only-shell \
    && echo "there" || failed "the browser download (npm run test:e2e will not run here)"
else
  echo "skipped: the packages are not ready"
fi

step "ready"
exit 0
