/**
 * Thin server-side wrapper over the LessonSpace v2 REST API. LessonSpace has no
 * official SDK, so this is a plain fetch against the one endpoint we need.
 *
 *   POST https://api.thelessonspace.com/v2/spaces/launch/
 *   Authorization: Organisation <API_KEY>
 *
 * `spaces/launch` is idempotent on `id`: the tutor and student launched against the
 * same `id` land in the same persistent room (so a recurring pair keeps its
 * whiteboard). It returns a *per-participant* `client_url` — the tutor's carries
 * leader (host) rights, so it must never be handed to the student. We mint one URL
 * per person and store them separately (see the room use-case).
 */
const BASE_URL = "https://api.thelessonspace.com/v2"

export type LaunchUser = {
  /** Our stable id for the person (tutorId / studentId). */
  id: string
  name: string
  /** true = tutor/host (Leader Mode); false = student. */
  leader: boolean
}

/** Binds the org key once; returns a `launchSpace` that mints a participant URL. */
export function makeLessonspace(apiKey: string) {
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
    if (!apiKey) throw new Error("LESSONSPACE_API_KEY is not set")

    const res = await fetch(`${BASE_URL}/spaces/launch/`, {
      method: "POST",
      headers: {
        Authorization: `Organisation ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: opts.spaceId,
        name: opts.name,
        user: { id: opts.user.id, name: opts.user.name, leader: opts.user.leader },
        // The link only "counts" once opened, so minting early is free; the window
        // keeps a leaked link from working outside the lesson.
        timeouts: { not_before: opts.notBefore, not_after: opts.notAfter },
      }),
      // Never let a slow classroom provider wedge the durable job forever.
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`LessonSpace launch failed (${res.status}): ${detail.slice(0, 300)}`)
    }

    const json = (await res.json()) as { client_url?: string }
    if (!json.client_url) throw new Error("LessonSpace launch returned no client_url")
    return json.client_url
  }
}

export type LaunchSpace = ReturnType<typeof makeLessonspace>
