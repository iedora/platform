import type { Plan } from "@iedora/contracts";

// The billing plan registry — code-defined (not a DB table) so it's versioned
// with the service. Invoices snapshot plan_code + amount for history, so
// changing a price here never rewrites past invoices. Ports Go
// internal/billing/plans/plans.go (same codes, prices in EUR cents).
const registry: Record<string, Plan> = {
  menu_free: { code: "menu_free", name: "Menu Free", product: "menu", priceCents: 0, currency: "EUR" },
  menu_pro: { code: "menu_pro", name: "Menu Pro", product: "menu", priceCents: 1900, currency: "EUR" },
  menu_agency: { code: "menu_agency", name: "Menu Agency", product: "menu", priceCents: 4900, currency: "EUR" },
};

/** Returns the plan for a code, or undefined when unregistered. */
export function getPlan(code: string): Plan | undefined {
  return registry[code];
}
