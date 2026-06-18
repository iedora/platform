import { expect, test } from "bun:test";

import { useHarness } from "./harness";

const h = useHarness();
const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

test("client-credentials token endpoint mints a service token", async () => {
  const ok = await h.app.request("/auth/token", { method: "POST", headers: { authorization: basic("admin-bff", "dev-secret") } });
  expect(ok.status).toBe(200);
  const body = (await ok.json()) as { accessToken: string; tokenType: string };
  expect(body.tokenType).toBe("Bearer");
  expect(body.accessToken).toBeTruthy();
});

test("client-credentials rejects a bad secret (401)", async () => {
  const bad = await h.app.request("/auth/token", { method: "POST", headers: { authorization: basic("admin-bff", "wrong") } });
  expect(bad.status).toBe(401);
});
