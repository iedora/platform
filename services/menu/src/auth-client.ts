import type { Tenant, TenantWithOwner } from "@iedora/contracts";
import { ServiceClient } from "@iedora/server-kit";

import type { ServiceTokenSource } from "./billing";

// Tenant administration against the auth service (service-token authed):
// naming a restaurant's owner, listing tenants for the admin picker, and
// provisioning a new tenant when staff create a restaurant under a fresh one.
// `tenant()` returns null on 404 (gone / no owner) so the detail page degrades.

export interface TenantReader {
  tenant(tenantId: string): Promise<TenantWithOwner | null>;
  listTenants(): Promise<TenantWithOwner[]>;
  createTenant(name: string, ownerUserId: string): Promise<Tenant>;
  // Create a new user (with the given password) and make them the tenant's
  // owner — the tenant + its restaurants transfer to them (Option "new user").
  transferToNewOwner(
    tenantId: string,
    input: { email: string; name: string; password: string },
  ): Promise<{ ownerId: string }>;
}

export class AuthClient implements TenantReader {
  private readonly client: ServiceClient;

  constructor(base: string, tokens: ServiceTokenSource) {
    this.client = new ServiceClient(base, tokens, "auth");
  }

  tenant(tenantId: string): Promise<TenantWithOwner | null> {
    return this.client.get<TenantWithOwner>(`/auth/tenants/${encodeURIComponent(tenantId)}`, [404]);
  }

  async listTenants(): Promise<TenantWithOwner[]> {
    const { tenants } = await this.client.get<{ tenants: TenantWithOwner[] }>("/auth/admin/tenants");
    return tenants;
  }

  createTenant(name: string, ownerUserId: string): Promise<Tenant> {
    return this.client.post<Tenant>("/auth/admin/tenants", { name, ownerUserId });
  }

  transferToNewOwner(
    tenantId: string,
    input: { email: string; name: string; password: string },
  ): Promise<{ ownerId: string }> {
    return this.client.post<{ ownerId: string }>(
      `/auth/admin/tenants/${encodeURIComponent(tenantId)}/transfer-new-owner`,
      input,
    );
  }
}
