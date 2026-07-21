/**
 * Hono backend base URLs, server-side only (the browser never calls the
 * services directly — everything goes through Next server code).
 *
 * Dev defaults match the local `compose.yaml` host ports (the `iedora-api-*`
 * stack); prod points at the swarm-internal DNS names (e.g. `http://auth:8080`).
 */
export const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:8180'
