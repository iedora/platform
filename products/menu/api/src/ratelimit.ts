import type { Database } from "@iedora/service-runtime";
import { sql } from "kysely";

import { RateLimitError } from "./errors.ts";

// Sliding-window rate limiter backed by Postgres. Each check runs in one
// transaction under a per-key advisory lock: prune expired events, count the
// window, insert this
// one only when allowed (a denied request must not consume a slot). The table
// self-prunes; no Redis, no vacuum job.

interface Policy {
  name: string;
  limit: number;
  windowSeconds: number;
  failClosed: boolean; // outage behavior: deny (security/cost) vs allow (cosmetic)
}

const MINUTE = 60;
const HOUR = 3600;

export const Policies: Record<string, Policy> = {
  presign: { name: "presign", limit: 30, windowSeconds: MINUTE, failClosed: true },
  commit: { name: "commit", limit: 60, windowSeconds: MINUTE, failClosed: true },
  clear: { name: "clear", limit: 20, windowSeconds: MINUTE, failClosed: false },
  identity: { name: "identity", limit: 30, windowSeconds: MINUTE, failClosed: false },
  onboarding: { name: "onboarding", limit: 10, windowSeconds: HOUR, failClosed: false },
  beacon: { name: "beacon", limit: 600, windowSeconds: MINUTE, failClosed: false },
  // Per-restaurant cap bounds view inflation independent of IP/cookie.
  beacon_rest: { name: "beacon_rest", limit: 5000, windowSeconds: HOUR, failClosed: false },
};

const SWEEP_INTERVAL_MS = 60_000;

export class Limiter {
  // In-process sliding windows for the cosmetic (failClosed:false) policies —
  // beacon/identity/etc. are the highest-volume checks and don't need a Postgres
  // transaction + advisory lock each. On a single instance an in-memory counter
  // is exact; the security/cost-critical failClosed policies stay on Postgres.
  private readonly windows = new Map<string, number[]>(); // key -> in-window timestamps (ms, ascending)
  private lastSweep = 0;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly database: Database<any>,
    private readonly disabled = false,
  ) {}

  // allow records one event for `policy:scope`; resolves when within the limit,
  // throws RateLimitError when over it. Backend failures follow failClosed.
  async allow(policyName: string, scope: string): Promise<void> {
    if (this.disabled) return;
    const p = Policies[policyName];
    if (!p) throw new Error(`menu: unknown rate-limit policy ${policyName}`);
    const key = `${p.name}:${scope}`;

    if (!p.failClosed) {
      this.allowInProcess(p, key);
      return;
    }

    // Assigned from the transaction below; the catch always exits (throw or
    // return), so these are definitely set before the read after the try/catch.
    let count: number;
    let oldest: Date;
    try {
      const r = await this.database.root.transaction().execute(async (trx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`.execute(trx);
        await sql`
          DELETE FROM rate_limit_events
          WHERE key=${key} AND occurred_at < now() - make_interval(secs => ${p.windowSeconds})
        `.execute(trx);
        const res = await sql<{ count: string; oldest: Date }>`
          SELECT count(*)::text AS count, coalesce(min(occurred_at), now()) AS oldest
          FROM rate_limit_events WHERE key=${key}
        `.execute(trx);
        const row = res.rows[0]!;
        const n = Number(row.count);
        if (n < p.limit) {
          await sql`INSERT INTO rate_limit_events (key) VALUES (${key})`.execute(trx);
        }
        return { n, oldest: row.oldest };
      });
      count = r.n;
      oldest = r.oldest instanceof Date ? r.oldest : new Date(r.oldest);
    } catch (err) {
      console.warn(
        JSON.stringify({ level: "warn", msg: "rate limiter backend error", policy: p.name, err: String(err) }),
      );
      if (p.failClosed) throw new RateLimitError(p.windowSeconds);
      return;
    }
    if (count >= p.limit) {
      const retryMs = oldest.getTime() + p.windowSeconds * 1000 - Date.now();
      throw new RateLimitError(Math.max(1, Math.ceil(retryMs / 1000)));
    }
  }

  // In-memory sliding window: prune timestamps outside the window, then allow +
  // record only when under the limit (a denied request must not consume a slot),
  // mirroring the Postgres path's semantics and Retry-After.
  private allowInProcess(p: Policy, key: string): void {
    const now = Date.now();
    const windowMs = p.windowSeconds * 1000;
    const cutoff = now - windowMs;

    let times = this.windows.get(key);
    if (times) {
      let drop = 0;
      while (drop < times.length && times[drop]! <= cutoff) drop++;
      if (drop > 0) times.splice(0, drop); // events are appended in order → expired ones are at the front
    } else {
      times = [];
      this.windows.set(key, times);
    }

    if (times.length >= p.limit) {
      const retryMs = times[0]! + windowMs - now;
      throw new RateLimitError(Math.max(1, Math.ceil(retryMs / 1000)));
    }
    times.push(now);
    this.sweep(now);
  }

  // Periodically drop keys idle past their own window so memory tracks only
  // currently-active keys (the policy name is the key prefix before the first ':').
  private sweep(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;
    for (const [key, times] of this.windows) {
      const windowMs = (Policies[key.slice(0, key.indexOf(":"))]?.windowSeconds ?? HOUR) * 1000;
      if (times.length === 0 || times[times.length - 1]! <= now - windowMs) this.windows.delete(key);
    }
  }
}
