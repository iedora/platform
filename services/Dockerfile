# syntax=docker/dockerfile:1
# Production image for the iedora backend services (Node, monorepo). ONE image;
# the service is selected at deploy time by the CMD/args, e.g.
#   command: ["node","services/auth/src/index.ts"]
#   migrate: ["node","services/auth/src/migrate.ts"]
# Build context is the repo root:
#   docker build -f services/Dockerfile -t ghcr.io/iedora/api .
#
# Node 26 runs TypeScript directly (stable strip-only type-stripping — no build
# step). pnpm is the package manager (corepack activates the version pinned in
# package.json::packageManager). `--prod` drops devDeps (tsgo, eslint, vitest).
ARG NODE_VERSION=26.5.0-slim
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN npm install -g pnpm@11.15.1

# Manifests + lockfile FIRST so the install layer caches independently of source.
# A frozen install needs every workspace manifest present to resolve the same
# graph pnpm-lock.yaml describes, so all workspace trees named in the workspace
# globs are copied: packages/* + products/* + services/* carry real .ts source
# (workspace exports point at source); apps/web + integration need only their
# manifest to satisfy the workspace declaration.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY products products
COPY services services
COPY apps/web/package.json apps/web/package.json

# BuildKit cache mount keeps pnpm's content-addressable store warm across
# rebuilds; the cache layer never ships in the image.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
USER node
# Every boot migrates the started service's database before running it (see
# services/docker-entrypoint.sh). The entrypoint derives the service from the
# CMD/args, so each Kamal role migrates only its own DB; compose reuses the
# same script in dev, so dev and prod migrate-before-serve identically.
ENTRYPOINT ["sh", "services/docker-entrypoint.sh"]
# Default role; overridden per Kamal role. Each service serves /up for health.
CMD ["node", "services/auth/src/index.ts"]
