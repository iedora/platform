import { type Attributes, type Context, type Link, type SpanKind } from "@opentelemetry/api";
import {
  AlwaysOnSampler,
  ParentBasedSampler,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
} from "@opentelemetry/sdk-trace-base";

// Span-name patterns dropped BEFORE any sampling — pure infra noise with no
// business signal: container healthchecks + probes, hit every few seconds per
// host. The view beacon (/track) is deliberately NOT here: it's a real guest
// action we want full visibility into (failures, client IPs), so it's traced
// like every other public request. Matches the "[METHOD] [route]" span names.
export const NOISE_PATTERNS: RegExp[] = [
  /\s\/up$/,
  /\s\/api\/health$/,
  /\s\/api\/ready$/,
];

/**
 * Wraps an inner Sampler with a span-name regex denylist. The filter runs BEFORE
 * the inner sampler, so a denied span costs nothing past the shouldSample() call
 * — no record, no export. Lives in its own module (no @vercel/otel dependency)
 * so both register.ts and register-node.ts can share it.
 */
export class NoiseFilteringSampler implements Sampler {
  constructor(private readonly inner: Sampler) {}

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    if (NOISE_PATTERNS.some((re) => re.test(spanName))) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return this.inner.shouldSample(context, traceId, spanName, spanKind, attributes, links);
  }

  toString(): string {
    return `IedoraNoiseFilter(${this.inner.toString()})`;
  }
}

/**
 * No head sampling: the public menu is the revenue path, so we keep EVERY
 * request's trace in every environment — losing 90% of them (the old prod 10%
 * ratio) would blind us to exactly the requests that lose sales. ParentBased
 * still honours an upstream sampling decision so cross-service traces stay
 * consistent; the always-on root samples every root span. Only NOISE_PATTERNS
 * are dropped. Tail-sampling (keep errors/slow, drop boring 200s), if ever
 * wanted, belongs in the collector — not in the app.
 */
export function defaultSampler(_environment: string): Sampler {
  return new NoiseFilteringSampler(new ParentBasedSampler({ root: new AlwaysOnSampler() }));
}
