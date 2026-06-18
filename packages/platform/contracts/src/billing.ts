import { z } from "zod";

// Mirrors the Go billing service wire format (internal/billing/domain.go +
// httpapi.go). The billing service validates its requests/responses against
// these; the admin BFF + any reader consume the inferred types.

// A purchasable plan (code-defined registry, snapshotted onto invoices).
export const plan = z.object({
  code: z.string(),
  name: z.string(),
  product: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string(),
});
export type Plan = z.infer<typeof plan>;

// A tenant's current plan for one product.
export const subscription = z.object({
  id: z.string(),
  tenantId: z.string(),
  product: z.string(),
  planCode: z.string(),
  status: z.string(), // active | canceled
  currentPeriodEnd: z.string().optional(), // RFC3339
  canceledAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Subscription = z.infer<typeof subscription>;

// An append-only ledger entry (snapshots plan_code + amount for history).
export const invoice = z.object({
  id: z.string(),
  tenantId: z.string(),
  product: z.string(),
  planCode: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.string(), // issued | paid | void
  createdAt: z.string(),
});
export type Invoice = z.infer<typeof invoice>;

// POST /billing/subscribe — activate or change a tenant's plan.
export const subscribeRequest = z.object({
  tenantId: z.string().min(1),
  planCode: z.string().min(1),
});
export type SubscribeRequest = z.infer<typeof subscribeRequest>;

// POST /billing/cancel — end a tenant's subscription for a product.
export const cancelRequest = z.object({
  tenantId: z.string().min(1),
  product: z.string().min(1),
});
export type CancelRequest = z.infer<typeof cancelRequest>;

// GET /billing/subscriptions?tenant= — a tenant's subscriptions.
export const subscriptionsResponse = z.object({
  subscriptions: z.array(subscription),
});
export type SubscriptionsResponse = z.infer<typeof subscriptionsResponse>;

// GET /billing/invoices?tenant= (a tenant's) or ?limit= (the recent feed).
export const invoicesResponse = z.object({
  invoices: z.array(invoice),
});
export type InvoicesResponse = z.infer<typeof invoicesResponse>;
