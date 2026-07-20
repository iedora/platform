"use server"

import { openRescheduleInput } from "@iedora/product-tutor/contracts/reschedule"
import { revalidatePath } from "next/cache"

import { openReschedule } from "@iedora/product-tutor/api/reschedule"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

export const openRescheduleAction = authActionClient
  .metadata({ actionName: "reschedule.open" })
  .inputSchema(openRescheduleInput)
  .action(async ({ parsedInput }) => {
    const { threadId } = await openReschedule(parsedInput)
    revalidatePath(`/chat/${parsedInput.conversationId}`)
    return { threadId }
  })
