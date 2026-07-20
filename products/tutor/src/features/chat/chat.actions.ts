"use server"

import { sendMessageInput } from "@iedora/product-tutor/contracts/chat"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { sendMessage as sendMessageApi } from "@iedora/product-tutor/api/chat"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

// Thin wrapper: the tutor service inserts the message and derives the sender side
// from the caller's membership (the client no longer asserts its own side).
const sendMessageAction = sendMessageInput.extend({ conversationId: z.string().min(1) })

export const sendMessage = authActionClient
  .metadata({ actionName: "chat.sendMessage" })
  .inputSchema(sendMessageAction)
  .action(async ({ parsedInput }) => {
    const row = await sendMessageApi(parsedInput.conversationId, parsedInput.body)
    revalidatePath(`/chat/${parsedInput.conversationId}`)
    return { id: row.id, body: row.body }
  })
