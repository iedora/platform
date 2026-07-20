import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type { UpdateTimezoneInput, UpdateTimezoneResult } from "@iedora/product-tutor/contracts/account"

export async function updateTimezone(input: UpdateTimezoneInput): Promise<UpdateTimezoneResult> {
  return apiJson<UpdateTimezoneResult>("/api/account/timezone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}
