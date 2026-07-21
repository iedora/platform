import type { UserPrincipal } from "@iedora/service-kit"

// TutorEnv carries the authenticated principal (set by service-kit's userAuth)
// on every /api route. Slices read the caller via c.get("user").
export interface TutorEnv {
  Variables: { user: UserPrincipal }
}
