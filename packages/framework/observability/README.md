# @iedora/observability

Idiomatic OpenTelemetry for any Bun or Node service. One `register()` on the
standard OTel **NodeSDK** wires all three signals — traces, metrics, logs — over
OTLP (http/protobuf), env-driven. No domain vocabulary: products attribute spans
through baggage.

## Why NodeSDK (not hand-rolled providers)

Under Bun in 2026 the NodeSDK's wiring — providers, `BatchSpanProcessor`, the
AsyncLocalStorage context manager, W3C propagators, resource detection,
`OTEL_*` env config, graceful shutdown — all works. What Bun still can't do is
**auto-instrument by module-patching** (`require-in-the-middle`), and `Bun.serve`
doesn't route through `node:http`. So the split is:

- **NodeSDK owns the boilerplate** (this package).
- **Products hand-hang the two edges Bun can't auto-instrument**: the HTTP server
  span via [`@hono/otel`](https://www.npmjs.com/package/@hono/otel), and DB spans
  via a Kysely plugin off the exported `tracer()`.

Pass **no** auto-instrumentations under Bun — they load but their hooks don't
fire.

## Usage

```ts
// instrumentation.ts — load first: `bun --preload ./instrumentation.ts src/server.ts`
import { register } from "@iedora/observability"

register({
  serviceName: "my-service",
  serviceVersion: process.env.GIT_SHA,
  contextAttributeKeys: (k) => k.startsWith("app."), // which baggage keys → span attrs
})
```

```ts
// per request — attribution with zero framework domain knowledge
import { withContextAttributes } from "@iedora/observability"

withContextAttributes({ "app.org_id": orgId }, () => handle(req))
```

`register()` **ships dark**: with no `OTEL_EXPORTER_OTLP_ENDPOINT` it warns once
and does nothing, so `tracer()`/`meter()`/`logger()` stay safe no-ops. Set the
endpoint to turn telemetry on — nothing else changes. Endpoint, headers, sampler
(`OTEL_TRACES_SAMPLER`), and protocol are all read from the environment.

## Genericity: baggage, not domain keys

`withContextAttributes` writes keys into W3C Baggage; the `BaggageSpanProcessor`
(wired when you pass `contextAttributeKeys`) copies matching keys onto every span
at start — and because it's baggage, the values also propagate to the next
service. The product picks its own key names and predicate. The package hardcodes
none.

## API

- `register(opts)` — wire OTel once. Idempotent. Ships dark without an endpoint.
- `shutdown()` — force-flush + stop; **short-lived scripts must call it** or the
  last batch never exports. Long-lived servers get SIGTERM/SIGINT handlers.
- `tracer(name?)` / `meter(name?)` / `logger(name?)` — call-time accessors (safe
  before registration; the accessor shape sidesteps the metrics API's eager-bind
  gap).
- `withContextAttributes(attrs, fn)` — set baggage attribution for `fn`.
- Re-exports of the common `@opentelemetry/api` values/types so consumers need
  one dep.

`@opentelemetry/api` and `@opentelemetry/api-logs` are **peer deps** so the app
has a single API singleton.
