/**
 * @iedora/observability — idiomatic OpenTelemetry for any Bun/Node service.
 *
 * One call wires all three signals on the standard NodeSDK:
 *
 *   // instrumentation.ts, loaded via `bun --preload ./instrumentation.ts`
 *   import { register } from "@iedora/observability"
 *   register({ serviceName: "app", contextAttributeKeys: (k) => k.startsWith("app.") })
 *
 * The package carries NO domain vocabulary. Products attribute spans through
 * baggage (withContextAttributes) and hang their own edge instrumentation off
 * the exported tracer (@hono/otel for HTTP, a Kysely plugin for DB) — the two
 * things Bun can't auto-instrument.
 */
export { withContextAttributes } from "./context.ts"
export { __resetForTest, register, type RegisterOptions, shutdown } from "./register.ts"
export { logger, meter, tracer } from "./signals.ts"

/** API types callers commonly touch. */
export type {
  Counter,
  Histogram,
  Meter,
  Span,
  SpanOptions,
  Tracer,
  UpDownCounter,
} from "@opentelemetry/api"
export type { Logger, LogRecord } from "@opentelemetry/api-logs"

/**
 * Runtime API values re-exported so a consumer needs only this one dep for the
 * common cases (start a span, read the active span, propagate). They resolve
 * against the app's single `@opentelemetry/api` peer instance.
 */
export { context, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api"
export { SeverityNumber } from "@opentelemetry/api-logs"
