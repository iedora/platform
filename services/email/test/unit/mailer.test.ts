import { describe, expect, test } from "bun:test"

import { createMailer } from "../../src/mailer.ts"

describe("createMailer (dev / jsonTransport)", () => {
  const mailer = createMailer({ from: "Acme <no-reply@acme.com>" }) // no host → jsonTransport

  test("send resolves without a real SMTP server", async () => {
    await expect(
      mailer.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" }),
    ).resolves.toBeUndefined()
  })

  test("handler sends the message payload", async () => {
    await expect(
      mailer.handler({ payload: { to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" } }),
    ).resolves.toBeUndefined()
  })
})
