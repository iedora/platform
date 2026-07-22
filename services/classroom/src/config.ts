import { env, requireEnv } from "@iedora/service-kit"

export interface IceServer {
  urls: string
  username?: string
  credential?: string
}

export interface ClassroomConfig {
  port: number
  /** Shared HS256 secret used to verify room tokens (tutor mints with the same). */
  signingSecret: Uint8Array
  /** ICE servers handed to the browser. */
  iceServers: IceServer[]
}

export function loadConfig(): ClassroomConfig {
  // Comma-separated STUN/TURN URLs. Public STUN by default: STUN only discovers
  // addresses, media still flows peer-to-peer. TURN (media relay) needs a public
  // UDP endpoint — set CLASSROOM_TURN_URL + creds once one exists; symmetric-NAT
  // pairs require it.
  const stun = env("CLASSROOM_STUN_URLS", "stun:stun.l.google.com:19302")
  const iceServers: IceServer[] = stun
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }))

  const turnUrl = env("CLASSROOM_TURN_URL", "")
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: env("CLASSROOM_TURN_USERNAME", ""),
      credential: env("CLASSROOM_TURN_CREDENTIAL", ""),
    })
  }

  return {
    port: Number(env("CLASSROOM_PORT", "8086")),
    signingSecret: new TextEncoder().encode(requireEnv("CLASSROOM_SIGNING_KEY")),
    iceServers,
  }
}
