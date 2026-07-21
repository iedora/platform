// The store's public surface. Everything else (record, diff, schema types,
// eventFromPayload) is used internally by ./ingest via direct imports — no need
// to re-export it here.
export { createAuditIngester } from "./ingest.ts"
