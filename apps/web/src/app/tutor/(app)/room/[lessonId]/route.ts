import { ApiError } from "@iedora/product-tutor/api"
import { NextResponse } from "next/server"

import { getRoomUrl } from "@iedora/product-tutor/api/lessons-mutations"

/**
 * Sends the viewer into their LessonSpace classroom. The service resolves the
 * caller's role from the Bearer principal and returns *their* URL only (the tutor's
 * carries leader rights and is never handed to the student); it mints the room on
 * demand if the T-10min timer hasn't fired yet. This route just redirects the
 * browser to whatever URL comes back, and maps the service's error statuses.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params
  try {
    const { url } = await getRoomUrl(lessonId)
    return NextResponse.redirect(url)
  } catch (err) {
    if (err instanceof ApiError) {
      const message =
        err.status === 404
          ? "Lesson not found"
          : err.status === 403
            ? "Not your lesson"
            : err.status === 503
              ? "Classroom not ready yet"
              : "Could not open the classroom"
      return NextResponse.json({ error: message }, { status: err.status })
    }
    throw err
  }
}
