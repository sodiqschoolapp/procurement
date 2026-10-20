#!/bin/sh
# The container's start (Dockerfile): migrate the database, then start the app. A failed
# migration ends the container before the app starts, so the new version never answers on
# /health and App Platform does not send traffic to it (build-plan 0.16, plan decision 2).
set -e
node scripts/db-migrate.mjs
# The demo users and invented data of the trial (build-plan 0.15 and 9.4; D52): only with
# SEED_DEMO_DATA exactly "yes", which the live app sets until the trial ends (9.5); after
# `npm run trial:reset` the seed refuses whatever the variable says. The seed keeps what is
# there, so it runs on every deploy. It is demo data: a failed seed is logged and the app starts all the same.
if [ "${SEED_DEMO_DATA:-}" = "yes" ]; then
  node scripts/db-seed.mjs || echo "db:seed failed: the app starts without the missing demo users (the line above says why)."
fi
exec node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-8080}"
