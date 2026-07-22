# @iedora/jobs

A durable job scheduler backed by a single Postgres table. Schedule work to run in
the future, cancel it, retry it with backoff — using the database you already run,
no broker and no external workflow SaaS.

It's the standard "just Postgres" queue pattern: jobs are claimed with
`FOR UPDATE SKIP LOCKED`, so any number of workers can poll the same table without
running a job twice, and a crashed worker's in-flight jobs are reclaimed after a
timeout.

## Why it exists

Some work is *scheduled and cancellable*: "10 minutes before the lesson, open the
room; if the lesson is cancelled, don't." An in-process `setTimeout` loses that on
the next deploy. This gives you durable timers that survive restarts, plus
cancellation and retries, without adding a queue service.

## Usage

```ts
import { createJobs } from "@iedora/jobs"

const jobs = createJobs({
  connectionString: process.env.DATABASE_URL!,
  handlers: {
    "send-reminder": async ({ payload }) => {
      await sendReminder(payload.userId as string)
    },
    // A step chain: do work, then schedule the next step.
    "settle-payment": async ({ payload, schedule }) => {
      const paid = await settle(payload.orderId as string)
      if (!paid) {
        await schedule({
          kind: "release-hold",
          runAt: new Date(Date.now() + 60 * 60_000),
          payload,
          key: payload.orderId as string,
        })
      }
    },
  },
})

jobs.start() // begin polling

// Schedule a job for the future, grouped under a cancellation key:
await jobs.schedule({
  kind: "send-reminder",
  runAt: new Date(Date.now() + 24 * 60 * 60_000),
  payload: { userId: "u_123" },
  key: "user:u_123",
})

// Cancel everything still pending for that key:
await jobs.cancelByKey("user:u_123")

// On shutdown:
await jobs.stop()
```

## Handlers must be idempotent

Delivery is at-least-once: a worker can crash after doing the work but before
marking the job done, and the job will run again after `reclaimAfterMs`. Make
handlers safe to run twice (e.g. guard on a status column, use an idempotency key).

## The table

The runner does **DML only** — it never creates its own table (so it works under a
DML-only database role). Create `scheduled_jobs` with a migration; the canonical DDL
is exported as `SCHEDULED_JOBS_DDL`, and `jobs.ensureSchema()` applies it in
tests/dev where the connecting role has DDL rights.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `pollIntervalMs` | `5000` | How often to poll for due jobs. |
| `batchSize` | `20` | Max jobs claimed per poll. |
| `defaultMaxAttempts` | `5` | Retries before a job is failed (override per job). |
| `reclaimAfterMs` | `300000` | A `running` job untouched this long is reclaimed. |
| `backoff` | expo | `attempt => ms` delay before a retry. |
| `onError` | no-op | Observe handler/poll failures. |
| `now` | `() => new Date()` | Injectable clock, for tests. |
