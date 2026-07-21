import type { Plan } from "./contracts.ts";

// The billing plan registry — code-defined (not a DB table) so it's versioned
// with the service. Invoices snapshot plan_code + amount for history, so
// changing a price here never rewrites past invoices. Codes are stable; prices
// are in EUR cents.
// Display names are the user-facing plan names ("On Us" = the free plan,
// "Kasa" = the paid plan at €12/year). Internal codes stay stable
// (menu_free/menu_pro) so historical invoices and subscriptions keep
// resolving; only the name/price shown to humans changed.
const registry: Record<string, Plan> = {
  menu_free: { code: "menu_free", name: "On Us", product: "menu", priceCents: 0, currency: "EUR" },
  menu_pro: { code: "menu_pro", name: "Kasa", product: "menu", priceCents: 1200, currency: "EUR" },
  menu_agency: { code: "menu_agency", name: "Menu Agency", product: "menu", priceCents: 4900, currency: "EUR" },
};

/** Returns the plan for a code, or undefined when unregistered. */
export function getPlan(code: string): Plan | undefined {
  return registry[code];
}
