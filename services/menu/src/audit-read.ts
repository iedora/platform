import type { AuditRecord } from "@iedora/contracts";
import { ServiceClient } from "@iedora/server-kit";

import type { ServiceTokenSource } from "./billing";

// Reads audit trails from the audit service's query API (service-token authed).
// Going over HTTP rather than reading the audit_log table directly keeps the
// menu service decoupled from the audit schema and consistent with how it reads
// billing/auth. `forTarget` filters by a single target (a restaurant);
// `forTenant` returns the whole tenant's activity (payments, plan changes, every
// restaurant under it) — what the admin Activity tab shows.

export interface AuditReader {
  forTarget(targetId: string, limit: number): Promise<AuditRecord[]>;
  forTenant(tenantId: string, limit: number): Promise<AuditRecord[]>;
}

export class AuditHttpReader implements AuditReader {
  private readonly client: ServiceClient;

  constructor(base: string, tokens: ServiceTokenSource) {
    this.client = new ServiceClient(base, tokens, "audit");
  }

  async forTarget(targetId: string, limit: number): Promise<AuditRecord[]> {
    const out = await this.client.get<{ events: AuditRecord[] }>(
      `/obs/events?target=${encodeURIComponent(targetId)}&limit=${limit}`,
    );
    return out.events;
  }

  async forTenant(tenantId: string, limit: number): Promise<AuditRecord[]> {
    const out = await this.client.get<{ events: AuditRecord[] }>(
      `/obs/events?tenant=${encodeURIComponent(tenantId)}&limit=${limit}`,
    );
    return out.events;
  }
}
