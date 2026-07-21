/**
 * Single source of truth for competitor comparison pages (`/vs/[competitor]`).
 *
 * Honesty rules (see the comparison content): public pricing is approximate and
 * hedged, no numbers are invented, and every competitor gets a genuine list of
 * strengths and an honest statement of who they suit better than we do. Figures
 * were gathered from public pricing / how-it-works pages and review-site themes
 * in mid-2026; verify quarterly, they drift.
 */

/** Our own product, held constant across every comparison. */
export const US = {
  name: "Tutor",
  /** Constant "us" values for the at-a-glance table, one per shared dimension. */
  row: {
    billing: "Pay per session, charged just before each lesson. No packages, passes, or prepaid credits.",
    freeIntro: "Free 15-minute intro with any tutor. No card required.",
    bookPay: "Inside the chat. Booking, rescheduling, and payment never leave the conversation.",
    vetting: "Verified tutors with listed credentials and reviews; top-rated ones earn a Super Tutor badge.",
    structure: "Recurring weekly slots in your own timezone, rescheduled in a couple of taps.",
    catalog: "Focused academic tutoring. A narrower, curated catalog than the big marketplaces.",
  },
  bestFor:
    "learners who want an ongoing, structured 1:1 relationship with a tutor and zero billing surprises, all run from a single chat.",
  /** Genuine limitations, stated plainly. Reused on every page. */
  limitations:
    "Tutor is newer and smaller than the incumbents. Fewer tutors, a narrower subject range, and less geographic reach. It is built to go deep on the chat-native, recurring-lesson experience rather than to list every tutor on earth.",
}

export type ComparisonRow = {
  dimension: string
  us: string
  them: string
}

export type Category = {
  title: string
  us: string
  them: string
}

export type Competitor = {
  slug: string
  name: string
  /** One line for cards and meta descriptions. */
  oneLine: string
  /** 2-3 sentence honest positioning shown in the hero. */
  tldr: string
  region: string
  /** At-a-glance table. `us` values mirror US.row but are inlined per page for clarity. */
  rows: ComparisonRow[]
  /** Paragraph-level breakdown by category. */
  categories: Category[]
  /** Genuine strengths of the competitor. */
  theirStrengths: string[]
  /** Honest "who they're best for" sentence. */
  whoTheyFit: string
}

const ROW_LABELS = {
  billing: "Billing model",
  freeIntro: "Free first lesson",
  bookPay: "Where you book & pay",
  vetting: "Tutor vetting",
  structure: "Lesson structure",
  catalog: "Subjects & languages",
} as const

/** Build the shared table, filling our constant column and the competitor's column. */
function rows(them: Record<keyof typeof ROW_LABELS, string>): ComparisonRow[] {
  return (Object.keys(ROW_LABELS) as (keyof typeof ROW_LABELS)[]).map((k) => ({
    dimension: ROW_LABELS[k],
    us: US.row[k],
    them: them[k],
  }))
}

