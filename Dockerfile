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
# The demo users of the test copy and the storage check (build-plan 0.15). tests/image-files.test.ts
# checks that every file these import is copied here.
COPY scripts/db-seed.mjs scripts/seed.mjs scripts/seed-catalogs.mjs scripts/first-head.mjs scripts/storage-check.mjs scripts/ensure-bucket.mjs ./scripts/
COPY src/server/audit-row.mjs ./src/server/audit-row.mjs
COPY src/server/auth/password-user.mjs ./src/server/auth/password-user.mjs
COPY src/domain/audit-secrets.mjs ./src/domain/audit-secrets.mjs
USER node
EXPOSE 8080
CMD ["sh", "scripts/start.sh"]
