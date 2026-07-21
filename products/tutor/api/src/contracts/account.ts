import { z } from "zod"

// Account mutations. The service re-validates and enforces the "don't clobber a
// manual choice" rule server-side; the web action parses with the same schema for
// a friendly early error.

export const updateTimezoneInput = z.object({
  timezone: z.string().min(1),
  source: z.enum(["auto", "manual"]),
})
export type UpdateTimezoneInput = z.infer<typeof updateTimezoneInput>

export interface UpdateTimezoneResult {
  timezone: string
  changed: boolean
}
