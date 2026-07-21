import type { AuditRecord } from "@iedora/contracts";
import { ServiceClient } from "@iedora/service-runtime";

import type { ServiceTokenSource } from "./billing.ts";

// Reads audit trails from the audit service's query API (service-token authed).
// Going over HTTP rather than reading the audit_log table directly keeps the
// menu service decoupled from the audit schema and consistent with how it reads
// billing/auth. `forTarget` filters by a single target (a restaurant);
// `forTenant` returns the whole tenant's activity (payments, plan changes, every
// restaurant under it) — what the admin Activity tab shows.

export interface AuditReader {
  forTarget(targetId: string, limit: number): Promise<AuditRecord[]>;
  forTenant(tenantId: string, limit: number): Promise<AuditRecord[]>;
  // Everything a single actor (user) did, across every tenant and domain — the
  // staff Users CRM activity timeline (logins, failures, restaurants, plans,
  // payments, edits). Keyed by actor_id, not tenant. An optional `action`
  // prefix narrows it (e.g. "auth.session.login" for the login-attempts view).
  forActor(actorId: string, limit: number, action?: string): Promise<AuditRecord[]>;
}

export class AuditHttpReader implements AuditReader {
  private readonly client: ServiceClient;

  constructor(base: string, tokens: ServiceTokenSource) {
    this.client = new ServiceClient(base, tokens, "audit");
  }

  // One filtered read for every view — URLSearchParams handles encoding, so the
  // three public helpers are just named filter shapes over it.
  private async query(filters: Record<string, string>, limit: number): Promise<AuditRecord[]> {
    const qs = new URLSearchParams({ ...filters, limit: String(limit) });
    const out = await this.client.get<{ events: AuditRecord[] }>(`/obs/events?${qs}`);
    return out.events;
  }

  forTarget(targetId: string, limit: number): Promise<AuditRecord[]> {
    return this.query({ target: targetId }, limit);
  }

  forTenant(tenantId: string, limit: number): Promise<AuditRecord[]> {
    return this.query({ tenant: tenantId }, limit);
  }

  forActor(actorId: string, limit: number, action?: string): Promise<AuditRecord[]> {
    return this.query({ actor: actorId, ...(action ? { action } : {}) }, limit);
  }
}
