# The app's image (build-plan 0.16). App Platform builds it from this file on every push to main
# (.do/app.yaml); CI builds it on every pull request and starts it against the CI database.
# The container migrates the database first and starts the app only when that worked
# (scripts/start.sh). No secret is used to build it: the database address arrives at run time.

# Node.js 24 (.nvmrc), pinned to one image like the actions of ci.yml; the tag is the comment.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

# Every package, for the build.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The production packages only. The migration needs drizzle-orm's migrator and pg, which the
# standalone output of Next.js would leave out (plan decision 10).
FROM ${NODE_IMAGE} AS packages
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM ${NODE_IMAGE} AS run
WORKDIR /app
# pg_dump 17, the server's major version, for the weekly copy (build-plan 8.2; scripts/db-copy.mjs;
# plan of 8.2, decided item 3, Look first): Debian's own client is 15 and refuses a server of 17.
# The PostgreSQL project's apt repository is added by the script Debian's signed postgresql-common
# package ships, with the key it carries; the build stops unless pg_dump says 17.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates postgresql-common \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
 && apt-get install --yes --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/* \
 && pg_dump --version | grep --quiet ' 17\.'
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080
COPY --from=packages /app/node_modules ./node_modules
COPY package.json next.config.ts ./
COPY public ./public
# The fonts of the order list PDF, read from disk at run time (plan of 2.14, decided item 9).
COPY src/features/orders/download/fonts ./src/features/orders/download/fonts
# Next.js writes its cache under .next/ while it runs, so the user `node` owns it.
COPY --from=build --chown=node:node /app/.next ./.next
# What the migration needs before the app starts.
COPY drizzle ./drizzle
COPY scripts/start.sh scripts/db-migrate.mjs scripts/apply-migrations.mjs ./scripts/
COPY src/server/db/connection-options.mjs ./src/server/db/connection-options.mjs
# The demo users of the trial, the storage check (build-plan 0.15), the copy made from the
# console (8.2), a Head's password renewed from the console (8.2b), and the end of the trial and
# the first Head, run in the console at 9.5 (9.4). tests/image-files.test.ts checks that every
# file these import is copied here.
COPY scripts/db-seed.mjs scripts/seed.mjs scripts/seed-catalogs.mjs scripts/seed-orders.mjs scripts/seed-stock.mjs scripts/first-head.mjs scripts/head-password.mjs scripts/renew-head.mjs scripts/ask-hidden.mjs scripts/storage-check.mjs scripts/ensure-bucket.mjs scripts/db-copy.mjs scripts/trial-end.mjs scripts/trial-reset.mjs scripts/create-first-head.mjs ./scripts/
COPY src/server/audit-row.mjs ./src/server/audit-row.mjs
COPY src/server/auth/password-user.mjs ./src/server/auth/password-user.mjs
COPY src/domain/audit-secrets.mjs ./src/domain/audit-secrets.mjs
USER node
EXPOSE 8080
CMD ["sh", "scripts/start.sh"]
