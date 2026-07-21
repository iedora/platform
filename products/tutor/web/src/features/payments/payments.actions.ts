"use server"

import { confirmCardSetupInput, lessonPaymentInput } from "@iedora/product-tutor/contracts/payments"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  confirmOneOffPayment,
  createCardSetupIntent,
  saveDefaultPaymentMethod,
  startOneOffCheckout,
} from "@iedora/product-tutor/api/payments"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

// Thin transport: the service resolves the student from the Bearer principal and
// brokers billing. These just forward + revalidate.

/** Step 1: a SetupIntent whose 3DS/SCA the student completes on-session, once. */
export const startCardSetup = authActionClient
  .metadata({ actionName: "payments.startCardSetup" })
  .inputSchema(z.object({}))
  .action(async () => createCardSetupIntent())

/** Step 2: the SetupIntent succeeded — remember the card for off-session charges. */
export const confirmCardSetup = authActionClient
  .metadata({ actionName: "payments.confirmCardSetup" })
  .inputSchema(confirmCardSetupInput)
  .action(async ({ parsedInput }) => {
    await saveDefaultPaymentMethod(parsedInput)
    revalidatePath("/account")
    revalidatePath("/book")
    return { ok: true as const }
  })

/** Start a one-off lesson payment: create the PaymentIntent now and return its
 *  client secret for the browser to confirm. */
export const startLessonPayment = authActionClient
  .metadata({ actionName: "payments.startLessonPayment" })
  .inputSchema(lessonPaymentInput)
  .action(async ({ parsedInput }) => startOneOffCheckout(parsedInput))

/** The student confirmed the payment on the client — mark the lesson paid. */
export const confirmLessonPayment = authActionClient
  .metadata({ actionName: "payments.confirmLessonPayment" })
  .inputSchema(lessonPaymentInput)
  .action(async ({ parsedInput }) => {
    await confirmOneOffPayment(parsedInput)
    revalidatePath("/lessons")
    return { ok: true as const }
  })
