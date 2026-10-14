#!/bin/sh
# The container's start (Dockerfile): migrate the database, then start the app. A failed
# migration ends the container before the app starts, so the new version never answers on
# /health and App Platform does not send traffic to it (build-plan 0.16, plan decision 2).
set -e
node scripts/db-migrate.mjs
exec node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-8080}"
