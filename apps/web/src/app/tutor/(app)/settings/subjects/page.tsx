import { notFound } from "next/navigation"

import { QualificationEditor } from "@iedora/product-tutor/features/tutor-settings/components/qualification-editor"
import { getTutorQualifications } from "@iedora/product-tutor/api/tutor-settings"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function SettingsSubjectsPage() {
  const viewer = await requireViewer()
  if (!viewer.tutorId) notFound()
  const data = await getTutorQualifications()

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Choose the subjects you teach and your price for each. The net is what you keep after the
        platform commission for that subject&rsquo;s rank.
      </p>
      <QualificationEditor data={data} />
    </div>
  )
}
