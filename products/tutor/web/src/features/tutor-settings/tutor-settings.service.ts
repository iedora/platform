"use server"

import {
  addQualificationInput,
  removeQualificationInput,
  toggleReviewPinInput,
  updateProfileInput,
  updateRateInput,
} from "@iedora/product-tutor/contracts/tutor-settings"
import { revalidatePath } from "next/cache"

import * as api from "@iedora/product-tutor/api/tutor-settings"
import { authActionClient } from "@iedora/product-tutor/lib/safe-action"

// Thin authed wrappers. The tutor service owns the moderation-queue staging (dedup
// + insert), ownership checks, and the immediate review-pin; these forward and
// revalidate. The tutor is resolved from the Bearer principal server-side.

export const updateTutorProfileAction = authActionClient
  .metadata({ actionName: "tutorSettings.updateProfile" })
  .inputSchema(updateProfileInput)
  .action(async ({ parsedInput }) => {
    const res = await api.updateProfile(parsedInput)
    revalidatePath("/settings", "layout")
    return res
  })

export const updateQualificationRateAction = authActionClient
  .metadata({ actionName: "tutorSettings.updateQualificationRate" })
  .inputSchema(updateRateInput)
  .action(async ({ parsedInput }) => {
    const res = await api.updateRate(parsedInput)
    revalidatePath("/settings", "layout")
    return res
  })

export const addQualificationAction = authActionClient
  .metadata({ actionName: "tutorSettings.addQualification" })
  .inputSchema(addQualificationInput)
  .action(async ({ parsedInput }) => {
    const res = await api.addQualification(parsedInput.subjectId)
    revalidatePath("/settings", "layout")
    return res
  })

export const removeQualificationAction = authActionClient
  .metadata({ actionName: "tutorSettings.removeQualification" })
  .inputSchema(removeQualificationInput)
  .action(async ({ parsedInput }) => {
    const res = await api.removeQualification(parsedInput.qualificationId)
    revalidatePath("/settings", "layout")
    return res
  })

export const toggleReviewPinAction = authActionClient
  .metadata({ actionName: "tutorSettings.toggleReviewPin" })
  .inputSchema(toggleReviewPinInput)
  .action(async ({ parsedInput }) => {
    const res = await api.toggleReviewPin(parsedInput)
    revalidatePath("/", "layout")
    return res
  })
