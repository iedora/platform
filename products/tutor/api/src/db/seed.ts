import { sql } from "kysely"

import { db } from "./client.ts"
import { RANK_COMMISSION_RATE, RANK_LABEL, RANK_MIN_XP, RANK_ORDER } from "./domain/pricing.ts"
import type { ReviewTag } from "./enums.ts"

/** The demo data is attached to this Better Auth account, if it exists. */
const DEMO_EMAIL = "student@example.com"

async function demoUserId(): Promise<string> {
  const res = await sql<{ id: string }>`
    select id from "user" where email = ${DEMO_EMAIL} limit 1
  `.execute(db)
  const id = res.rows[0]?.id
  if (!id) {
    console.log(`! no auth user ${DEMO_EMAIL} — sign up first, then re-run seed`)
    return "unclaimed-demo-student"
  }
  return id
}

/**
 * Idempotent seed. Reference data (ranks, subjects) plus a little demo chat
 * data so the wired chat has something to show. The demo student's userId is
 * "dev-stub" to match the Phase 1 dev viewer (see apps/web/lib/session.ts).
 */

const SUBJECTS = [
  { name: "Mathematics", level: "GCSE", baseRatePennies: 2500 },
  { name: "Mathematics", level: "A-Level", baseRatePennies: 3000 },
  { name: "Physics", level: "GCSE", baseRatePennies: 2500 },
  { name: "Physics", level: "A-Level", baseRatePennies: 3200 },
  { name: "Chemistry", level: "GCSE", baseRatePennies: 2500 },
  { name: "Biology", level: "A-Level", baseRatePennies: 3000 },
  { name: "English", level: "GCSE", baseRatePennies: 2200 },
]

async function seedRanks() {
  await db
    .insertInto("rank")
    .values(
      RANK_ORDER.map((tier) => ({
        tier,
        name: RANK_LABEL[tier],
        minXp: RANK_MIN_XP[tier],
        commissionRate: RANK_COMMISSION_RATE[tier],
      })),
    )
    .onConflict((oc) => oc.column("tier").doNothing())
    .execute()
  console.log(`✓ ranks (${RANK_ORDER.length})`)
}

async function seedSubjects() {
  const existing = await db.selectFrom("subject").select("id").executeTakeFirst()
  if (existing) {
    console.log("• subjects already seeded, skipping")
    return
  }
  await db.insertInto("subject").values(SUBJECTS).execute()
  console.log(`✓ subjects (${SUBJECTS.length})`)
}

const BADGES = [
  { name: "First Lesson", description: "Taught your first lesson", criteria: "lessons:1" },
  { name: "10 Lessons", description: "Taught 10 lessons", criteria: "lessons:10" },
  { name: "50 Lessons", description: "Taught 50 lessons", criteria: "lessons:50" },
  { name: "First 5★", description: "Earned your first five-star review", criteria: "five_star:1" },
  { name: "10× Five Stars", description: "Earned ten five-star reviews", criteria: "five_star:10" },
]

async function seedBadges() {
  const existing = await db.selectFrom("badge").select("id").executeTakeFirst()
  if (existing) {
    console.log("• badges already seeded, skipping")
    return
  }
  await db.insertInto("badge").values(BADGES).execute()
  console.log(`✓ badges (${BADGES.length})`)
}

async function subjectId(name: string, level: string) {
  const row = await db
    .selectFrom("subject")
    .select("id")
    .where("name", "=", name)
    .where("level", "=", level)
    .executeTakeFirstOrThrow()
  return row.id
}

async function rankId(tier: (typeof RANK_ORDER)[number]) {
  const row = await db
    .selectFrom("rank")
    .select("id")
    .where("tier", "=", tier)
    .executeTakeFirstOrThrow()
  return row.id
}

