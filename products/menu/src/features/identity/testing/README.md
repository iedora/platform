# identity/testing — slice E2E surface

Zitadel-side fixtures: org allocation + user→org binding against the
shim (`tests/e2e/_bootstrap.ts` holds the registry in memory).

Exports:

- `seedOrg({ id?, name? })` — allocate a fresh org id.
- `bindUserToOrg(userId, org)` — register the mapping with the shim so
  `getEffectiveOrganizationId(userId)` resolves to `org.organizationId`.
- `resetShim()` — clear all mappings (rarely needed; the `resetMenu`
  auto-fixture handles per-test cleanup).
- `orgMemberProfile` — bare authenticated profile.
- `identityRoutes` — `/onboarding`, `/onboarding/add-restaurant`.

Canonical multi-tenant setup (used by
`tests/e2e/journeys/tenant-isolation.spec.ts`):

```ts
const orgA = seedOrg({ id: 'orgA', name: 'A' })
const orgB = seedOrg({ id: 'orgB', name: 'B' })
const a = await signInAs(ctxA, { profile: builderProfile, organizationId: orgA.organizationId, ... })
const b = await signInAs(ctxB, { profile: builderProfile, organizationId: orgB.organizationId, ... })
await bindUserToOrg(a.userId, orgA)
await bindUserToOrg(b.userId, orgB)
```
