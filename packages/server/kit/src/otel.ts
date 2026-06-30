// Telemetry slice — the ONE place server-kit touches @iedora/observability. It
// owns the four backend OTel integration points so they live together instead
// of scattered through boot/http/db/serviceclient:
//   - initOtel/shutdownOtel  — process lifecycle (serve)
//   - otelHttp               — one SERVER span per request (createServiceApp)
//   - recordQuerySpan        — one CLIENT span per DB query (Database)
//   - withTrace              — outbound traceparent injection (ServiceClient)
//   - traceIds               — trace/span ids for log correlation
// Everything no-ops until registerIedoraOtelNode runs with an OTLP endpoint, so
// it's free when observability is off.
// Import EVERYTHING (the OTel API re-exports AND the iedora helpers) from the
// @iedora/observability barrel — NOT @opentelemetry/api directly. register-node
// registers the global tracer provider on the barrel package's @opentelemetry/api
// instance; in the Bun workspace, server-kit's own @opentelemetry/api resolves to
// a DIFFERENT module instance, so a direct import here put otelHttp's SERVER span
// on a no-op provider (it silently never exported) while register-node's tp lived
// on the barrel instance. Going through the barrel keeps producer + provider on
// the one instance, so SERVER spans actually export. `tracer` is the shared
// pre-configured tracer used by every iedora span.
import {
  context,
  IEDORA_RESTAURANT_ID,
  IEDORA_TENANT_ID,
  propagation,
  registerIedoraOtelNode,
  shutdownIedoraOtel,
  SpanKind,
  SpanStatusCode,
  trace,
  tracer,
} from "@iedora/observability";
import { type Env } from "hono";
import { createMiddleware } from "hono/factory";
import type { LogEvent } from "kysely";

// --- process lifecycle -------------------------------------------------------

/** Initialize OTel for this service. The Node variant avoids @vercel/otel
 *  (which misbehaves outside Next/under bun); no-ops in tests and when
 *  OTEL_EXPORTER_OTLP_ENDPOINT is unset, so it ships dark and is switched on
 *  purely by setting that env. */
export function initOtel(serviceName: string): void {
  registerIedoraOtelNode({ serviceName });
}

/** Flush any buffered spans/metrics before exit (bounded; safe when OTel was
 *  never registered). */
export function shutdownOtel(): Promise<void> {
  return shutdownIedoraOtel();
}

/** Trace + span ids of the active span, for correlating a log line back to its
 *  trace. Undefined when no span is active (OTel off). */
export function traceIds(): { trace_id: string; span_id: string } | undefined {
  const sc = trace.getActiveSpan()?.spanContext();
  return sc ? { trace_id: sc.traceId, span_id: sc.spanId } : undefined;
}

// --- HTTP server spans -------------------------------------------------------

// Reads W3C trace headers off the incoming Request so a span continues the
// caller's trace instead of starting a detached one.
const headerGetter = {
  get: (h: Headers, k: string) => h.get(k) ?? undefined,
  keys: (h: Headers) => Array.from(h.keys()),
};

// The originating client IP behind Cloudflare + kamal-proxy. PII — only ever
// goes on the SERVER span (never a metric label or db statement). Trust
// assumption: backend service ports are reachable only from that proxy boundary;
// do not accept spoofable forwarding chains from direct clients here.
function clientAddress(h: Headers): string | undefined {
  const cf = h.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return undefined;
}

// One SERVER span per request. Bun.serve/Hono aren't auto-instrumented, so this
// is where backend HTTP tracing comes from: continue any propagated trace, name
// the span by the matched route (low cardinality), and stamp status + tenant.
export function otelHttp<E extends Env>(opts?: {
  captureRequestHeaders?: string[];
  captureResponseHeaders?: string[];
}) {
  return createMiddleware<E>(async (c, next) => {
    const method = c.req.method;
    let route = c.req.path;
    const parent = propagation.extract(context.active(), c.req.raw.headers, headerGetter);
    const startTime = performance.now();
    let hasErrorStatus = false;
    await context.with(parent, () =>
      tracer.startActiveSpan(`${method} ${route}`, { kind: SpanKind.SERVER }, async (span) => {
        span.setAttribute("http.request.method", method);
        span.setAttribute("url.path", c.req.path);
        if (route) span.setAttribute("http.route", route);
        const ip = clientAddress(c.req.raw.headers);
        if (ip) span.setAttribute("client.address", ip);
        for (const name of opts?.captureRequestHeaders ?? []) {
          const value = c.req.header(name);
          if (value) span.setAttribute(`http.request.header.${name}`, value);
        }
        try {
          await next();
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
          hasErrorStatus = true;
          throw err;
        } finally {
          if (c.error && !hasErrorStatus) {
            span.recordException(c.error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(c.error) });
            hasErrorStatus = true;
          }
          const status = c.res.status;
          const matchedRoute = c.req.routePath;
          if (matchedRoute && matchedRoute !== c.req.path) {
            route = matchedRoute;
            span.updateName(`${method} ${route}`);
            span.setAttribute("http.route", route);
          }
          span.setAttribute("http.response.status_code", status);
          span.setAttribute("http.duration", performance.now() - startTime);
          const contentLength = c.res.headers.get("content-length");
          if (contentLength) span.setAttribute("http.response.body.size", Number(contentLength));
          for (const name of opts?.captureResponseHeaders ?? []) {
            const value = c.res.headers.get(name);
            if (value) span.setAttribute(`http.response.header.${name}`, value);
          }
          if (status >= 500 && !hasErrorStatus) span.setStatus({ code: SpanStatusCode.ERROR });
          // Tenant attribution — set by userAuth / the scoped middleware inside
          // next(), so it's available here. Read loosely: not every Env carries
          // these vars.
          const vars = c as unknown as { get: (k: string) => unknown };
          const user = vars.get("user") as { tenantId?: string } | undefined;
          if (user?.tenantId) span.setAttribute(IEDORA_TENANT_ID, user.tenantId);
          const rest = vars.get("restaurant") as { id?: string } | undefined;
          if (rest?.id) span.setAttribute(IEDORA_RESTAURANT_ID, rest.id);
          span.end();
        }
      }),
    );
  });
}

// --- DB query spans ----------------------------------------------------------

// Emits a CLIENT span per query from Kysely's log event (fires on success AND
// error, with the duration), giving the `… → business → db` leaves of a request
// trace. ONLY when there's an active parent span: background work (the outbox
// relay polling every 1s, migrations) runs with no parent, and tracing those
// would flood the backend with rootless db spans carrying no business context.
// The span is created after the query, so its start is backdated by the measured
// duration. db.query.text is the PARAMETERIZED sql ($1, $2) — no bound values,
// no PII.
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

// --- outbound propagation ----------------------------------------------------

/** Injects the W3C `traceparent` (+ baggage) so a service-to-service call
 *  continues the caller's trace — the Node OTel variant has no fetch
 *  auto-instrumentation, so we propagate by hand here. No-op until OTel is
 *  registered (no global propagator → nothing written). */
export function withTrace(headers: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), headers, {
    set: (carrier, key, value) => {
      carrier[key] = value;
    },
  });
  return headers;
}
