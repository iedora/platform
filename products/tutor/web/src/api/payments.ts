import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type {
  CardSetupIntentResult,
  ConfirmCardSetupInput,
  LessonPaymentInput,
  OneOffCheckoutResult,
  SavedCardDTO,
} from "@iedora/product-tutor/contracts/payments"

// The student's payment surface, through the service. Billing owns Stripe; the
// service resolves the student from the Bearer principal.

const post = <T>(path: string, body?: unknown) =>
  apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })

export function getSavedCard(): Promise<SavedCardDTO | null> {
  return apiJson<SavedCardDTO | null>("/api/payments/saved-card")
}

export function createCardSetupIntent(): Promise<CardSetupIntentResult> {
  return post<CardSetupIntentResult>("/api/payments/card-setup")
}

export function saveDefaultPaymentMethod(input: ConfirmCardSetupInput): Promise<{ ok: true }> {
  return post<{ ok: true }>("/api/payments/card", input)
}

export function startOneOffCheckout(input: LessonPaymentInput): Promise<OneOffCheckoutResult> {
  return post<OneOffCheckoutResult>("/api/payments/lesson/checkout", input)
}

export function confirmOneOffPayment(input: LessonPaymentInput): Promise<{ ok: true }> {
  return post<{ ok: true }>("/api/payments/lesson/confirm", input)
}
