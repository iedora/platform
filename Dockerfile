# syntax=docker/dockerfile:1.24
#
# Production Dockerfile for the iedora frontend (`apps/web`) — a Next.js 16
# app (App Router, `output: 'standalone'`) inside a Bun workspaces monorepo.
# Built and deployed by Kamal 2.
#
# ── Build context is the REPO ROOT ───────────────────────────────────────────
# Kamal builds from the repo root, so this file lives at the root. The build
# needs the whole workspace (root manifest + lockfile + every package the web
# app's `workspace:*` deps resolve to), not just apps/web.
#
# ── pnpm installs, Node builds ───────────────────────────────────────────────
# pnpm is the package manager (resolves `workspace:*` + `catalog:` specifiers
# from pnpm-lock.yaml). Node is the runtime and the builder: Stage 1 installs
# deps, Stages 2-3 build/run on Node over Next's standalone output.
#
# ── Kamal `web` role config (matches what this image serves) ─────────────────
#   • Port:        3000   (Next binds PORT=3000, HOSTNAME=0.0.0.0)
#   • Health path: /up     (app/up/route.ts → 200 {"ok":true}, unauthenticated,
#                           force-dynamic; kamal-proxy should health-check /up)
#   • Start:       node server.js   (Next standalone server, CWD apps/web)
#
# All three stages are glibc (Debian) — no musl→glibc handoff keeps any native
# prebuilts (e.g. sharp) consistent across install → build → runtime.
#
# Node version is declared once via ARG (Next.js 16 official pattern); bump to
# track LTS. The Bun base image is pinned by digest — it changes less often.
ARG NODE_VERSION=24.17.0-bookworm-slim

# ── Stage 1: dependencies (pnpm) ──────────────────────────────────────────────
# pnpm is the package manager (matches services/Dockerfile + the version pinned
# in package.json::packageManager), resolving workspace:* + catalog: from
# pnpm-lock.yaml. Node base so install and build share one glibc toolchain.
FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace
RUN npm install -g pnpm@11.15.1

# Copy lockfile + manifests first so the install layer caches independently of
# source changes. tsconfig.base.json is required: every per-package tsconfig
# extends "../../tsconfig.base.json" and its absence breaks the build.
# COPY --link makes each layer independently cacheable.
COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# ALL workspaces named in pnpm-workspace.yaml must be present so `pnpm install
# --frozen-lockfile` resolves the same graph the lockfile describes:
#   - packages/* → @iedora/{api-client,contracts,server-kit,design-system,…}
#   - products/* → @iedora/product-menu
#   - services/* → the Node backend services (@iedora/service-*). The frontend
#     doesn't import them, but the SINGLE shared pnpm-lock.yaml lists them, so a
#     frozen install mismatches unless their manifests are in the build context.
# These trees hold real .ts/.tsx source (workspace exports point at source).
COPY --link packages packages
COPY --link products products
COPY --link services services
COPY --link apps/web/package.json apps/web/package.json

# BuildKit cache mount keeps pnpm's content-addressable store warm across
# rebuilds; the cache layer never ships in the image. No --prod: the build stage
# needs devDeps (next, typescript); Next's standalone output drops them at runtime.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# ── Stage 2: build (Node) ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /workspace

# Bring the ENTIRE installed /workspace from deps — this carries every
# workspace's node_modules tree (including transitives symlinked into Bun's
# store). Copying only root + apps/web/node_modules misses workspace transitives
# and fails in a clean CI build.
COPY --from=deps /workspace ./
# Overlay apps/web source (deps only had its package.json). products/ already
# came in via the deps stage with real source.
COPY apps/web apps/web

WORKDIR /workspace/apps/web

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# SKIP_ENV_VALIDATION returns a build-time env stub so Next can collect page
# data without real secrets. Runtime env is injected by Kamal at deploy time.
ENV SKIP_ENV_VALIDATION=1

# Version skew protection. Kamal passes VERSION (commit SHA) as a build arg;
# next.config.ts embeds it as deploymentId so the running container forces a
# hard navigation when a client holds assets from an older deployment.
ARG VERSION
ENV DEPLOYMENT_VERSION=${VERSION}

# Public surface URLs are PLAIN runtime env (BRAND_URL, MENU_SURFACE_URL), NOT
# NEXT_PUBLIC_* — they are NOT baked here, so one image serves every
# environment. Kamal injects per-env values at runtime.
# Invoke `next` directly with the workspace-root bin dir on PATH. The hoisted
# node-linker puts next's bin only at /workspace/node_modules/.bin (apps/web has
# no local .bin/next), and pnpm's own run/exec resolve to that missing local
# path under hoisting — so bypass pnpm here.
RUN --mount=type=cache,target=/workspace/apps/web/.next/cache,sharing=locked \
    PATH="/workspace/node_modules/.bin:$PATH" next build

# ── Stage 3: runtime (Node, minimal) ──────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next standalone reads PORT/HOSTNAME at process start. HOSTNAME=0.0.0.0 binds
# publicly so kamal-proxy (and the container healthcheck) can reach it.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Same deployment version as the builder stage so the running process matches
# the embedded deploymentId for version-skew detection.
ARG VERSION
ENV DEPLOYMENT_VERSION=${VERSION}

# Non-root runtime user (Debian groupadd/useradd). libjemalloc2 replaces glibc's
# default allocator — sharp (Next image optimisation) fragments it. LD_PRELOAD
# is read by the dynamic linker at process start, applying to Node + children.
RUN groupadd --system --gid 1001 nextjs && \
    useradd --system --uid 1001 --gid nextjs --no-create-home --shell /usr/sbin/nologin nextjs && \
    apt-get update && \
    apt-get install -y --no-install-recommends libjemalloc2 && \
    rm -rf /var/lib/apt/lists/* && \
    ln -s "$(find /usr/lib -name 'libjemalloc.so.2' | head -1)" /usr/local/lib/libjemalloc.so.2
# Arch-independent (resolves x86_64 / aarch64 multiarch path at build time) — the
# deploy target is amd64, but this works for either without hardcoding the triplet.
ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so.2

# Next standalone in a monorepo lays out under apps/web/. The traced
# node_modules sit at the standalone root; server.js is at apps/web/server.js.
COPY --from=builder --chown=nextjs:nextjs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nextjs /workspace/apps/web/public ./apps/web/public

# Next writes prerender + optimized-image caches under .next/cache on first
# request. Pre-create it owned by the runtime user so the first request doesn't
# EPERM under the non-root user.
RUN mkdir -p ./apps/web/.next/cache && chown nextjs:nextjs ./apps/web/.next/cache

USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000

# Container-level healthcheck. /up returns 200 as soon as server.js binds the
# port; kamal-proxy should health-check the same path. Node 24's global fetch
# covers it — no curl needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/up').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# OCI image metadata. VERSION is the deploy version (commit SHA) passed by Kamal.
ARG VERSION
LABEL org.opencontainers.image.title="iedora-app" \
      org.opencontainers.image.description="iedora app — Next.js 16 web shell (apps/web)" \
      org.opencontainers.image.source="https://github.com/iedora/app" \
      org.opencontainers.image.version="${VERSION}"

CMD ["node", "server.js"]
