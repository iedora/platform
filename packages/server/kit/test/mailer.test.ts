import { expect, test } from "bun:test";

import { loggingMailer, mailerFromConfig, noopMailer, type SmtpConfig } from "../src/mailer";

const base: SmtpConfig = { host: "", port: 587, user: "", pass: "", secure: false, from: "iedora <no-reply@iedora.com>" };

test("mailerFromConfig: no host → noop in prod, logging in dev", () => {
  expect(mailerFromConfig(base, { prod: true })).toBe(noopMailer);
  expect(mailerFromConfig(base, { prod: false })).toBe(loggingMailer);
});

test("mailerFromConfig: a host → an SMTP transport, regardless of env", () => {
  const m = mailerFromConfig({ ...base, host: "smtp.example.com" }, { prod: true });
  expect(m).not.toBe(noopMailer);
  expect(m).not.toBe(loggingMailer);
  expect(typeof m.send).toBe("function");
});

test("noopMailer.send resolves without throwing", async () => {
  await expect(noopMailer.send({ to: "a@b.com", subject: "s", text: "t" })).resolves.toBeUndefined();
});
