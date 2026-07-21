// @iedora/service-kit — the shared Bun+Hono runtime every iedora backend service
// reuses. Re-exports the @iedora/server-kit kernel (auth/JWT/validation/HTTP
// primitives) and adds the runtime a service boots on: createServiceApp (Hono +
// OTel + onError), serve (graceful Bun.serve), Database (Kysely tx-in-context),
// runMigrations, healthRoutes, OTel span attribution, env/_FILE secrets, and
// opaque refresh-token hashing. Product-agnostic; a service imports everything
// from here. Test helpers live on the ./testkit subpath.
export * from "@iedora/server-kit"

export * from "./boot"
export * from "./dates"
export * from "./db"
export * from "./env"
export * from "./health"
export * from "./http"
export * from "./migrate"
export * from "./otel"
export * from "./pgerror"
export * from "./refresh-tokens"
