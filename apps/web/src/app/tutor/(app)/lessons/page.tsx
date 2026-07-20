import { Flame, Trophy } from "lucide-react"

import { getStreak, listQuests, listTutorBadges } from "@iedora/product-tutor/api/gamification"
import { LessonList } from "@iedora/product-tutor/features/lessons/components/lesson-list"
import { getStudentLessons } from "@iedora/product-tutor/api/lessons"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function LessonsPage() {
  const viewer = await requireViewer()

  if (!viewer.studentId) {
    return (
      <div className="mx-auto max-w-2xl p-4 pb-8 sm:p-6">
        <h1 className="text-xl font-semibold">Your lessons</h1>
        <p className="mt-2 text-sm text-muted-foreground">No student profile yet.</p>
      </div>
    )
  }

  const { lessons, progress } = await getStudentLessons(viewer.timezone)
  const [streak, quests, badges] = await Promise.all([
    getStreak(),
    listQuests(),
    listTutorBadges(progress.map((p) => p.tutorId)),
  ])

  return (
    <div className="mx-auto max-w-2xl p-4 pb-8 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Your lessons</h1>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-mono text-xs font-semibold text-destructive">
              <Flame className="size-3.5" />
              {streak}-week streak
            </span>
          )}
          <span className="rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            Level {viewer.learnerLevel} · {viewer.learnerXp} XP
          </span>
        </div>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Complete a lesson or leave a review — your tutor earns XP and levels up.
      </p>

      {/* This week's quests */}
      <section className="mb-6 rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">This week&apos;s quests</h2>
        <ul className="flex flex-col">
          {quests.map((q) => (
            <li
              key={q.id}
              className="flex items-center gap-3 border-b border-border py-2 text-sm last:border-b-0"
            >
              <span
                className={
                  q.done
                    ? "grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground"
                    : "grid size-5 place-items-center rounded-full border-2 border-border text-xs"
                }
              >
                {q.done ? "✓" : ""}
              </span>
              <span className={q.done ? "text-muted-foreground line-through" : ""}>{q.title}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {q.progress}/{q.target}
              </span>
              <span className="font-mono text-xs font-semibold text-chart-2">+{q.xpReward}</span>
            </li>
          ))}
        </ul>
      </section>

      {progress.length > 0 && (
        <section className="mb-8 grid gap-3 sm:grid-cols-2">
          {progress.map((p) => (
            <div key={p.qualificationId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                  {p.tutor} · {p.subject}
                </span>
                <span className="font-mono text-xs">{p.rank}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full border border-border bg-muted">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-chart-2 to-primary"
                  style={{ width: `${p.progressPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[0.7rem] text-muted-foreground">
                <span>You keep {p.keepPct}</span>
                {p.nextRank && p.xpToNext !== null ? (
                  <span>
                    {p.xpToNext} XP to {p.nextRank} · keep {p.nextKeepPct}
                  </span>
                ) : (
                  <span>Top rank</span>
                )}
              </div>

              {(badges.get(p.tutorId) ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(badges.get(p.tutorId) ?? []).map((name) => (
                    <span
                      key={name}
                      className="flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
                    >
                      <Trophy className="size-3" />
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <LessonList lessons={lessons} />
    </div>
  )
}
