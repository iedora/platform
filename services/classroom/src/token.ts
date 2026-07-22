import { jwtVerify } from "jose"

// A room token is a short-lived JWT minted by the tutor service (which owns the
// lessons) and verified here. Same split as the platform's auth tokens: the
// minter and the verifier share only the secret + this claim shape, not code.
// HS256 with a shared secret — symmetric is fine because both sides are ours.
export interface RoomClaims {
  /** Persistent room id — both participants of a lesson share one. */
  spaceId: string
  /** Stable id of this participant (tutorId / studentId). */
  uid: string
  /** Display name. */
  name: string
  /** true = host/leader (tutor); false = student. */
  leader: boolean
  /** Room display name (e.g. "Ada & Grace"). */
  room: string
}

export class RoomTokenError extends Error {}

/**
 * Verify a room token. `nbf`/`exp` (the lesson window) are enforced by jose, so
 * a link outside its window is rejected. Throws {@link RoomTokenError} on any
 * invalid/expired token.
 */
export async function verifyRoomToken(token: string, secret: Uint8Array): Promise<RoomClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] })
    if (
      typeof payload.spaceId !== "string" ||
      typeof payload.uid !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.leader !== "boolean"
    ) {
      throw new RoomTokenError("room token missing required claims")
    }
    return {
      spaceId: payload.spaceId,
      uid: payload.uid,
      name: payload.name,
      leader: payload.leader,
      room: typeof payload.room === "string" ? payload.room : "",
    }
  } catch (error) {
    if (error instanceof RoomTokenError) throw error
    throw new RoomTokenError(error instanceof Error ? error.message : "invalid room token")
  }
}
