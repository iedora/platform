# syntax=docker/dockerfile:1
# Production image for the iedora backend services (Bun, monorepo). ONE image;
# the service is selected at deploy time by the CMD/args, e.g.
#   command: ["bun","run","services/auth/src/index.ts"]
#   migrate: ["bun","run","services/auth/src/migrate.ts"]
# Build context is the repo root:
#   docker build -f services/Dockerfile -t ghcr.io/iedora/services .
#
# Bun runs TypeScript directly — no compile step. `--filter '@iedora/service-*'`
# installs only the backend workspaces + their workspace deps (server-kit,
# contracts), so the Next app / product deps never enter the image; `--production`
# drops devDeps (kysely-codegen, pg, tsgo, eslint).
FROM oven/bun:1.3.13-alpine AS deps
WORKDIR /app

# Manifests + lockfile FIRST so the install layer caches independently of source.
# Previously this stage did `COPY . .` before install, so ANY repo change (docs,
# dotnet/, apps/web, …) busted the cached `bun install`. A frozen install still
# needs every workspace manifest present to resolve the same graph the single
# shared bun.lock describes, so all workspace trees named in the root
# package.json are copied: packages/* + products/* + services/* carry real .ts
# source (workspace exports point at source); apps/web + integration need only
# their manifest to satisfy the workspace declaration. dotnet/, openapi/,
# scripts/, docs, and apps/web source never enter the image now — smaller image,
# faster node pull on deploy.
COPY package.json bun.lock tsconfig.base.json ./
COPY packages packages
COPY products products
COPY services services
COPY apps/web/package.json apps/web/package.json
COPY integration/package.json integration/package.json

# BuildKit cache mount keeps Bun's global module cache warm across rebuilds; the
# cache layer never ships in the image. Even when a manifest change re-runs the
# install, packages are restored from cache instead of re-downloaded.
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production --filter '@iedora/service-*'

FROM oven/bun:1.3.13-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
USER bun
# Every boot migrates the started service's database before running it (see
# services/docker-entrypoint.sh). The entrypoint derives the service from the
# CMD/args, so each Kamal role migrates only its own DB; compose reuses the
# same script in dev, so dev and prod migrate-before-serve identically.
ENTRYPOINT ["sh", "services/docker-entrypoint.sh"]
# Default role; overridden per Kamal role. Each service serves /up for health.
CMD ["bun", "run", "services/auth/src/index.ts"]
