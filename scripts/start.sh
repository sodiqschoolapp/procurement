#!/bin/sh
# The container's start (Dockerfile): migrate the database, then start the app. A failed
# migration ends the container before the app starts, so the new version never answers on
# /health and App Platform does not send traffic to it (build-plan 0.16, plan decision 2).
set -e
node scripts/db-migrate.mjs
# The demo users of the test copy (build-plan 0.15, plan decision 1): only with SEED_DEMO_DATA
# exactly "yes", which production never sets. The seed keeps what is there, so it runs on every
# deploy. It is demo data: a failed seed is logged and the app starts all the same.
if [ "${SEED_DEMO_DATA:-}" = "yes" ]; then
  node scripts/db-seed.mjs || echo "db:seed failed: the app starts without the missing demo users (the line above says why)."
fi
exec node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-8080}"
