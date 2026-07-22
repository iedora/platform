import { SignJWT } from "jose"

/**
 * Mints room URLs for the self-hosted classroom (services/classroom), replacing
 * the former LessonSpace REST client. Same `LaunchSpace` shape as before, so the
 * lesson-room use-case is unchanged.
 *
 * Each URL carries a short-lived signed token (HS256, shared secret with the
 * classroom service) encoding the participant and the lesson window. The token
 * IS the credential — the tutor's carries `leader` (host) rights, so it must
 * never be handed to the student. `spaceId` is stable per recurring pair, so both
 * participants land in the same room.
 */
export type LaunchUser = {
  /** Our stable id for the person (tutorId / studentId). */
  id: string
  name: string
  /** true = tutor/host (leader); false = student. */
  leader: boolean
}

export function makeClassroom(signingKey: string, baseUrl: string) {
  if (!signingKey) throw new Error("CLASSROOM_SIGNING_KEY is not set")
  const secret = new TextEncoder().encode(signingKey)
  const base = baseUrl.replace(/\/+$/, "")

  return async function launchSpace(opts: {
    /** Persistent room id. Same id for both participants = same room. */
    spaceId: string
    /** Display name for the room. */
    name: string
    user: LaunchUser
    /** ISO instants bounding when the link works (the T-10min window). */
    notBefore: string
    notAfter: string
  }): Promise<string> {
    const token = await new SignJWT({
      spaceId: opts.spaceId,
      uid: opts.user.id,
      name: opts.user.name,
      leader: opts.user.leader,
      room: opts.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setNotBefore(Math.floor(new Date(opts.notBefore).getTime() / 1000))
      .setExpirationTime(Math.floor(new Date(opts.notAfter).getTime() / 1000))
      .sign(secret)

    return `${base}/r/${token}`
  }
}

export type LaunchSpace = ReturnType<typeof makeClassroom>
