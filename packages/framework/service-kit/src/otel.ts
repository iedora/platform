// Telemetry adapter — the ONE place a service touches OpenTelemetry, backed by
// the published @iedora/observability (standard NodeSDK) + @hono/otel. Generic:
// no product/tenant knowledge. A product that wants tenant attribution uses
// @iedora/observability's own `tenantContext` (its register() always wires the
// tenant span processor) and can hand extra span processors to `initOtel`.
import { httpInstrumentationMiddleware } from "@hono/otel";
import {
  context,
  logger as pubLogger,
  propagation,
  register,
  SeverityNumber,
  shutdown,
  SpanKind,
  SpanStatusCode,
  trace,
  tracer as pubTracer,
} from "@iedora/observability";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { Env } from "hono";
import type { LogEvent } from "kysely";

export { context, propagation, SpanKind, SpanStatusCode, trace };
export type { SpanProcessor };

/** Shared pre-configured tracer/logger (service-name resource comes from register). */
export const tracer = pubTracer("iedora");
export const logger = pubLogger("iedora");

/** Wire OpenTelemetry for this service (no-ops without OTEL_EXPORTER_OTLP_ENDPOINT).
 *  Pass extra span processors (e.g. a product's tenant-attribution processor). */
export function initOtel(serviceName: string, extraSpanProcessors: SpanProcessor[] = []): void {
  register({ serviceName, extraSpanProcessors });
}

/** Flush + shut down before exit (safe when OTel was never registered). */
export function shutdownOtel(): Promise<void> {
  return shutdown();
}

/** Trace + span ids of the active span, for correlating a log line to its trace. */
export function traceIds(): { trace_id: string; span_id: string } | undefined {
  const sc = trace.getActiveSpan()?.spanContext();
  return sc ? { trace_id: sc.traceId, span_id: sc.spanId } : undefined;
}

const SEVERITY = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
} as const;

/** Structured log → stdout JSON (always) AND OTLP (once OTel is registered). */
export function emitLog(
  level: "debug" | "info" | "warn" | "error",
  msg: string,
  attrs: Record<string, string | number | boolean> = {},
): void {
  console.log(JSON.stringify({ level, msg, ...attrs }));
  logger.emit({ severityNumber: SEVERITY[level], severityText: level, body: msg, attributes: attrs });
}

/** One SERVER span per request via @hono/otel (idiomatic for Hono/Bun). */
// biome-ignore lint/suspicious/noExplicitAny: matches the previous Env-generic signature
export function otelHttp<E extends Env = any>(_opts?: {
  captureRequestHeaders?: string[];
  captureResponseHeaders?: string[];
}) {
  return httpInstrumentationMiddleware();
}

/** CLIENT span per query from Kysely's log event (only under an active span). */
export function recordQuerySpan(event: LogEvent): void {
  if (!trace.getActiveSpan()?.isRecording()) return;
  const text = event.query.sql;
  const op = text.trimStart().split(/\s/, 1)[0]?.toUpperCase();
  const table = text.match(/\b(?:from|into|update|join)\s+"?([a-z_][a-z0-9_]*)"?/i)?.[1];
  const span = tracer.startSpan(table ? `db ${op} ${table}` : `db ${op ?? "query"}`, {
    kind: SpanKind.CLIENT,
    startTime: Date.now() - event.queryDurationMillis,
  });
  span.setAttribute("db.system", "postgresql");
  if (op) span.setAttribute("db.operation.name", op);
  if (table) span.setAttribute("db.collection.name", table);
  span.setAttribute("db.query.text", text.length > 1000 ? `${text.slice(0, 1000)}…` : text);
  if (event.level === "error") {
    span.recordException(event.error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(event.error) });
  }
  span.end();
}

/** Inject W3C `traceparent` (+ baggage) so a service call continues the trace. */
export function withTrace(headers: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), headers, {
    set: (carrier, key, value) => {
      carrier[key] = value;
    },
  });
  return headers;
}
