#!/usr/bin/env bash
# Setup script of the Claude Code cloud environment for this repository.
#
# It is pasted into the environment's "Setup script" field at claude.ai/code
# (docs/cloud-loop.md says where). The copy there must equal this file.
# It runs as root on the fresh machine before Claude starts, and what it leaves
# on disk is kept for about a week, so it only prepares the machine: Node 24
# and the PostgreSQL image of docker-compose.yml. What belongs to the clone of
# the repository (the running database, the packages, the migrations) is done
# at every session start by scripts/cloud-session-start.sh.
#
# - The machine has Docker, but its service is not running; this script and
#   the session start each start it.
# - /opt/node22/bin comes first on the session's PATH, so the environment sets
#   PATH with /opt/node24/bin in front.
# - The repository may not be in this directory yet while the script runs, so
#   it does not depend on any file of the repository.
# The script never aborts: a step that fails says so and the session still
# starts, so that the session can report it. Keep it under five minutes, or
# its result is not kept.
set -uo pipefail

# Must equal the image of docker-compose.yml.
POSTGRES_IMAGE=postgres:17

step() { echo; echo "== $*"; }
failed() { echo "!! $* failed"; }

step "machine"
echo "cwd=$(pwd)"
echo "PATH=$PATH"
echo "node on PATH: $(command -v node || echo none) $(node --version 2>/dev/null || true)"
ls -d /opt/node* 2>/dev/null || true

step "Node 24"
# The machine has Node 20, 21 and 22 under /opt. The npm package "node" carries
# the official program and comes from the npm registry; nodejs.org is the
# fallback.
install_node24_npm() { timeout 120 npm install -g --prefix /opt/node24 node@24 >/dev/null 2>&1; }
install_node24_dist() {
  local version
  version=$(curl -fsSL https://nodejs.org/dist/index.json \
    | python3 -c 'import json,sys; print(next(v["version"] for v in json.load(sys.stdin) if v["version"].startswith("v24.")))') || return 1
  curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.xz" -o /tmp/node24.tar.xz || return 1
  rm -rf /opt/node24 "/opt/node-$version-linux-x64"
  tar -xJf /tmp/node24.tar.xz -C /opt || return 1
  ln -sfn "/opt/node-$version-linux-x64" /opt/node24
  rm -f /tmp/node24.tar.xz
}
if [ -x /opt/node24/bin/node ]; then
  echo "already there"
elif install_node24_npm && [ -x /opt/node24/bin/node ]; then
  echo "installed from the npm registry"
elif install_node24_dist; then
  echo "installed from nodejs.org"
else
  failed "Node 24 install"
fi
if [ -x /opt/node24/bin/node ]; then
  echo "/opt/node24/bin/node is $(/opt/node24/bin/node --version)"
  echo 'export PATH=/opt/node24/bin:$PATH' > /etc/profile.d/node24.sh
  export PATH=/opt/node24/bin:$PATH
  # The "node" package may bring no npm of its own; the machine's npm then runs under it.
  echo "npm: $(command -v npm || echo none) $(npm --version 2>/dev/null || true)"
else
  failed "no /opt/node24/bin/node"
fi

step "Docker and the PostgreSQL image"
# The image is downloaded once here, so that a session start finds it on disk.
docker_ready() { docker info >/dev/null 2>&1; }
if ! docker_ready; then
  setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &
  for _ in $(seq 1 30); do
    if docker_ready; then break; fi
    sleep 1
  done
fi
if docker_ready; then
  if timeout 180 docker pull -q "$POSTGRES_IMAGE"; then
    docker image ls "$POSTGRES_IMAGE"
  else
    failed "docker pull $POSTGRES_IMAGE (the session start tries again)"
  fi
  # What is kept is the disk, not running programs. Docker is stopped cleanly
  # so that the image is whole on disk.
  if [ -f /var/run/docker.pid ]; then
    kill "$(cat /var/run/docker.pid)" 2>/dev/null || true
    for _ in $(seq 1 20); do
      [ -f /var/run/docker.pid ] || break
      sleep 1
    done
  fi
else
  failed "Docker did not start ($(tail -n 2 /var/log/dockerd.log 2>/dev/null | tr '\n' ' '))"
fi

step "warm the npm cache"
# If the repository is already in this directory, install once so that npm's
# cache is part of what is kept; the session start installs again, fast.
if [ -f package-lock.json ]; then
  timeout 150 npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1 && echo "cache warmed" || failed "npm ci (the session start installs instead)"
else
  echo "not in the repository directory; the session start installs"
fi

step "setup done"
exit 0
