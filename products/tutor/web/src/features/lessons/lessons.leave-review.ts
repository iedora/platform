"use server"

import { leaveReviewInput } from "@iedora/product-tutor/contracts/lessons"
import { revalidatePath } from "next/cache"

import { leaveReview } from "@iedora/product-tutor/api/lessons-mutations"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

export const leaveReviewAction = authActionClient
  .metadata({ actionName: "lessons.review" })
  // Tags are the closed REVIEW_TAGS vocabulary; the service enforces it (the tag
  // counts on the tutor profile are only meaningful if nothing else gets written).
  .inputSchema(leaveReviewInput)
  .action(async ({ parsedInput }) => {
    const result = await leaveReview(parsedInput)
    revalidatePath("/lessons")
    revalidatePath("/chat")
    revalidatePath("/book")
    return result
  })
