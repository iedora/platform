import {
  BEST_KEEP_PCT,
  STARTING_COMMISSION_PCT,
  STARTING_KEEP_PCT,
} from "@iedora/product-tutor/domain/pricing"

/**
 * How the platform treats tutors, us versus the alternatives. Tutor-side economics
 * (commission on the tutor's own rate, or a fixed wage) from public help-centre and
 * pricing pages, mid-2026. Honest: where a rival is genuinely cheaper on commission
 * (Superprof, italki) we say so and name the real trade-off. MyTutor's cut is a
 * reported figure, not officially published.
 */
export type TutorAlt = {
  name: string
  /** Headline cut the platform takes from tutors. */
  cut: string
  /** What the tutor effectively keeps. */
  keep: string
  /** The honest catch for tutors. */
  note: string
  /** Us. Rendered first and highlighted. */
  us?: boolean
}

export const TUTOR_ALTERNATIVES: TutorAlt[] = [
  {
    name: "Tutor",
    cut: `${STARTING_COMMISSION_PCT}%, dropping as you rank up`,
    keep: `${STARTING_KEEP_PCT}% to ${BEST_KEEP_PCT}%`,
    note: "Students pay your rate, never a markup. Every rank lowers your commission for good.",
    us: true,
  },
  {
    name: "Preply",
    cut: "18% to 33%, and 100% of your first lesson",
    keep: "67% to 82%",
    note: "Your first lesson with each student is free to them and unpaid to you, and the cut only eases after hundreds of hours.",
  },
  {
    name: "MyTutor",
    cut: "About 50% (reported)",
    keep: "About 50%",
    note: "Roughly half of the lesson fee goes to the platform. The exact rate is not published.",
  },
  {
    name: "Wyzant",
    cut: "25% flat",
    keep: "75%",
    note: "Predictable, but it never drops with experience.",
  },
  {
    name: "italki",
    cut: "15% flat",
    keep: "About 85%",
    note: "A genuinely low cut, but languages only, and you build your entire student base yourself.",
  },
  {
    name: "Superprof",
    cut: "0% on direct lessons",
    keep: "Your full rate",
    note: "No commission, but students pay a monthly pass just to message you, and it is a lead-gen gamble.",
  },
  {
    name: "Cambly",
    cut: "No rate of your own",
    keep: "Fixed wage (~$0.17/min)",
    note: "You cannot set your price and are paid only while a student is connected.",
  },
]
