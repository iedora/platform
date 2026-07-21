import { readFileSync } from "node:fs"

/** Required env var; throws a clear error when unset/empty. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name]
  if (!v) throw new Error(`config: ${name} is required`)
  return v
}

/** Optional env var with a fallback default. */
export function env(name: string, fallback = "", src: NodeJS.ProcessEnv = process.env): string {
  return src[name] ?? fallback
}

/** Optional integer env var. Returns `fallback` when unset or unparseable. */
export function numEnv(name: string, fallback: number, src: NodeJS.ProcessEnv = process.env): number {
  const v = src[name]
  if (v === undefined || v === "") return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Optional boolean env var ("1"/"true"/"yes" → true). */
export function boolEnv(name: string, fallback = false, src: NodeJS.ProcessEnv = process.env): boolean {
  const v = src[name]?.toLowerCase()
  if (v === undefined || v === "") return fallback
  return v === "1" || v === "true" || v === "yes"
}

/**
 * The `_FILE` secret convention: for every `<NAME>_FILE` var pointing at a path,
 * read the file and set `<NAME>` to its trimmed contents — so a deploy can inject
 * secrets as mounted files (Docker/Kamal) without putting values in the process
 * env. An explicit non-empty `<NAME>` always wins.
 */
export function expandFileSecrets(src: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(src)) {
    if (!key.endsWith("_FILE")) continue
    const base = key.slice(0, -"_FILE".length)
    if (!base) continue
    const path = src[key]
    if (!path) continue
    if (src[base]) continue // explicit value wins
    src[base] = readFileSync(path, "utf8").trim()
    delete src[key]
  }
}

/** True for a production-like deployment (DEPLOYMENT_ENV = production|prod). */
export function isProd(src: NodeJS.ProcessEnv = process.env): boolean {
  const e = src.DEPLOYMENT_ENV
  return e === "production" || e === "prod"
}

/** Parse a duration ("500ms", "15m", "720h", "30d", "90s") into milliseconds;
 *  returns `fallbackMs` for an unparseable value. */
export function durationMs(s: string, fallbackMs: number): number {
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(s.trim())
  if (!m) return fallbackMs
  const n = Number(m[1])
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as string]
  return unit ? n * unit : fallbackMs
}
