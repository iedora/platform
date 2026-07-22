import { createNodeWebSocket } from "@hono/node-ws"
import { createServiceApp, healthRoutes } from "@iedora/service-kit"

import type { ClassroomConfig } from "./config.ts"
import { roomPage } from "./room.ts"
import type { Peer, Rooms } from "./signaling.ts"
import { verifyRoomToken } from "./token.ts"

export interface ClassroomDeps {
  config: ClassroomConfig
  rooms: Rooms
}

const noticePage = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0d10;color:#9aa4af;font:15px system-ui">
<div style="text-align:center"><h1 style="color:#e7eaee;font-size:20px">${title}</h1><p>${body}</p></div></body>`

/**
 * Build the classroom app. The Hono instance and the WebSocket upgrader must be
 * created together (node-ws binds to the app; the /ws route needs the upgrader),
 * so this returns both the app and `injectWebSocket` — index.ts calls the latter
 * on the running server.
 */
export function buildApp(deps: ClassroomDeps) {
  const { config, rooms } = deps
  const app = createServiceApp()
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app })
  const meta = (p: Peer) => ({ uid: p.uid, name: p.name, leader: p.leader })

  app
    .route("/", healthRoutes(async () => {}))

    // The room page. The token carries the participant + the lesson window; an
    // expired or tampered link renders a notice instead of the room.
    .get("/r/:token", async (c) => {
      try {
        const claims = await verifyRoomToken(c.req.param("token"), config.signingSecret)
        return c.html(roomPage(claims, c.req.param("token")))
      } catch {
        return c.html(noticePage("This classroom link isn't valid", "It may have expired or already ended."), 403)
      }
    })

    // Signaling: relay offer/answer/ICE between the (≤2) peers of a room. The
    // server never touches media — only these small JSON messages.
    .get(
      "/ws",
      upgradeWebSocket((c) => {
        const token = c.req.query("token") ?? ""
        let peer: Peer | null = null
        let spaceId = ""

        return {
          async onOpen(_evt, ws) {
            let claims
            try {
              claims = await verifyRoomToken(token, config.signingSecret)
            } catch {
              ws.close(4401, "invalid room token")
              return
            }
            spaceId = claims.spaceId
            peer = { uid: claims.uid, name: claims.name, leader: claims.leader, send: (d) => ws.send(d) }

            const existing = rooms.join(spaceId, peer)
            if (existing.length >= 2) {
              rooms.remove(spaceId, peer)
              ws.close(4403, "room full")
              return
            }
            ws.send(
              JSON.stringify({ type: "welcome", self: meta(peer), peers: existing.map(meta), iceServers: config.iceServers }),
            )
            rooms.broadcast(spaceId, peer, JSON.stringify({ type: "peer-joined", peer: meta(peer) }))
          },

          onMessage(evt) {
            if (!peer) return
            let msg: { type?: string; data?: unknown }
            try {
              msg = JSON.parse(String(evt.data))
            } catch {
              return
            }
            if (msg.type === "signal") {
              rooms.broadcast(spaceId, peer, JSON.stringify({ type: "signal", from: { uid: peer.uid }, data: msg.data }))
            }
          },

          onClose() {
            if (!peer) return
            rooms.broadcast(spaceId, peer, JSON.stringify({ type: "peer-left", uid: peer.uid }))
            rooms.remove(spaceId, peer)
          },
        }
      }),
    )

  return { app, injectWebSocket }
}
