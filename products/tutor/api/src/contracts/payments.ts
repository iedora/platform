import { z } from "zod"

// Payment contracts for the student's own card + one-off checkout. Billing owns
// Stripe; the service brokers the calls and stores only the display bits.

export interface SavedCardDTO {
  brand: string
  /** Null when the method came from Link and exposes no card details. */
  last4: string | null
  expMonth: number | null
  expYear: number | null
  expired: boolean
  isLink: boolean
}

export interface CardSetupIntentResult {
  clientSecret: string
}

export const confirmCardSetupInput = z.object({ paymentMethodId: z.string().min(1) })
export type ConfirmCardSetupInput = z.infer<typeof confirmCardSetupInput>

export const lessonPaymentInput = z.object({ lessonId: z.string().min(1) })
export type LessonPaymentInput = z.infer<typeof lessonPaymentInput>

export interface OneOffCheckoutResult {
  clientSecret: string
}
