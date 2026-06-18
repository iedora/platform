import { expect, test } from "bun:test";

import { type AuthConfig, grantedRole } from "../src/config";
import { claims, json, PASSWORD, useHarness } from "./harness";

// ── unit: the resolver ───────────────────────────────────────────────────────
const cfg = {
  roleGrants: [
    { role: "admin", match: ["eduardoferdcarvalho@gmail.com", "@iedora.com"] },
    { role: "support", match: ["help@partner.com"] },
  ],
} as AuthConfig;

test("grantedRole: exact email match (case-insensitive, trimmed)", () => {
  expect(grantedRole(cfg, "eduardoferdcarvalho@gmail.com")).toBe("admin");
  expect(grantedRole(cfg, "  EduardoFerdCarvalho@Gmail.com ")).toBe("admin");
  expect(grantedRole(cfg, "help@partner.com")).toBe("support");
});

test("grantedRole: @domain entries match every address at that domain", () => {
  expect(grantedRole(cfg, "anyone@iedora.com")).toBe("admin");
  expect(grantedRole(cfg, "OPS@IEDORA.COM")).toBe("admin");
});

test("grantedRole: no match → undefined; first match wins; empty list grants nobody", () => {
  expect(grantedRole(cfg, "stranger@elsewhere.com")).toBeUndefined();
  expect(grantedRole(cfg, "")).toBeUndefined();
  const ordered = { roleGrants: [{ role: "admin", match: ["@iedora.com"] }, { role: "support", match: ["help@iedora.com"] }] } as AuthConfig;
  expect(grantedRole(ordered, "help@iedora.com")).toBe("admin");
  expect(grantedRole({ roleGrants: [] } as unknown as AuthConfig, "eduardoferdcarvalho@gmail.com")).toBeUndefined();
});

// ── integration: the hook (config has roleGrants admin=@... match ["admin@iedora.com"]) ──
const h = useHarness();

test("a ROLE_GRANTS address gets its role on register", async () => {
  const reg = await h.app.request("/auth/register", json({ email: "admin@iedora.com", password: PASSWORD, name: "Boss" }));
  expect(reg.status).toBe(200);
  expect(claims(((await reg.json()) as { accessToken: string }).accessToken).roles).toContain("admin");
});

test("the grant writes an auth.user.role_granted audit event", async () => {
  await h.app.request("/auth/register", json({ email: "audited-admin@iedora.com", password: PASSWORD, name: "Aud" }));
  const rows = await h.db.db.selectFrom("outbox").select(["payload"]).execute();
  const events = rows.map((r: { payload: Buffer }) => JSON.parse(Buffer.from(r.payload).toString("utf8")) as { action: string; meta?: { role?: string } });
  expect(events.find((e) => e.action === "auth.user.role_granted" && e.meta?.role === "admin")).toBeTruthy();
});

test("a non-matching address is NOT promoted, and the role persists across login", async () => {
  const plain = await h.app.request("/auth/register", json({ email: "plain@gmail.com", password: PASSWORD, name: "Plain" }));
  expect(claims(((await plain.json()) as { accessToken: string }).accessToken).roles ?? []).not.toContain("admin");

  await h.app.request("/auth/register", json({ email: "admin2@iedora.com", password: PASSWORD, name: "A2" }));
  const login = await h.app.request("/auth/login", json({ email: "admin2@iedora.com", password: PASSWORD }));
  expect(claims(((await login.json()) as { accessToken: string }).accessToken).roles).toContain("admin");
});
