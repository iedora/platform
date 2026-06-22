import { readFileSync } from "node:fs";

// The _FILE secret convention: for every `<NAME>_FILE` env var pointing at a
// path, read the file and set `<NAME>` to its trimmed contents — so the deploy
// can inject secrets as mounted files (Docker/Kamal secrets) without putting
// values in the process env. An explicit non-empty `<NAME>` always wins.
export function expandFileSecrets(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(env)) {
    if (!key.endsWith("_FILE")) continue;
    const base = key.slice(0, -"_FILE".length);
    if (!base) continue;
    const path = env[key];
    if (!path) continue;
    if (env[base]) continue; // explicit value wins
    env[base] = readFileSync(path, "utf8").trim();
    delete env[key];
  }
}

/** Required env var; throws a clear error if unset/empty. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`config: ${name} is required`);
  return v;
}

/** Optional env var with a fallback default. */
export function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** True for a production-like deployment. */
export function isProd(): boolean {
  const e = process.env.DEPLOYMENT_ENV;
  return e === "production" || e === "prod";
}

/** Parses a duration string ("15m", "720h", "30d") into milliseconds; returns
 * `fallbackMs` for an unparseable value. Shared by every service's config. */
export function durationMs(s: string, fallbackMs: number): number {
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(s.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit: Record<string, number> = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return n * unit[m[2]!]!;
}

/**
 * Resolves the base URL of a sibling service role under Kamal. Kamal runs each
 * role as `<service>-<role>-<version>` on the shared `kamal` network with no
 * stable alias, injecting KAMAL_VERSION + KAMAL_CONTAINER_NAME; we reconstruct
 * the sibling's versioned name from our own. Falls back to localhost off-Kamal
 * (compose sets an explicit *_BASE_URL env that should win over this).
 * `selfRole` is the caller's own role (the suffix in its container name).
 */
export function siblingUrl(role: string, port: number, selfRole: string): string {
  const version = process.env.KAMAL_VERSION;
  const self = process.env.KAMAL_CONTAINER_NAME; // <service>-<selfRole>-<version>
  const suffix = `-${selfRole}-${version}`;
  if (version && self?.endsWith(suffix)) {
    const service = self.slice(0, -suffix.length); // <service> (e.g. iedora-backend)
    return `http://${service}-${role}-${version}:${port}`;
  }
  return `http://localhost:${port}`;
}
