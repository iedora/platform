"use server"

import { markNoShowInput } from "@iedora/product-tutor/contracts/lessons"
import { revalidatePath } from "next/cache"

import { markNoShow } from "@iedora/product-tutor/api/lessons-mutations"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

export const markNoShowAction = authActionClient
  .metadata({ actionName: "lessons.noShow" })
  .inputSchema(markNoShowInput)
  .action(async ({ parsedInput }) => {
    await markNoShow({ lessonId: parsedInput.lessonId, who: parsedInput.who })
    revalidatePath("/lessons")
    revalidatePath("/chat")
    return { ok: true }
  })
