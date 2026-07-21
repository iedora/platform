import "server-only"

import { apiJson } from "./server-fetch"
import type { SessionDTO } from "../contracts/session"

/** The viewer's tutor/student membership + admin + learner bits, from the service
 *  (resolved from the Bearer principal; bootstraps a student on first sight). */
export function getSession(): Promise<SessionDTO> {
  return apiJson<SessionDTO>("/api/me")
}
