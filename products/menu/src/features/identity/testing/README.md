# identity/testing — slice E2E surface

Surfaces the Zitadel-side fixtures: org allocation and user→org binding.
The shim (`tests/e2e/_bootstrap.ts`) holds the registry in memory; this
slice owns the API to mutate it.

## Exports

- `seedOrg({ id?, name? })` — allocate a fresh org id.
- `bindUserToOrg(userId, org)` — register the mapping with the shim so
  `getEffectiveOrganizationId(userId)` resolves to `org.organizationId`.
- `resetShim()` — clear all mappings (use sparingly; per-test cleanup is
  usually enough via the `resetMenu` fixture).
- `orgMemberProfile` — bare authenticated profile.
- `identityRoutes` — `/onboarding`, `/onboarding/add-restaurant`.

## Multi-tenant pattern

For specs that need two separate tenants:

```ts
const orgA = seedOrg({ id: 'orgA', name: 'A' })
const orgB = seedOrg({ id: 'orgB', name: 'B' })
const a = await signInAs(ctxA, { profile: builderProfile, organizationId: orgA.organizationId, ... })
const b = await signInAs(ctxB, { profile: builderProfile, organizationId: orgB.organizationId, ... })
await bindUserToOrg(a.userId, orgA)
await bindUserToOrg(b.userId, orgB)
```
