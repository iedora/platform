"use server"

import { cancelLessonInput } from "@iedora/product-tutor/contracts/lessons"
import { revalidatePath } from "next/cache"

import { cancelLesson } from "@iedora/product-tutor/api/lessons-mutations"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

export const cancelLessonAction = authActionClient
  .metadata({ actionName: "lessons.cancel" })
  .inputSchema(cancelLessonInput)
  .action(async ({ parsedInput }) => {
    const { late } = await cancelLesson({ lessonId: parsedInput.lessonId, as: parsedInput.as })
    revalidatePath("/lessons")
    revalidatePath("/chat")
    return { late }
  })