async function seedDemo() {
  // Re-runnable: clear prior demo rows (cascades to their conversations,
  // messages, and qualifications) before reinserting.
  await db
    .deleteFrom("tutor")
    .where("userId", "in", ["tutor-ada", "tutor-ben", "tutor-joao"])
    .execute()

  // Attach the demo student to the real signed-up account.
  const userId = await demoUserId()
  await db
    .deleteFrom("student")
    .where("userId", "in", [userId, "dev-stub", "unclaimed-demo-student"])
    .execute()
  // Past reviewers (below) get their own rows, so clear those too.
  await db.deleteFrom("student").where("userId", "like", "past-student-%").execute()
  await db.deleteFrom("student").where("userId", "like", "joao-student-%").execute()
  await db.deleteFrom("student").where("userId", "like", "joao-rate-%").execute()

  const student = await db
    .insertInto("student")
    .values({ userId, displayName: "You", hasCompletedIntro: true })
    .returning("id")
    .executeTakeFirstOrThrow()

  // Two demo tutors, each with one qualification.
  const ada = await db
    .insertInto("tutor")
    .values({
      userId: "tutor-ada",
      displayName: "Ada Whitfield",
      slug: "ada-whitfield",
      university: "University College London",
      degree: "Mathematics (BSc)",
      tagline:
        "Hi, I'm Ada. I'm an A-Level and GCSE Maths tutor, and I'm at my happiest when a student stops asking me whether their answer is right because they can already tell.",
      bio: [
        "Hi, I'm Ada!",
        "I'm a first-class Maths graduate from University College London, and I've been tutoring A-Level and GCSE students for four years alongside my degree.",
        "I teach maths the way I wish someone had taught me. For a long time I was the kid who could follow every step in the lesson and then stare at a blank page the second the numbers changed, and it took me far too long to work out that this was not a memory problem. It was that nobody had ever shown me why any of it worked. So I go slowly at the start and I ask a lot of questions, and I don't mind at all if the answer is that you have no idea.",
        "Most of the students I take on come to me somewhere between a grade 5 and a grade 7, convinced they've hit their ceiling. They almost never have. What they usually have is one or two gaps three years further back that quietly break everything built on top of them, and those are fixable in a few weeks once you find them.",
        "Outside of tutoring I row, badly, and I'm slowly working through every bakery in south London. Ask me about laminated dough at your peril.",
      ].join("\n\n"),
      teachingStyle: [
        "Every lesson starts with whatever you got stuck on that week, not with whatever comes next in the textbook. If you send me a photo of the question the night before I'll have looked at it before we start.",
        "For most students the pattern is the same. I'll explain something for about five minutes, then I hand it over and you talk me through the next one while I ask you why at every step. It's mildly irritating for the first month and then it becomes the thing that gets you the marks, because the exam is also going to ask you why, just less politely.",
        "Closer to exams we switch almost entirely to past papers. We'll do a question together, then you do one alone while I stay quiet, and then I mark it out loud with the actual mark scheme so you can see exactly where the marks were sitting and why you did or didn't pick them up. Most students lose more marks to how they write an answer than to not knowing it.",
        "You'll leave every lesson with two problems to try. We mark them at the top of the next session, so nothing quietly gets dropped. If you didn't do them, tell me and we'll do them together, that's genuinely fine and much better than pretending.",
      ].join("\n\n"),
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  const mathsAlevelId = await subjectId("Mathematics", "A-Level")
  const adaQual = await db
    .insertInto("qualification")
    .values({
      tutorId: ada.id,
      subjectId: mathsAlevelId,
      rankId: await rankId("gold"),
      // Just under Platinum (1800) so one 5★ review (+40) tips it over.
      xp: 1770,
      verified: true,
    })
    .returning("id")
    .executeTakeFirstOrThrow()

  // Past completed lessons: satisfy the min-lessons promotion guard and give
  // the student something to review.
  const H = 60 * 60_000
  const standardLesson = (startsAtUtc: Date, status: "completed" | "booked") => ({
    studentId: student.id,
    tutorId: ada.id,
    subjectId: mathsAlevelId,
    qualificationId: adaQual.id,
    type: "standard" as const,
    mode: "recurring" as const,
    status,
    startsAtUtc,
    durationMin: 55,
    bufferMin: 5,
    pricePennies: 4200,
  })

  await db
    .insertInto("lesson")
    .values(
      Array.from({ length: 5 }, (_, i) =>
        standardLesson(new Date(Date.now() - (i + 1) * 7 * 24 * H), "completed"),
      ),
    )
    .execute()

  await db
    .insertInto("lesson")
    .values([
      standardLesson(new Date(Date.now() + 3 * 24 * H), "booked"), // >24h → free cancel
      standardLesson(new Date(Date.now() + 10 * H), "booked"), // <24h → late cancel
      standardLesson(new Date(Date.now() - 3 * H), "booked"), // past → no-show
    ])
    .execute()

  // Reviews come from *other* students, each with their own completed lesson —
  // otherwise the profile credits every review to the person reading it ("You"),
  // and the demo account's own 5 lessons all stay reviewable.
  // Accounts are held by the parent, and parents write at length, so the copy is
  // long and specific rather than one-liners.
  const REVIEWS = [
    {
      name: "Sarah Whitcombe",
      tags: ["builds_confidence", "explains_clearly", "patient"] as ReviewTag[],
      rating: 5,
      comment:
        "My daughter has had a rough two years with maths and had basically decided she was bad at it, which was the hardest part to undo. Ada spent the first couple of sessions just working out where the gaps actually were rather than ploughing on with the syllabus, and it turned out most of it went back to algebra she never properly got at GCSE. Since then her confidence has completely turned around. She got a B in her mocks after a D in the summer, and more importantly she now sits down to do the work without me nagging her.",
    },
    {
      name: "David Oyelaran",
      tags: ["pushes_you", "well_prepared", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "We tried two other tutors before this and both of them basically just did the homework with him while he watched. Ada does the opposite. She makes him explain his working out loud and she will not let him move on until he can, which he found very annoying for about three weeks and now he is quite proud of himself. The end of lesson notes she sends are genuinely useful for us as parents because we can see what he is struggling with rather than guessing.",
    },
    {
      name: "Priya Nandi",
      tags: ["great_with_teens", "patient"] as ReviewTag[],
      rating: 4,
      comment:
        "Really good sessions and my son looks forward to them, which I did not expect. Only reason I have not given five stars is that I would like a bit more past paper practice now that we are closer to exams. I mentioned it and she has started building it in, so this is a small thing.",
    },
    {
      name: "Helen Ashworth",
      tags: ["patient", "great_with_teens", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Patient, extremely well prepared, and she never makes my son feel stupid for asking the same question twice. He has ADHD and struggles to stay with a topic for a full hour, and Ada worked out fairly quickly that breaking the lesson into shorter chunks with a problem to solve at the end of each one keeps him with her. Nobody at school has managed that. Worth every penny.",
    },
    {
      name: "Tom Ellery",
      tags: ["always_on_time", "exam_focused", "pushes_you"] as ReviewTag[],
      rating: 5,
      comment:
        "Booked her for my eldest and now my youngest is asking when it is her turn. Reliable, always on time, and she tells you honestly when a grade target is not realistic instead of just agreeing with you, which I appreciated even though I did not want to hear it at the time. He got the A.",
    },
    {
      name: "Nicola Brenner",
      tags: ["explains_clearly", "well_prepared", "builds_confidence"] as ReviewTag[],
      rating: 5,
      comment:
        "Three months in and the difference is obvious. She sets two problems after every lesson and marks them at the start of the next one, so nothing gets quietly dropped. My daughter says she is the first maths teacher who has explained why any of it works rather than just telling her the steps to memorise.",
    },
  ]
  const reviewers = await db
    .insertInto("student")
    .values(
      REVIEWS.map((r, i) => ({
        userId: `past-student-${i}`,
        displayName: r.name,
        hasCompletedIntro: true,
      })),
    )
    .returning("id")
    .execute()
  const reviewedLessons = await db
    .insertInto("lesson")
    .values(
      REVIEWS.map((_, i) => ({
        ...standardLesson(new Date(Date.now() - (i + 2) * 7 * 24 * H), "completed" as const),
        studentId: reviewers[i]!.id,
      })),
    )
    .returning("id")
    .execute()
  await db
    .insertInto("review")
    .values(
      REVIEWS.map((r, i) => ({
        lessonId: reviewedLessons[i]!.id,
        studentId: reviewers[i]!.id,
        qualificationId: adaQual.id,
        rating: r.rating,
        comment: r.comment,
        tags: r.tags,
      })),
    )
    .execute()

  const ben = await db
    .insertInto("tutor")
    .values({
      userId: "tutor-ben",
      displayName: "Ben Okafor",
      slug: "ben-okafor",
      university: "University of Manchester",
      degree: "Physics (MPhys)",
      tagline:
        "Hi, I'm Ben. I tutor GCSE Physics and I'm very patient with the basics, because the basics are almost always the problem.",
      bio: [
        "Hi, I'm Ben!",
        "I have an MPhys from the University of Manchester and I've been tutoring GCSE Physics for three years, mostly with students who've decided they're 'not a science person'.",
        "Physics is a handful of ideas wearing a lot of different hats. Once you can spot the hat, an intimidating question about a lift cable turns into a force diagram you've drawn fifty times before. Most of my job is teaching people to spot the hat.",
        "I've worked with a lot of students who find the maths side harder than the physics, and I'll happily spend a whole lesson on rearranging an equation if that's what's actually in the way. There's no point pushing on to circuits if the algebra underneath is going to collapse.",
        "When I'm not teaching I climb, and I'm learning to play bass with more enthusiasm than talent.",
      ].join("\n\n"),
      teachingStyle: [
        "Lots of diagrams and very little dictation. I would much rather you derive a formula badly once, in your own handwriting, than copy it down perfectly ten times.",
        "I ask questions constantly, partly to keep you awake and partly because it's the fastest way for me to find out what you actually understand as opposed to what you can repeat back. If you get something wrong I'll usually just ask another question rather than tell you the answer.",
        "Bring your mock paper. We'll take it apart question by question and I'll show you what the examiner was actually asking for, which is often much less than students assume. A lot of the marks in GCSE Physics come from saying the boring, obvious thing clearly.",
      ].join("\n\n"),
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  await db
    .insertInto("qualification")
    .values({
      tutorId: ben.id,
      subjectId: await subjectId("Physics", "GCSE"),
      rankId: await rankId("silver"),
      xp: 420,
      verified: true,
    })
    .execute()

  // Joao Florido — Maths across every stage. His personalized landing lives at
  // /t/joao-florido. Facts (Aberdeen BSc + Edinburgh PGDE, the levels he covers,
  // Super Tutor) are his; the copy is ours, not lifted from anywhere.
  const joao = await db
    .insertInto("tutor")
    .values({
      userId: "tutor-joao",
      displayName: "Joao Florido",
      slug: "joao-florido",
      avatarUrl: "/marketing/tutors/joao-florido.webp",
      linkedinUrl: "https://www.linkedin.com/in/joao-florido-13219427a/",
      university: "University of Aberdeen",
      degree: "Mathematics BSc (Hons) · PGDE, University of Edinburgh",
      tagline:
        "Hi, I'm Joao. I teach Maths from KS2 up to A-Level, Highers and IB, and I'm at my best with the students who've decided maths just isn't for them.",
      bio: [
        "Hi, I'm Joao! I've taught Maths across nearly every stage: KS2 and KS3, GCSE and National 4/5, Scottish Highers, A-Level, IB (both Analysis & Approaches and Applications & Interpretation), and first-year university. Different boards, same underlying maths.",
        "Maths is a stacked subject: every new idea sits on top of an older one. Most students who think they're 'bad at maths' actually have a gap or two further back that quietly breaks everything built on them. I find those first, then we build up from solid ground.",
        "A calm session where no question is too small is the norm, not the exception. That comes from years of mentoring alongside tutoring, so nerves settle quickly.",
      ].join("\n\n"),
      teachingStyle: [
        "Every session adapts to where you actually are, not where a textbook says you should be. Just like building a house, maths needs a solid foundation, so I'm never in a rush to move on before the base is steady.",
        "I ask a lot of questions and I'm happy to revisit earlier material the moment a gap shows up. That's usually the fastest route to the thing you're stuck on now, not a detour from it.",
        "Mistakes are part of learning, so the aim is a space where you can think out loud and be wrong without it being a big deal. Closer to exams we shift to past papers and mark them together, so you can see exactly where the marks live.",
      ].join("\n\n"),
      // Portfolio journey — his real credentials, ordered by what a parent cares
      // about most. Rendered as a timeline on the landing page.
      highlights: JSON.stringify([
        {
          label: "Qualified Maths teacher",
          body: "PGDE in Secondary Maths, University of Edinburgh",
        },
        {
          label: "First-class Maths degree",
          body: "BSc (Hons) Mathematics, University of Aberdeen",
        },
        {
          label: "Real classroom experience",
          body: "Student teacher across three Edinburgh secondary schools",
        },
        {
          label: "Six years tutoring",
          body: "Hundreds of one-to-one lessons delivered since 2020",
        },
        {
          label: "Pastoral care trained",
          body: "Mental Health First Aid, Aberdeen Nightline coordinator",
        },
      ]),
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  const joaoQual = await db
    .insertInto("qualification")
    .values({
      tutorId: joao.id,
      subjectId: mathsAlevelId,
      rankId: await rankId("elite"),
      xp: 4200,
      verified: true,
      // Joao sets his own rates per qualification, above the subject defaults.
      ratePennies: 3500,
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  // A second bookable subject so the landing shows a real price range (GCSE + A-Level).
  await db
    .insertInto("qualification")
    .values({
      tutorId: joao.id,
      subjectId: await subjectId("Mathematics", "GCSE"),
      rankId: await rankId("elite"),
      xp: 4200,
      verified: true,
      ratePennies: 2800,
    })
    .execute()

  // Real testimonials migrated from Joao's prior profile. Rating-only and one-word
  // entries are left out — only reviews with something to say make the cut.
  const JOAO_REVIEWS = [
    {
      name: "Lisa (Westhill)",
      tags: ["builds_confidence", "explains_clearly", "exam_focused"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao has been an excellent support and mentor for our son while preparing for Nat5 Maths. His lessons are clearly structured, building a strong understanding of key concepts and the skills to tackle different exam questions. Our son has grown in confidence in what was a challenging subject and is now keen to take Higher Maths next year. We would highly recommend Joao.",
    },
    {
      name: "Umna (Glasgow)",
      tags: ["explains_clearly", "pushes_you", "exam_focused"] as ReviewTag[],
      rating: 5,
      comment:
        "Massive thanks to Joao for helping me through Higher SQA maths! He's not your typical tutor who just goes through the basics, he really pushes you to understand the logic. It made a huge difference in the exam because I could actually figure out the 'outside the box' questions that usually trip people up. Definitely one of the best tutors.",
    },
    {
      name: "Annabel (Worcester)",
      tags: ["builds_confidence", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Since starting maths tutoring for IB Maths AI with Joao I've found myself feeling more confident in classes and prepared for my exams. Every class I have control to review and study whatever I want, which is really helpful especially now that exams are approaching.",
    },
    {
      name: "Harpreet (Barking)",
      tags: ["exam_focused", "builds_confidence", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao was an amazing Maths tutor for my son. His support in GCSE Maths resulted in him getting a grade 9. Joao agreed a plan of action in the last 3 months leading to the exams to give him the confidence to tackle the harder topics, and his energy and enthusiasm motivated my son to push harder in his own preparation. I'd definitely recommend Joao.",
    },
    {
      name: "Trisha (Wassenaar)",
      tags: ["explains_clearly", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao is an excellent maths tutor. My 14-year-old daughter has tutored with him for two months and her grades have improved significantly — even more importantly, her understanding of the material has increased. He's reliable, friendly and communicates effectively. She's on an American curriculum at an International School in the Netherlands, and Joao has been amazing with the flexibility her curriculum needs.",
    },
    {
      name: "Inka (Reading)",
      tags: ["builds_confidence", "well_prepared", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao is a very good maths tutor. He's great at working through the curriculum in a structured way but equally very flexible to go over specific questions at short notice. My daughter says he's very good at explaining topics and easy to talk to. Her grades have improved, she feels more confident in class and has started to really enjoy the subject.",
    },
    {
      name: "Natalie (West Malling)",
      tags: ["builds_confidence", "explains_clearly", "great_with_teens"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao has been fantastic with my son. Owen had a tough time during Covid and lost confidence in his ability, and that has completely turned around — maths is now one of his favourite subjects. What he found most useful was Joao's ability to explain complex topics simply. He also felt relaxed with Joao, which brings out the best in teenagers.",
    },
    {
      name: "Sara (Cardigan)",
      tags: ["patient", "explains_clearly", "builds_confidence"] as ReviewTag[],
      rating: 5,
      comment:
        "My son has been tutored by Joao for GCSE maths for just over a year. Joao is friendly, patient, diligent and an excellent teacher. Things my son struggled to understand at school, Joao has been able to explain in one lesson, giving him clarity and a full understanding. My son has gained a huge amount of confidence in the subject.",
    },
    {
      name: "Cameron (Woking)",
      tags: ["great_with_teens", "explains_clearly", "patient"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao is great! My son is autistic and quite academic, and I wanted extra lessons due to the pandemic. My son gets on brilliantly with him and looks forward to his next lesson. He says Joao is charismatic, explains things clearly and is easy to talk to — a big thumbs up, as my son is socially shy — and he finds the lessons engaging.",
    },
    {
      name: "Amina (Uhldingen)",
      tags: ["always_on_time", "great_with_teens", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao is a very dedicated and disciplined young man. I have two teenage boys being tutored by him and he is always on time and takes his tutoring responsibilities seriously. He's also a great mathematician; both my boys enjoy his tutorials and have covered a great deal in a short period. I cannot recommend Joao highly enough.",
    },
    {
      name: "James (Magherafelt)",
      tags: ["explains_clearly", "exam_focused"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao was the best tutor I could have asked for. He went through all the content at a good pace and explained everything in a way that's understandable. I was able to pass both my exams thanks to him and couldn't have asked for a better tutor.",
    },
    {
      name: "Lucy (Cambridge)",
      tags: ["well_prepared", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "Great teacher — lessons are organised and always cover everything needed. A 10/10 experience with Joao, I really could not fault him.",
    },
    {
      name: "Gabriel",
      tags: ["explains_clearly", "patient"] as ReviewTag[],
      rating: 5,
      comment:
        "Best maths tutor I've ever had. Great at explaining, and he spared some time outside of class to answer questions. Absolute legend.",
    },
    {
      name: "Belen (Genève)",
      tags: ["well_prepared", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao is an outstanding tutor. He has excellent knowledge of the subject and great teaching skills. My son Gonzalo has been delighted to have him as a tutor for several months on IB maths. I would not hesitate to hire him again.",
    },
    {
      name: "Roxana (București)",
      tags: ["explains_clearly", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao's style of tutoring is very intuitive and hands-on. He made learning new things easy and provided extra practice sheets on request. His explanations are great and easy to understand.",
    },
    {
      name: "Catherine",
      tags: ["explains_clearly", "builds_confidence"] as ReviewTag[],
      rating: 5,
      comment:
        "Very helpful — he explained the theory needed to understand more complicated equations. I honestly feel smarter after the lesson.",
    },
    {
      name: "Sarah (West Malling)",
      tags: ["patient", "builds_confidence"] as ReviewTag[],
      rating: 5,
      comment:
        "Joao has been an incredible tutor for my son. His patience, care and support have been invaluable and my son has thrived since having lessons with him. Thank you so much for all your help.",
    },
    {
      name: "Ewan (Reading)",
      tags: ["explains_clearly", "exam_focused"] as ReviewTag[],
      rating: 5,
      comment:
        "A great tutor over the months leading up to exams, always friendly and ready to help. He gives a deep understanding of the material and good advice not just on maths but on exam technique, and he's very easy to ask questions to.",
    },
    {
      name: "Keli",
      tags: ["patient", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "Great teacher, very helpful and friendly. I was never afraid to ask questions when I was stuck. Even though I had to prepare for a maths exam in a short amount of time, Joao did an excellent job covering all the topics.",
    },
    {
      name: "Diane (Harrow)",
      tags: ["builds_confidence", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "Great tutor — my son felt really comfortable with Joao and improved his understanding of maths in the areas covered during the lessons.",
    },
    {
      name: "Alexandra (Oberaudorf)",
      tags: ["always_on_time", "explains_clearly"] as ReviewTag[],
      rating: 5,
      comment:
        "Our son is very happy with Joao's maths classes. Joao is excellent — very punctual and professional, with a great way of explaining maths.",
    },
    {
      name: "Lei",
      tags: ["patient", "well_prepared"] as ReviewTag[],
      rating: 5,
      comment:
        "Great first lesson. Joao prepared questions on the topics I was weak on and guided me through any difficulties I had. He was patient and had no qualms about going over something again. Highly recommended.",
    },
    {
      name: "Faisal",
      tags: ["explains_clearly", "patient"] as ReviewTag[],
      rating: 5,
      comment:
        "Very helpful, and able to cover a lot in a short period. He made sure I understood everything rather than just memorising a formula, and kept me engaged throughout the lesson. Thank you.",
    },
  ]
  // Each written review's real date on the source profile, in the order above.
  const JOAO_REVIEW_DATES = [
    "2026-05-13", "2026-05-07", "2026-03-04", "2025-08-23", "2024-12-09", "2024-11-25",
    "2023-06-12", "2022-12-05", "2021-05-21", "2022-04-17", "2025-11-05", "2024-12-11",
    "2023-07-17", "2022-08-09", "2023-06-06", "2022-12-18", "2023-06-17", "2022-06-11",
    "2021-08-31", "2021-08-23", "2021-09-11", "2022-05-08", "2022-01-22",
  ]
  // Indices of the written reviews Joao pinned on his source profile.
  const JOAO_PINNED = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 22])
  const joaoReviewers = await db
    .insertInto("student")
    .values(
      JOAO_REVIEWS.map((r, i) => ({
        userId: `joao-student-${i}`,
        displayName: r.name,
        hasCompletedIntro: true,
      })),
    )
    .returning("id")
    .execute()
  const joaoReviewedLessons = await db
    .insertInto("lesson")
    .values(
      JOAO_REVIEWS.map((_, i) => ({
        studentId: joaoReviewers[i]!.id,
        tutorId: joao.id,
        subjectId: mathsAlevelId,
        qualificationId: joaoQual.id,
        type: "standard" as const,
        mode: "recurring" as const,
        status: "completed" as const,
        startsAtUtc: new Date(Date.now() - (i + 2) * 7 * 24 * H),
        durationMin: 55,
        bufferMin: 5,
        pricePennies: 4200,
      })),
    )
    .returning("id")
    .execute()
  await db
    .insertInto("review")
    .values(
      JOAO_REVIEWS.map((r, i) => ({
        lessonId: joaoReviewedLessons[i]!.id,
        studentId: joaoReviewers[i]!.id,
        qualificationId: joaoQual.id,
        rating: r.rating,
        comment: r.comment,
        tags: r.tags,
        createdAt: new Date(JOAO_REVIEW_DATES[i]!),
        // The reviews Joao pinned on his source profile (by index into JOAO_REVIEWS).
        pinned: JOAO_PINNED.has(i),
      })),
    )
    .execute()

  // Rating-only reviews (a star, no written comment) from Joao's recurring students,
  // so the public count matches his real 265. Names are real, cycled across the pool.
  const RATING_NAMES = [
    "Gabriela (London)", "Ewan (Reading)", "Annabel (Worcester)", "Jane (Abu Dhabi)",
    "Angela (Budapest)", "Amina (Uhldingen)", "Faisal", "Lisa (Westhill)",
    "Samira (Crans VD)", "Pippa (Glasgow)", "Bria", "Catherine", "Belen (Genève)",
    "Roxana (București)", "Valentina (Edinburgh)", "Agnes (Luxembourg)", "Luca (London)",
    "Barry (Birmingham)", "Karin (Heidelberg)", "Giselle (Stirling)", "Donna (Glasgow)",
    "Bushra (North Berwick)", "Rebecca (Villars)", "Marc", "Andrew", "Nadja (Hünenberg)",
    "Francesca (Roma)", "Oscar", "Alissar (Abu Dhabi)", "Teresa (Potsdam)", "Judith",
    "Mylene", "Ebru (London)", "Phillip", "Isam", "Waleed", "Mary Beth (Concord)",
    "Nathaniel (Romford)", "Kartika (Dubai)", "Joe (Southend)", "Haroon (Carluke)",
    "Diane (Harrow)", "Alexandra (Oberaudorf)", "Sarah (West Malling)", "Keli", "Lei",
  ]
  // Real rating-only dates from the source profile, spread across 2021-2026, so the
  // full reviews list reads with authentic history instead of all landing on today.
  const RATING_DATES = [
    "2026-06-25", "2026-05-20", "2026-05-14", "2026-05-12", "2026-05-10", "2026-05-04",
    "2026-05-01", "2026-04-29", "2026-04-21", "2026-04-08", "2026-04-02", "2026-03-28",
    "2026-03-23", "2026-03-11", "2026-02-11", "2026-02-04", "2026-01-25", "2026-01-14",
    "2025-12-17", "2025-11-26", "2025-11-13", "2025-10-22", "2025-10-01", "2025-09-23",
    "2025-09-03", "2025-07-23", "2025-07-10", "2025-05-14", "2025-05-07", "2025-04-06",
    "2025-03-20", "2025-03-10", "2025-02-17", "2024-12-05", "2024-11-25", "2024-11-05",
    "2024-10-09", "2024-09-22", "2024-07-17", "2024-06-23", "2024-05-12", "2024-04-21",
    "2024-03-24", "2024-02-25", "2024-01-21", "2023-12-10", "2023-11-05", "2023-10-25",
    "2023-09-27", "2023-06-07", "2023-05-24", "2023-04-19", "2023-03-16", "2023-02-16",
    "2023-01-15", "2022-12-08", "2022-10-09", "2022-09-28", "2022-06-25", "2022-05-28",
    "2022-04-30", "2022-03-25", "2022-02-25", "2022-01-28", "2021-11-29", "2021-10-25",
    "2021-09-05", "2021-08-31",
  ]
  const RATING_COUNT = 265 - JOAO_REVIEWS.length
  const ratedStudents = await db
    .insertInto("student")
    .values(
      Array.from({ length: RATING_COUNT }, (_, i) => ({
        userId: `joao-rate-${i}`,
        displayName: RATING_NAMES[i % RATING_NAMES.length]!,
        hasCompletedIntro: true,
      })),
    )
    .returning("id")
    .execute()
  const ratedLessons = await db
    .insertInto("lesson")
    .values(
      Array.from({ length: RATING_COUNT }, (_, i) => ({
        studentId: ratedStudents[i]!.id,
        tutorId: joao.id,
        subjectId: mathsAlevelId,
        qualificationId: joaoQual.id,
        type: "standard" as const,
        mode: "recurring" as const,
        status: "completed" as const,
        startsAtUtc: new Date(Date.now() - (i + JOAO_REVIEWS.length + 2) * 3 * 24 * H),
        durationMin: 55,
        bufferMin: 5,
        pricePennies: 4200,
      })),
    )
    .returning("id")
    .execute()
  await db
    .insertInto("review")
    .values(
      Array.from({ length: RATING_COUNT }, (_, i) => ({
        lessonId: ratedLessons[i]!.id,
        studentId: ratedStudents[i]!.id,
        qualificationId: joaoQual.id,
        // Match Joao's real distribution: one 4-star, the rest 5-star.
        rating: i === 0 ? 4 : 5,
        comment: null,
        tags: [] as ReviewTag[],
        createdAt: new Date(RATING_DATES[i % RATING_DATES.length]!),
      })),
    )
    .execute()

  // A couple of pending edits from Joao, so the admin approvals queue isn't empty.
  const joaoRow = await db
    .selectFrom("tutor")
    .select(["tagline", "bio", "teachingStyle"])
    .where("id", "=", joao.id)
    .executeTakeFirstOrThrow()
  const newTagline =
    "Hi, I'm Joao. I teach Maths from KS2 to university level, and I love turning \"I'm just not a maths person\" into real confidence."
  await db
    .insertInto("profileChange")
    .values([
      {
        tutorId: joao.id,
        kind: "profile",
        summary: "Edited card pitch",
        payload: JSON.stringify({
          tagline: newTagline,
          bio: joaoRow.bio,
          teachingStyle: joaoRow.teachingStyle,
          prev: {
            tagline: joaoRow.tagline,
            bio: joaoRow.bio,
            teachingStyle: joaoRow.teachingStyle,
          },
        }),
      },
      {
        tutorId: joao.id,
        kind: "rate",
        summary: "A-Level Mathematics rate: £35 → £40",
        payload: JSON.stringify({
          qualificationId: joaoQual.id,
          subject: "A-Level Mathematics",
          ratePennies: 4000,
          prevPennies: 3500,
        }),
      },
    ])
    .execute()

  const adaConv = await db
    .insertInto("conversation")
    .values({ tutorId: ada.id, studentId: student.id })
    .returning("id")
    .executeTakeFirstOrThrow()
  const benConv = await db
    .insertInto("conversation")
    .values({ tutorId: ben.id, studentId: student.id })
    .returning("id")
    .executeTakeFirstOrThrow()

  // Weekly availability (weekday 0=Sun..6=Sat), local wall-clock in the tutor's tz.
  await db
    .insertInto("availability")
    .values([
      { tutorId: ada.id, weekday: 1, startTime: "17:00", endTime: "20:00" }, // Mon
      { tutorId: ada.id, weekday: 2, startTime: "09:00", endTime: "12:00" }, // Tue morning
      { tutorId: ada.id, weekday: 2, startTime: "16:00", endTime: "19:00" }, // Tue afternoon
      { tutorId: ada.id, weekday: 4, startTime: "16:00", endTime: "19:00" }, // Thu
      { tutorId: ada.id, weekday: 6, startTime: "09:00", endTime: "13:00" }, // Sat morning
      { tutorId: ada.id, weekday: 6, startTime: "15:00", endTime: "18:00" }, // Sat afternoon
      { tutorId: ben.id, weekday: 3, startTime: "18:00", endTime: "20:00" }, // Wed
      { tutorId: ben.id, weekday: 6, startTime: "10:00", endTime: "13:00" }, // Sat
      { tutorId: joao.id, weekday: 1, startTime: "16:00", endTime: "20:00" }, // Mon
      { tutorId: joao.id, weekday: 3, startTime: "16:00", endTime: "20:00" }, // Wed
      { tutorId: joao.id, weekday: 4, startTime: "17:00", endTime: "20:00" }, // Thu
      { tutorId: joao.id, weekday: 6, startTime: "10:00", endTime: "14:00" }, // Sat
    ])
    .execute()

  // Anchor in the recent past (not a fixed future date) so real messages sent
  // later append after these, and use a per-message offset so createdAt is
  // strictly increasing (Postgres now() would tie every row in one batch).
  const base = Date.now() - 60 * 60_000 // ~1h ago
  const at = (i: number) => new Date(base + i * 60_000)

  const messages = [
    { conversationId: adaConv.id, senderType: "system" as const, type: "system" as const, body: "Tue · A-Level Maths" },
    { conversationId: adaConv.id, senderType: "tutor" as const, type: "text" as const, body: "Great session today! Same time next week? 😊" },
    {
      conversationId: adaConv.id,
      senderType: "tutor" as const,
      type: "proposal" as const,
      payload: JSON.stringify({
        title: "Reschedule · pick a time",
        sub: "Ada suggested 3 slots",
        slots: ["Wed 16:00", "Thu 17:00", "Fri 16:00"],
      }),
    },
    { conversationId: adaConv.id, senderType: "student" as const, type: "text" as const, body: "Thursday works — confirmed ✅" },
    {
      conversationId: adaConv.id,
      senderType: "system" as const,
      type: "payment_request" as const,
      payload: JSON.stringify({ title: "Payment scheduled", sub: "£35 · card ending 4242 · in 24h" }),
    },
    { conversationId: adaConv.id, senderType: "system" as const, type: "rank_up" as const, body: "＋10 XP · streak now 6 weeks 🔥" },
    { conversationId: benConv.id, senderType: "system" as const, type: "system" as const, body: "Free intro · 15 min" },
    { conversationId: benConv.id, senderType: "tutor" as const, type: "text" as const, body: "Looking forward to meeting you on Saturday!" },
    { conversationId: benConv.id, senderType: "tutor" as const, type: "text" as const, body: "Here's the intro room link for Saturday." },
  ]

  await db
    .insertInto("message")
    .values(messages.map((m, i) => ({ ...m, createdAt: at(i) })))
    .execute()

  // Point each conversation's lastMessageAt at its final message.
  await db.updateTable("conversation").set({ lastMessageAt: at(5) }).where("id", "=", adaConv.id).execute()
  await db.updateTable("conversation").set({ lastMessageAt: at(8) }).where("id", "=", benConv.id).execute()

  void adaQual
  console.log("✓ demo data (2 tutors, 1 student, 2 conversations, 9 messages)")
}

/** Dev admin: the local signed-up account, so the approvals page is reachable. */
const ADMIN_EMAILS = ["eduardoferdcarvalho@gmail.com", "student@example.com"]

async function seedAdmins() {
  await db.deleteFrom("admin").execute()
  await db
    .insertInto("admin")
    .values(ADMIN_EMAILS.map((email) => ({ email })))
    .execute()
  console.log(`✓ admins (${ADMIN_EMAILS.length})`)
}

async function main() {
  await seedRanks()
  await seedSubjects()
  await seedBadges()
  await seedAdmins()
  await seedDemo()
  console.log("Seed complete.")
  await db.destroy()
}

void main()