export const COMPETITORS: Competitor[] = [
  {
    slug: "superprof",
    name: "Superprof",
    oneLine:
      "A huge global marketplace where you pay a monthly pass to contact independent tutors, then arrange lessons directly.",
    region: "Global",
    tldr: "Superprof lists an enormous number of tutors in almost every subject and country, but you pay a flat monthly pass just to contact them, then handle scheduling and payment off-platform with little vetting to lean on. Tutor keeps the whole loop in one chat: a free intro, verified tutors, and a charge that lands per session instead of a pass that auto-renews whether you book or not.",
    rows: rows({
      billing:
        "Flat monthly Student Pass (about $39 to $49) to unlock contact, then each tutor's own rate paid directly. The pass auto-renews.",
      freeIntro: "Some tutors advertise a free first lesson, but it is per-tutor and not guaranteed.",
      bookPay:
        "You pay Superprof for the pass; lessons are arranged and paid off-platform with the tutor.",
      vetting: "Largely open signup, with little to no vetting or background checks.",
      structure: "Whatever you arrange privately with the tutor. No built-in scheduling.",
      catalog: "Enormous: academic, languages, music, sports, and hobbies in almost every country.",
    }),
    categories: [
      {
        title: "Billing and risk",
        us: "You are charged per lesson, just before it happens. Nothing is prepaid, so if you stop booking, you stop paying.",
        them: "You pay a monthly pass to unlock messaging, and it auto-renews. Reviews frequently cite surprise renewals and refused refunds, and you owe the pass even if you never arrange a lesson.",
      },
      {
        title: "Booking and payments",
        us: "Booking, rescheduling, and payment all live in the chat thread with your tutor. One place, one record.",
        them: "Superprof connects you, then steps out. Scheduling and payment happen privately with the tutor, so there is no booking protection if something goes wrong.",
      },
      {
        title: "Tutors and trust",
        us: "Tutors show real credentials and reviews, and the top-rated earn a Super Tutor badge, so quality is legible before you commit.",
        them: "Almost anyone can list, and vetting is minimal. The upside is breadth and low prices; the downside is that filtering out unresponsive or fake profiles is on you.",
      },
    ],
    theirStrengths: [
      "The widest subject and tutor breadth of any platform, in nearly every country",
      "No commission on lessons, so tutor rates can be very low",
      "One flat pass covers unlimited tutor contact",
    ],
    whoTheyFit:
      "budget-conscious learners in a niche or non-academic subject who are happy to vet tutors themselves and manage lessons directly.",
  },
  {
    slug: "cambly",
    name: "Cambly",
    oneLine:
      "A subscription app for on-demand conversational English practice with native speakers, in short 30-minute sessions.",
    region: "Global (English)",
    tldr: "Cambly is great for one thing: frequent, low-pressure English conversation with native speakers, sold as a minutes-per-week subscription. It is not built for structured, curriculum-led tutoring, and tutors need no teaching credential. Tutor is the opposite shape: recurring, structured lessons with a tutor you keep, paid per session rather than as a weekly minutes quota.",
    rows: rows({
      billing:
        "Subscription by lessons per week (30-minute sessions), roughly $50 to $110 a month depending on plan, cheaper on longer commitments.",
      freeIntro: "No standard free trial. Cancel anytime, but it auto-renews.",
      bookPay: "In-app subscription; on-demand or booked tutors within your plan's quota.",
      vetting:
        "Native or fluent English speakers with no teaching credential required (a Pro tier is more structured).",
      structure: "On-demand 30-minute conversation sessions, deliberately casual.",
      catalog: "English only (conversation, plus IELTS and business framing). Also Cambly Kids.",
    }),
    categories: [
      {
        title: "What the lesson is for",
        us: "Structured, recurring lessons that build over weeks toward a goal, with the same tutor and a thread that remembers your history.",
        them: "Casual speaking practice, on demand. Excellent for fluency reps, but there is no curriculum, homework, or continuity by default.",
      },
      {
        title: "How you pay",
        us: "Per session, charged just before each lesson. You are never buying a block of minutes you might not use.",
        them: "A weekly minutes quota billed as a subscription. Forget to cancel and you are charged; unused minutes do not roll over the way you might hope.",
      },
      {
        title: "Tutors and trust",
        us: "Verified tutors with listed credentials and reviews, chosen for teaching, not just for being native speakers.",
        them: "Tutors are native or fluent speakers with no required teaching qualification, so quality is a bit of a lottery outside the Pro tier.",
      },
    ],
    theirStrengths: [
      "Instant, on-demand access to native English speakers",
      "Automatic lesson recordings and transcripts to review",
      "Low-pressure format that is genuinely good for speaking confidence",
    ],
    whoTheyFit:
      "intermediate or advanced English learners who mainly want frequent, casual speaking practice rather than a structured curriculum.",
  },
  {
    slug: "italki",
    name: "italki",
    oneLine:
      "A pay-as-you-go language marketplace with 130+ languages and both qualified teachers and informal community tutors.",
    region: "Global (languages)",
    tldr: "italki is the deepest language catalog anywhere, sold as prepaid credits you spend per lesson at each teacher's own price. It is flexible and broad, but credits are wallet-locked and there is no built-in recurring cadence. Tutor trades that breadth for a tighter, chat-native loop: a recurring weekly slot, payment per session with no prepaid wallet, and everything handled in one conversation.",
    rows: rows({
      billing:
        "Prepaid credits spent per lesson, roughly $4 to $40 a lesson depending on the teacher. No subscription.",
      freeIntro: "Many teachers offer a discounted or trial lesson.",
      bookPay:
        "Buy credits, then book per lesson. Credits are wallet-locked and non-refundable to your card.",
      vetting:
        "Tiered: ID verification for everyone; Professional Teachers must prove teaching qualifications, community tutors need not.",
      structure: "Book lessons one at a time or in discounted packages. No default recurring cadence.",
      catalog: "Languages only, but more than 130 of them.",
    }),
    categories: [
      {
        title: "Money and commitment",
        us: "Pay per session, just before each lesson. No wallet to top up and nothing locked in if you change your mind.",
        them: "You prepay credits into a wallet that is non-refundable to your card. Flexible per lesson, but your money is committed to the platform up front.",
      },
      {
        title: "Rhythm of learning",
        us: "A recurring weekly slot with the same tutor by default, so momentum is built in and rescheduling is a couple of taps.",
        them: "Every lesson is booked individually. Great for dabbling across teachers, but keeping a steady cadence is on you.",
      },
      {
        title: "Reach and focus",
        us: "A focused, curated catalog. If your language or subject is covered, the experience is deeper; if it is exotic, italki will have it and we may not.",
        them: "Unmatched breadth: 130+ languages and a large teacher pool, with a two-tier system to trade price against qualifications.",
      },
    ],
    theirStrengths: [
      "The widest language selection anywhere, well beyond the mainstream",
      "True pay-as-you-go with clear per-lesson pricing and no subscription",
      "Identity verification and a qualified-teacher tier for more trust",
    ],
    whoTheyFit:
      "self-directed language learners who want a wide language choice and the freedom to mix cheap conversation with qualified teaching.",
  },
  {
    slug: "mytutor",
    name: "MyTutor",
    oneLine:
      "A UK-focused platform matching students with vetted university-student tutors for curriculum and exam-prep lessons.",
    region: "UK",
    tldr: "MyTutor is the closest of these to Tutor: pay-as-you-go, a free 15-minute intro, and genuinely vetted tutors. It is purpose-built for UK exam prep, where its curriculum alignment and school partnerships are hard to beat. Tutor is less UK-exam-specialised but chat-native, with a recurring relationship, payment that lands per session, and progress that carries across lessons rather than living in separate bookings.",
    rows: rows({
      billing: "Pay-as-you-go per hour, from about £26 and tiered by tutor experience. No subscription.",
      freeIntro: "Free 15-minute meeting with a tutor before you book.",
      bookPay: "Book and pay per lesson on-platform, through separate parent and student portals.",
      vetting:
        "Genuinely vetted and interviewed, with roughly 1 in 8 applicants accepted (mostly UK university students).",
      structure: "Per-lesson booking, aligned to the UK curriculum; recurring by rebooking each week.",
      catalog: "UK academic curriculum (GCSE, A-Level, KS2/3) and exam prep. Not hobbies or general languages.",
    }),
    categories: [
      {
        title: "Where each one wins",
        us: "The whole relationship lives in one chat with a recurring slot, and progress and history carry from lesson to lesson.",
        them: "Deep UK exam-prep specialism and school partnerships. If the goal is a specific GCSE or A-Level grade, that focus is a real advantage.",
      },
      {
        title: "Vetting, honestly",
        us: "Tutors are verified with listed credentials and reviews, and Super Tutor badges surface the best.",
        them: "A stricter, interview-based process accepts a small fraction of applicants. On raw gatekeeping, MyTutor's vetting is more selective than ours today.",
      },
      {
        title: "Booking and billing",
        us: "Book, reschedule, and pay in the chat, and the charge lands just before each session with no separate portals.",
        them: "On-platform per-lesson booking through dual parent and student portals, which reviews sometimes find fiddly to navigate.",
      },
    ],
    theirStrengths: [
      "A selective, interview-based vetting process",
      "Strong alignment to the UK curriculum and GCSE / A-Level exam prep",
      "A free 15-minute intro and pay-as-you-go, with no subscription lock-in",
    ],
    whoTheyFit:
      "UK secondary and sixth-form students who want curriculum-aligned exam prep from vetted university-student tutors.",
  },
]

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug)
}
