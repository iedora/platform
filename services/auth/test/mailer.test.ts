import { expect, test } from "bun:test";

import type { EmailMessage, Mailer } from "@iedora/server-kit";

import { makeResetMailer } from "../src/mailer";

function capture(): { sent: EmailMessage[]; mailer: Mailer } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    mailer: {
      async send(m) {
        sent.push(m);
      },
    },
  };
}

const URL = "https://menu.iedora.com/reset-password?token=abc123";

test("sendPasswordReset carries the reset URL in both text and html", async () => {
  const { sent, mailer } = capture();
  await makeResetMailer(mailer).sendPasswordReset("u@iedora.com", URL);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.to).toBe("u@iedora.com");
  expect(sent[0]!.subject).toMatch(/reset/i);
  expect(sent[0]!.text).toContain(URL);
  expect(sent[0]!.html ?? "").toContain(URL);
});

test("sendPasswordChanged is a notice with no reset link/token", async () => {
  const { sent, mailer } = capture();
  await makeResetMailer(mailer).sendPasswordChanged("u@iedora.com");
  expect(sent).toHaveLength(1);
  expect(sent[0]!.subject).toMatch(/changed/i);
  expect(sent[0]!.text).not.toMatch(/token|reset-password\?/i);
});
