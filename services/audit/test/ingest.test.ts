import { SQL } from "bun";
import { expect, test } from "bun:test";

import { bearer, useHarness } from "./harness";

const h = useHarness();

// The audit envelope a producer relay POSTs. `messageId` is the outbox row id
// (the idempotency key); `payload` is the @iedora/audit event shape.
function delivery(messageId: string, action: string) {
  return { messageId, payload: { source: "auth", action, actorType: "user", actorId: "u-1" } };
}

async function countByAction(url: string, action: string): Promise<number> {
  const sql = new SQL(url);
  const r = (await sql.unsafe(`SELECT count(*)::int AS n FROM audit_log WHERE action = $1`, [action])) as {
    n: number;
  }[];
  await sql.end();
  return r[0]!.n;
}

test("POST /events rejects requests without a service token", async () => {
  const res = await h.app.request("/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [delivery("m-noauth", "i.auth.session.login")] }),
  });
  expect(res.status).toBe(401);
});

test("POST /events records the event into audit_log", async () => {
  const res = await h.app.request("/events", {
    method: "POST",
    ...bearer(h),
    headers: { ...bearer(h).headers, "content-type": "application/json" },
    body: JSON.stringify({ events: [delivery("m-1", "i.auth.session.login")] }),
  });
  expect(res.status).toBe(200);
  expect(await countByAction(h.url, "i.auth.session.login")).toBe(1);
});

test("POST /events is idempotent by messageId (at-least-once safe)", async () => {
  const body = JSON.stringify({ events: [delivery("m-dup", "i.auth.dup.login")] });
  const opts = {
    method: "POST",
    ...bearer(h),
    headers: { ...bearer(h).headers, "content-type": "application/json" },
    body,
  };
  await h.app.request("/events", opts);
  await h.app.request("/events", opts); // redelivery of the same outbox message
  expect(await countByAction(h.url, "i.auth.dup.login")).toBe(1);
});

test("POST /events rejects a malformed body", async () => {
  const res = await h.app.request("/events", {
    method: "POST",
    ...bearer(h),
    headers: { ...bearer(h).headers, "content-type": "application/json" },
    body: JSON.stringify({ events: [] }),
  });
  expect(res.status).toBe(400);
});
