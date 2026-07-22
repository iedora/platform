import { expandFileSecrets, serve } from "@iedora/service-kit"

import { buildApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import { Rooms } from "./signaling.ts"

expandFileSecrets()
const config = loadConfig()

const { app, injectWebSocket } = buildApp({ config, rooms: new Rooms() })

const server = serve(app, {
  name: "iedora-classroom",
  port: config.port,
})

// Attach the WS upgrade handler to the running server (serve returns it).
injectWebSocket(server)
