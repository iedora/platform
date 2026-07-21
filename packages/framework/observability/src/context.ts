import { type Baggage, context, propagation } from "@opentelemetry/api"

/**
 * Set request-scoped attribution and run `fn` inside it. The keys land in W3C
 * Baggage on the active context, so two things happen for free:
 *
 *   1. The {@link BaggageSpanProcessor} (wired by `register` when you pass
 *      `contextAttributeKeys`) copies matching keys onto every span started
 *      inside `fn` — no threading `{ orgId }` through every layer.
 *   2. Baggage propagates W3C-downstream, so a service-to-service call carries
 *      the same attribution to the next hop.
 *
 * The framework stays domain-agnostic: the product picks its own key names and
 * the predicate that selects them, e.g.
 *
 *   register({ serviceName: "app", contextAttributeKeys: (k) => k.startsWith("app.") })
 *   withContextAttributes({ "app.org_id": orgId }, () => handle(req))
 *
 * `fn` may be sync or async; its return value is forwarded as-is. The scope is
 * active only inside `fn` and does not leak to siblings. Cheap when OTel is off.
 */
export function withContextAttributes<T>(attrs: Record<string, string>, fn: () => T): T {
  let bag: Baggage = propagation.getActiveBaggage() ?? propagation.createBaggage()
  for (const [key, value] of Object.entries(attrs)) {
    bag = bag.setEntry(key, { value })
  }
  return context.with(propagation.setBaggage(context.active(), bag), fn)
}
