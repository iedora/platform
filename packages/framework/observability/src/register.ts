import type { Attributes, Context, Link, SpanKind } from "@opentelemetry/api"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs"
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto"
import { resourceFromAttributes } from "@opentelemetry/resources"
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions"
import { BaggageSpanProcessor } from "@opentelemetry/baggage-span-processor"

/**
 * How to wire OpenTelemetry into this process. Everything is optional except
 * `serviceName`; endpoint, headers, sampler ratio, and protocol are all
 * env-driven (`OTEL_*`) unless overridden here.
 */
export interface RegisterOptions {
  /** `service.name` resource attribute — how the backend groups this service. */
  serviceName: string
  /** `service.version` — pass your build's git sha / semver when you have one. */
  serviceVersion?: string
  /**
   * Head-sampling ratio (0..1) for cost control, at the root of a ParentBased
   * sampler so upstream decisions are honored. Omit (the common case) for
   * always-on. Either way, health-probe spans are always dropped.
   */
  sampleRatio?: number
  /**
   * Which baggage keys get copied onto every span as attributes. The framework
   * carries NO domain vocabulary — a product decides its own attribution keys,
   * e.g. `(k) => k.startsWith("app.")`. Set the baggage with
   * {@link withContextAttributes}. Omit to stamp nothing.
   */
  contextAttributeKeys?: (key: string) => boolean
  /**
   * Extra span processors appended after the exporter + baggage processors —
   * e.g. a diagnostic processor. Rarely needed.
   */
  extraSpanProcessors?: SpanProcessor[]
  /**
   * Instrumentations to register. Empty by default: on Bun the Node
   * auto-instrumentations are unreliable (module-patching doesn't fire, and
   * `Bun.serve` bypasses `node:http`), so products add curated,
   * runtime-agnostic instrumentation at the edges instead — `@hono/otel` for
   * the HTTP server span, a Kysely plugin for DB spans. Never pass
   * `@opentelemetry/auto-instrumentations-node` here under Bun.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instrumentations?: any[]
  /** Metric export interval (ms). Default 60s — matches typical dashboards. */
  metricExportIntervalMs?: number
}

const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 60_000

let sdk: NodeSDK | undefined

// Health/readiness probes hit the server constantly and carry zero diagnostic
// value; recording them just adds noise and cost. Every iedora service drops
// them the same way — this is that one behavior, not a per-product knob. Matches
// the probe as the last path segment, so `/up`, `/health`, `/api/ready`,
// `/healthz`, etc. are all caught regardless of prefix.
const PROBE_PATH = /(?:^|\/)(?:up|health|healthz|ready|readyz|live|livez|ping)\/?$/i

function isProbe(spanName: string, attrs: Attributes): boolean {
  const path = String(
    attrs["url.path"] ?? attrs["http.route"] ?? attrs["http.target"] ?? "",
  )
  return (path !== "" && PROBE_PATH.test(path)) || PROBE_PATH.test(spanName)
}

/** Wraps a delegate sampler and drops health-probe spans before they're recorded. */
class ProbeFilteringSampler implements Sampler {
  constructor(private readonly delegate: Sampler) {}
  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    if (isProbe(spanName, attributes)) return { decision: SamplingDecision.NOT_RECORD }
    return this.delegate.shouldSample(context, traceId, spanName, spanKind, attributes, links)
  }
  toString(): string {
    return `ProbeFiltering(${this.delegate.toString()})`
  }
}

// The one sampling behavior: parent-based (honor upstream decisions), always-on
// at the root unless a head-sampling ratio is set for cost control, with health
// probes always dropped. No env-driven `OTEL_TRACES_SAMPLER` path — one way.
function sampler(opts: RegisterOptions): Sampler {
  const root = opts.sampleRatio === undefined
    ? new AlwaysOnSampler()
    : new TraceIdRatioBasedSampler(opts.sampleRatio)
  return new ProbeFilteringSampler(new ParentBasedSampler({ root }))
}

/**
 * Wire OpenTelemetry traces, metrics, and logs into this process on the standard
 * {@link NodeSDK}. Call it ONCE, as early as possible — ideally via
 * `bun --preload ./instrumentation.ts` so the global providers exist before any
 * module resolves a meter (see the note on {@link meter}).
 *
 * Ships dark: with no `OTEL_EXPORTER_OTLP_ENDPOINT` set it warns once and does
 * NOT start the SDK, so there's no accidental localhost:4318 traffic and the
 * `tracer`/`meter`/`logger` accessors stay safe no-ops. Set the endpoint to turn
 * telemetry on — nothing else changes.
 *
 * Idempotent: a second call in the same process is a no-op.
 *
 * Endpoint, headers, timeout, and protocol are read from the environment by each
 * OTLP exporter itself (`OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS` / `_TIMEOUT`),
 * so deploys stay declarative. Metric temporality is left at the exporter's
 * env-driven default (CUMULATIVE) — required for a Prometheus backend, which
 * drops delta counters/histograms.
 */
export function register(opts: RegisterOptions): void {
  if (sdk) return

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.warn(
      `[observability] OTEL_EXPORTER_OTLP_ENDPOINT not set; telemetry disabled for "${opts.serviceName}".`,
    )
    return
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opts.serviceName,
    ...(opts.serviceVersion ? { [ATTR_SERVICE_VERSION]: opts.serviceVersion } : {}),
  })

  const spanProcessors: SpanProcessor[] = [
    // Batch is safe under Bun in 2026 (timers ref/unref fixed); export is driven
    // off the request hot path. shutdown()/SIGTERM forceFlush the last batch.
    new BatchSpanProcessor(new OTLPTraceExporter()),
    ...(opts.contextAttributeKeys
      ? [new BaggageSpanProcessor(opts.contextAttributeKeys) as unknown as SpanProcessor]
      : []),
    ...(opts.extraSpanProcessors ?? []),
  ]

  sdk = new NodeSDK({
    resource,
    sampler: sampler(opts),
    spanProcessors,
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: opts.metricExportIntervalMs ?? DEFAULT_METRIC_EXPORT_INTERVAL_MS,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    // Empty by default under Bun — see RegisterOptions.instrumentations.
    instrumentations: opts.instrumentations ?? [],
    // Context manager (AsyncLocalStorage) + W3C tracecontext/baggage propagators
    // are NodeSDK defaults — no manual wiring.
  })
  sdk.start()

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void shutdown().finally(() => process.exit(0))
    })
  }
}

/**
 * Force-flush + shut the SDK down. Long-lived servers don't need to call this
 * (the SIGTERM/SIGINT handlers do), but short-lived scripts (migrations, CLIs)
 * MUST, or the final batch of spans/logs/metrics never reaches the collector.
 * Safe and idempotent when nothing was registered.
 */
export async function shutdown(): Promise<void> {
  if (!sdk) return
  const s = sdk
  sdk = undefined
  await s.shutdown()
}

// Test-only: reset the module singleton so each test starts clean.
export function __resetForTest(): void {
  sdk = undefined
}
