"use server"

import { bookIntroInput, bookRecurringInput } from "@iedora/product-tutor/contracts/booking"
import { revalidatePath } from "next/cache"

import { bookIntro as bookIntroApi, bookRecurring as bookRecurringApi } from "@iedora/product-tutor/api/booking"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

// The feature's server actions (the transport layer): validate → call the service
// over the BFF → revalidate. The service resolves the student, snapshots price,
// arms the timers, and pins a series to the tutor's wall-clock. Thin by design.

/** Books a free intro; returns the conversation id so the client navigates in. */
export const bookIntro = authActionClient
  .metadata({ actionName: "booking.bookIntro" })
  .inputSchema(bookIntroInput)
  .action(async ({ parsedInput }) => {
    const { conversationId } = await bookIntroApi(parsedInput)
    revalidatePath("/chat")
    revalidatePath(`/chat/${conversationId}`)
    return { conversationId }
  })

export const bookRecurring = authActionClient
  .metadata({ actionName: "booking.bookRecurring" })
  .inputSchema(bookRecurringInput)
  .action(async ({ parsedInput }) => {
    const { conversationId, count } = await bookRecurringApi(parsedInput)
    revalidatePath("/chat")
    revalidatePath(`/chat/${conversationId}`)
    return { conversationId, count }
  })
