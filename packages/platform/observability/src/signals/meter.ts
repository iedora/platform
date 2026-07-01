import { metrics, type Meter } from "@opentelemetry/api";

/**
 * Pre-configured Meter for iedora-namespaced instruments. Mirrors the
 * `tracer` export's call-site ergonomics — no per-call-site boilerplate
 * around `metrics.getMeter(...)` — but NOT its implementation, for a
 * reason worth spelling out:
 *
 * `@opentelemetry/api`'s trace API has a real deferred-delegation layer
 * (ProxyTracer/ProxyTracerProvider) — `trace.getTracer('iedora')` called
 * before any SDK is registered still works correctly once
 * `setGlobalTracerProvider` runs later, because the returned ProxyTracer
 * forwards each call to whatever the CURRENT global provider is, at CALL
 * time. The metrics API has no equivalent (no ProxyMeter class exists in
 * @opentelemetry/api — confirmed by reading the package source).
 * `metrics.getMeter(name)` is literally
 * `this.getMeterProvider().getMeter(name, ...)` — it resolves the
 * CURRENT provider ONCE, eagerly, and returns THAT provider's Meter.
 *
 * A plain `export const meter = metrics.getMeter('iedora')` — this
 * package's original implementation — is therefore permanently bound to
 * whatever provider is global at MODULE IMPORT time. Since this module is
 * always imported (transitively, via the barrel) before
 * registerIedoraOtel()/registerIedoraOtelNode() ever runs, `meter` was
 * always the no-op meter: every `meter.createCounter(...)` /
 * `.createHistogram(...)` instrument silently discarded every
 * `.add()`/`.record()` call, forever, even after a real MeterProvider was
 * registered later. (Caught by testing an actual metric export
 * end-to-end and finding it missing from the OTLP payload — nothing in
 * the codebase had exercised this path before.)
 *
 * Fix: hand-roll the same "resolve at call time" behavior the trace API
 * gets for free, via a Proxy that re-resolves `metrics.getMeter('iedora')`
 * on every property access. This is not a custom pattern — the API's own
 * ProxyTracer does exactly this for spans; the JS Proxy below just
 * implements the equivalent for Meter, which upstream doesn't yet ship.
 */
export const meter: Meter = new Proxy({} as Meter, {
  get(_target, prop, receiver) {
    const currentMeter = metrics.getMeter("iedora");
    const value = Reflect.get(currentMeter, prop, receiver);
    return typeof value === "function" ? value.bind(currentMeter) : value;
  },
});
