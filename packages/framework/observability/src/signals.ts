import { type Meter, metrics, type Tracer, trace } from "@opentelemetry/api"
import { type Logger, logs } from "@opentelemetry/api-logs"

/** Default instrumentation-scope name when a caller doesn't pass one. Neutral so
 *  the package carries no org/domain identity — pass your service or component
 *  name (`tracer("checkout")`) to attribute spans to a specific instrumentation. */
const SCOPE = "app"

/**
 * These are ACCESSOR FUNCTIONS, not module-level constants, on purpose.
 *
 * `metrics.getMeter()` resolves the CURRENT global MeterProvider eagerly and
 * binds to it — the metrics API has no delegating no-op provider yet
 * (open-telemetry/opentelemetry-js#3622). A `const meter = metrics.getMeter()`
 * captured at import time would bind to the no-op meter forever and silently
 * drop every metric, because library modules import before `register()` runs.
 *
 * A call-time accessor sidesteps this entirely: resolve the meter when you
 * actually record, which is after `register()`. Traces and logs both have real
 * delegating providers, so they don't need this — but a uniform accessor shape
 * keeps call sites consistent.
 */
export function tracer(name: string = SCOPE): Tracer {
  return trace.getTracer(name)
}

export function meter(name: string = SCOPE): Meter {
  return metrics.getMeter(name)
}

export function logger(name: string = SCOPE): Logger {
  return logs.getLogger(name)
}
