"use server"

import { completeLessonInput } from "@iedora/product-tutor/contracts/lessons"
import { revalidatePath } from "next/cache"

import { completeLesson } from "@iedora/product-tutor/api/lessons-mutations"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

export const completeLessonAction = authActionClient
  .metadata({ actionName: "lessons.complete" })
  .inputSchema(completeLessonInput)
  .action(async ({ parsedInput }) => {
    const result = await completeLesson(parsedInput.lessonId)
    revalidatePath("/lessons")
    revalidatePath("/chat")
    revalidatePath("/book")
    return result
  })
