import { hashPassword } from "@iedora/server-kit";

import { addMembership, createTenant, setTenantOwner } from "../../data/tenants";
import { createUserOr409 } from "../../data/users";
import type { AuthDeps } from "../../deps";
import type { RequestMeta } from "../../session";

// Provisions a tenant with the caller as owner (+ audit), all in one tx. Ports
// service.CreateTenant. The caller's current access token doesn't carry the new
// tid — the client refreshes, which re-resolves the default tenant.
export async function createTenantForUser(
  deps: AuthDeps,
  userId: string,
  name: string,
  meta: RequestMeta,
): Promise<{ id: string; name: string }> {
  return deps.db.runInTx(async () => {
    const id = await createTenant(deps.db.db, name);
    await addMembership(deps.db.db, { userId, tenantId: id, role: "owner" });
    await deps.auditor.recordSync({
      action: "auth.tenant.created",
      actor: { type: "user", id: userId },
      tenantId: id,
      targetType: "tenant",
      targetId: id,
      userAgent: meta.userAgent ?? undefined,
      ipHash: meta.ipHash ?? undefined,
    });
    return { id, name };
  });
}

// Transfer a tenant to a BRAND-NEW user: create the user with the given password
// (so they can log straight in) and make them the tenant's sole owner — the
// tenant + all its restaurants move to them. The new user skips onboarding
// because the tenant already has a restaurant. 409 if the email is taken.
export async function transferTenantToNewOwner(
  deps: AuthDeps,
  tenantId: string,
  input: { email: string; name: string; password: string },
  meta: RequestMeta,
): Promise<{ ownerId: string }> {
  const passwordHash = await hashPassword(input.password);
  return deps.db.runInTx(async () => {
    const user = await createUserOr409(deps.db.db, { email: input.email, passwordHash, name: input.name });
    await setTenantOwner(deps.db.db, tenantId, user.id);
    await deps.auditor.recordSync({
      action: "auth.tenant.owner_transferred",
      actor: { type: "user", id: user.id },
      tenantId,
      targetType: "tenant",
      targetId: tenantId,
      meta: { newOwnerEmail: input.email, reason: "transfer_new_user" },
      userAgent: meta.userAgent ?? undefined,
      ipHash: meta.ipHash ?? undefined,
    });
    return { ownerId: user.id };
  });
}
