"use server"

import { confirmRescheduleInput, counterRescheduleInput } from "@iedora/product-tutor/contracts/reschedule"
import { revalidatePath } from "next/cache"

import { confirmReschedule, counterReschedule } from "@iedora/product-tutor/api/reschedule"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

export const confirmRescheduleAction = authActionClient
  .metadata({ actionName: "reschedule.confirm" })
  .inputSchema(confirmRescheduleInput)
  .action(async ({ parsedInput }) => {
    const { conversationId } = await confirmReschedule(parsedInput)
    revalidatePath(`/chat/${conversationId}`)
    return { conversationId }
  })

export const counterRescheduleAction = authActionClient
  .metadata({ actionName: "reschedule.counter" })
  .inputSchema(counterRescheduleInput)
  .action(async ({ parsedInput }) => {
    const { conversationId } = await counterReschedule(parsedInput)
    revalidatePath(`/chat/${conversationId}`)
    return { conversationId }
  })
