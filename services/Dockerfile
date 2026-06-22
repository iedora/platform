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
COPY . .
RUN bun install --frozen-lockfile --production --filter '@iedora/service-*'

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
