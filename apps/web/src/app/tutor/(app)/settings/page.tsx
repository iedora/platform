import { notFound } from "next/navigation"

import { ProfileEditor } from "@iedora/product-tutor/features/tutor-settings/components/profile-editor"
import { getTutorProfile } from "@iedora/product-tutor/api/tutor-settings"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function SettingsProfilePage() {
  const viewer = await requireViewer()
  if (!viewer.tutorId) notFound()
  const profile = await getTutorProfile()
  if (!profile) notFound()

  return <ProfileEditor profile={profile} />
}
