import { expect, test } from "bun:test";

import { bearer, seedEvents, useHarness } from "./harness";

const h = useHarness();

test("rejects requests without a service token", async () => {
  expect((await h.app.request("/obs/events")).status).toBe(401);
});

test("queries events with a valid service token", async () => {
  // 3 auth logins + 1 billing event, all freshly seeded for this test.
  await seedEvents(h, [
    { source: "auth", action: "q.auth.session.login", ageSeconds: 0 },
    { source: "auth", action: "q.auth.session.login", ageSeconds: 1 },
    { source: "auth", action: "q.auth.session.login", ageSeconds: 2 },
    { source: "billing", action: "q.billing.invoice.paid", actorType: "service" },
  ]);
  const res = await h.app.request("/obs/events?action=q.", bearer(h));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { events: { action: string }[] };
  expect(body.events.length).toBe(4);
});

test("filters by action prefix", async () => {
  await seedEvents(h, [
    { source: "auth", action: "f.auth.session.login", ageSeconds: 0 },
    { source: "auth", action: "f.auth.session.login", ageSeconds: 1 },
    { source: "auth", action: "f.auth.session.login", ageSeconds: 2 },
    { source: "billing", action: "f.billing.invoice.paid", actorType: "service" },
  ]);
  const res = await h.app.request("/obs/events?action=f.auth.", bearer(h));
  const body = (await res.json()) as { events: { action: string }[] };
  expect(body.events.length).toBe(3);
  expect(body.events.every((e) => e.action.startsWith("f.auth."))).toBe(true);
});

test("keyset pagination walks newest-first without overlap", async () => {
  await seedEvents(h, [
    { source: "auth", action: "p.auth.session.login", ageSeconds: 0 },
    { source: "auth", action: "p.auth.session.login", ageSeconds: 1 },
    { source: "auth", action: "p.auth.session.login", ageSeconds: 2 },
  ]);
  const seen = new Set<string>();
  let q = "/obs/events?action=p.auth.&limit=2";
  for (;;) {
    const res = await h.app.request(q, bearer(h));
    const body = (await res.json()) as {
      events: { id: string }[];
      next?: { at: string; id: string };
    };
    if (body.events.length === 0) break;
    for (const e of body.events) {
      expect(seen.has(e.id)).toBe(false);
      seen.add(e.id);
    }
    if (!body.next) break;
    q = `/obs/events?action=p.auth.&limit=2&before_at=${encodeURIComponent(body.next.at)}&before_id=${body.next.id}`;
  }
  expect(seen.size).toBe(3);
});
