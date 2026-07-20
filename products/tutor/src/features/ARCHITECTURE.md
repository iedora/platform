# Feature vertical slices

Every feature is a self-contained vertical slice under `features/<feature>/`,
using a consistent, **feature-prefixed** file convention. Prefixing (like the
iedora backend services' `<slice>.query.ts` / `<slice>.service.ts`) keeps editor
tabs and imports unambiguous — no wall of identical `queries.ts` tabs.

## Files

| File | Role | Backend analogue |
|---|---|---|
| `<feature>.queries.ts` | Server-side **reads** (called from RSC). Pure data. | `<slice>.query.ts` |
| `<feature>.service.ts` | Domain **writes / logic** — the mutations, transaction-owning functions. No HTTP/action concerns. | `<slice>.service.ts` |
| `<feature>.actions.ts` (or `<feature>.<action>.ts`) | **Server actions** — the transport layer: `authActionClient` wrappers that validate input (zod), resolve the viewer, call the service, and `revalidatePath`. Thin. | `<slice>.routes.ts` |
| `<feature>.types.ts` | Shared types for the slice. | — |
| `<feature>.functions.ts` | Inngest / background handlers. | — |
| `<feature>.<support>.ts` | Prefixed helpers (`booking.slots.ts`, `lessons.room.ts`, `reschedule.internals.ts`). | `data/*` |
| `components/` | The slice's client UI. | — |

## Rules

- **Reads vs writes are separated**: `queries` never mutate; `service` owns
  mutations. Server actions in `actions` orchestrate (validate → service →
  revalidate) but hold no domain logic.
- **Data access** is `@workspace/db` (which is `@iedora/db` under the hood — Bun
  SQL or postgres.js). Tutor owns its **own** database (`tutor_marketplace`) on the
  shared iedora Postgres server; tables live under the `tutor` schema (`search_path`,
  `DB_SCHEMA`). No cross-service DB access — other services are reached over HTTP.
- **Auth** is `getViewer` / `requireViewer` (verifies the iedora auth service
  JWT); server actions take the viewer from `authActionClient`'s `ctx`.
- A slice imports another slice only through its `.queries` / `.service` /
  `.actions` — never its internals.

## Example (`booking/`)

```
booking.queries.ts    tutor stats, availability reads
booking.service.ts    bookIntroLesson(), bookRecurringSeries(), ensureConversation()
booking.actions.ts    bookIntro, bookRecurring  (safe-action wrappers)
booking.slots.ts      slot math
components/            intro-booking.tsx, recurring-booking.tsx, book-cta.tsx
```
