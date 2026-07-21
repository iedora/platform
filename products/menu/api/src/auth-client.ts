import type {
  AdminUser,
  AdminUserDetail,
  AdminUserSession,
  Tenant,
  TenantWithOwner,
} from "@iedora/contracts";
import { ServiceClient } from "@iedora/service-runtime";

import type { ServiceTokenSource } from "./billing.ts";

// User administration for the staff "Users" CRM. `getUser` returns null on 404
// so the detail page can 404 cleanly. The write methods drive the account
// actions (force a password change, set a temporary password, kick a device).
export interface UserReader {
  listUsers(q?: string): Promise<AdminUser[]>;
  getUser(id: string): Promise<AdminUserDetail | null>;
  getUserSessions(id: string): Promise<AdminUserSession[]>;
  forcePasswordChange(id: string): Promise<void>;
  setUserPassword(id: string, password: string): Promise<void>;
  revokeUserSession(id: string, familyId: string): Promise<void>;
}

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

export class AuthClient implements TenantReader, UserReader {
  private readonly client: ServiceClient;

  constructor(base: string, tokens: ServiceTokenSource) {
    this.client = new ServiceClient(base, tokens, "auth");
  }

  async listUsers(q?: string): Promise<AdminUser[]> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    const { users } = await this.client.get<{ users: AdminUser[] }>(`/auth/admin/users${qs}`);
    return users;
  }

  getUser(id: string): Promise<AdminUserDetail | null> {
    return this.client.get<AdminUserDetail>(`/auth/admin/users/${encodeURIComponent(id)}`, [404]);
  }

  async getUserSessions(id: string): Promise<AdminUserSession[]> {
    const { sessions } = await this.client.get<{ sessions: AdminUserSession[] }>(
      `/auth/admin/users/${encodeURIComponent(id)}/sessions`,
    );
    return sessions;
  }

  async forcePasswordChange(id: string): Promise<void> {
    await this.client.post(`/auth/admin/users/${encodeURIComponent(id)}/force-password-change`, {});
  }

  async setUserPassword(id: string, password: string): Promise<void> {
    await this.client.post(`/auth/admin/users/${encodeURIComponent(id)}/set-password`, { password });
  }

  async revokeUserSession(id: string, familyId: string): Promise<void> {
    await this.client.post(
      `/auth/admin/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(familyId)}/revoke`,
      {},
    );
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
