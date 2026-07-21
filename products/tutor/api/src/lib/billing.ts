import { BillingClient } from "@iedora/sdk/billing"
import { ServiceTokenSource } from "@iedora/auth-sdk/tokens"

import type { TutorConfig } from "../config.ts"

/** Tutor's settlement currency (ISO 4217). Billing normalizes it on the wire. */
export const CURRENCY = "gbp"
/** Currency on the billing wire is a 3-letter ISO code (uppercase). */
export const WIRE_CURRENCY = CURRENCY.toUpperCase()

/**
 * The tutor service's client for the shared billing service. Payments go THROUGH
 * billing (it holds STRIPE_SECRET_KEY and talks to Stripe); tutor asks billing to
 * charge/setup/refund and, for client-confirm flows, forwards the returned
 * clientSecret to Stripe.js in the browser. Authenticates with a service token
 * minted from the auth service's client-credentials grant (cached until shortly
 * before expiry).
 */
export function makeBilling(cfg: TutorConfig): BillingClient {
  return new BillingClient({
    baseUrl: cfg.billingBaseUrl,
    tokens: new ServiceTokenSource(cfg.authBaseUrl, cfg.serviceClientId, cfg.serviceClientSecret),
  })
}
