import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type { StudentLessonsDTO } from "@iedora/product-tutor/contracts/lessons"
import type { RankTier } from "@iedora/product-tutor/enums"

import type { LessonRow, TutorProgress } from "@iedora/product-tutor/features/lessons/lessons.queries"
import { formatLessonTime } from "@iedora/product-tutor/lib/time"

// The authenticated student's lessons + tutor-rank progress, from the service. The
// service returns raw times; we format `when` with the viewer's timezone here.
export async function getStudentLessons(
  viewerTz: string,
): Promise<{ lessons: LessonRow[]; progress: TutorProgress[] }> {
  const dto = await apiJson<StudentLessonsDTO>("/api/lessons")
  return {
    lessons: dto.lessons.map((l) => ({
      id: l.id,
      subject: l.subject,
      tutor: l.tutor,
      when: formatLessonTime(l.startsAtUtc, viewerTz),
      status: l.status,
      isPast: l.isPast,
      qualificationId: l.qualificationId,
      canComplete: l.canComplete,
      canReview: l.canReview,
      canCancel: l.canCancel,
      canNoShow: l.canNoShow,
      reviewed: l.reviewed,
    })),
    progress: dto.progress.map((p) => ({ ...p, tier: p.tier as RankTier })),
  }
}
