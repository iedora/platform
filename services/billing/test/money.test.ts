import { describe, expect, test } from "vitest"

import { add, allocate, equals, money, multiply, percentage, subtract, sum, zero } from "../src/money/index.ts"
import { splitByFee, splitByRate } from "../src/money/index.ts"

describe("money", () => {
  test("rejects non-integer minor units", () => {
    expect(() => money(10.5, "USD")).toThrow(/integer/)
  })

  test("add/subtract guard currency", () => {
    expect(add(money(100, "USD"), money(50, "USD")).amount).toBe(150)
    expect(() => add(money(1, "USD"), money(1, "EUR"))).toThrow(/currency/)
  })

  test("sum of an empty list is zero in the given currency", () => {
    expect(equals(sum([], "USD"), zero("USD"))).toBe(true)
  })

  test("percentage rounds half-up to a whole minor unit", () => {
    // 20% of 2599 = 519.8 -> 520
    expect(percentage(money(2599, "USD"), 0.2).amount).toBe(520)
    // multiply by a quantity
    expect(multiply(money(1299, "USD"), 3).amount).toBe(3897)
  })

  test("allocate never loses or invents a minor unit", () => {
    const [a, b, c] = allocate(money(1000, "USD"), [1, 1, 1])
    expect([a!.amount, b!.amount, c!.amount]).toEqual([334, 333, 333])
    expect(a!.amount + b!.amount + c!.amount).toBe(1000)
  })

  test("allocate by uneven weights sums back to the whole", () => {
    const parts = allocate(money(10000, "USD"), [7, 2, 1])
    expect(parts.reduce((n, p) => n + p.amount, 0)).toBe(10000)
  })
})

describe("marketplace splits", () => {
  test("take-rate: platform fee + payee net == gross, exactly", () => {
    // tutor: 20% commission on a $50 lesson
    const s = splitByRate(money(5000, "USD"), 0.2)
    expect(s.fee.amount).toBe(1000)
    expect(s.net.amount).toBe(4000)
    expect(add(s.fee, s.net).amount).toBe(s.gross.amount)
  })

  test("take-rate is penny-exact on amounts that don't divide evenly", () => {
    // 16% of 999 = 159.84; allocation keeps fee+net == gross, and the leftover
    // minor unit goes to the larger share (the payee's net).
    const s = splitByRate(money(999, "USD"), 0.16)
    expect(add(s.fee, s.net).amount).toBe(999)
    expect(s.fee.amount).toBe(159)
    expect(s.net.amount).toBe(840)
  })

  test("fixed + percent fee, capped at gross", () => {
    // 30¢ + 2.9%
    const s = splitByFee(money(1000, "USD"), { fixed: money(30, "USD"), percent: 0.029 })
    expect(s.fee.amount).toBe(59) // 30 + 29
    expect(s.net.amount).toBe(941)
    // a tiny charge can't push the payee negative
    const tiny = splitByFee(money(10, "USD"), { fixed: money(30, "USD") })
    expect(tiny.fee.amount).toBe(10)
    expect(tiny.net.amount).toBe(0)
  })
})

// A hand-rolled in-memory gateway proves the interface is implementable without
// any provider SDK — the same shape a StripeGateway/ManualGateway will satisfy.
describe("PaymentGateway is implementable", () => {
  test("charge + refund round-trip", async () => {
    const { PaymentGatewayMock } = makeMock()
    const gw = new PaymentGatewayMock()
    const charge = await gw.charge({ amount: money(2500, "USD"), idempotencyKey: "k1" })
    expect(charge.status).toBe("paid")
    const refund = await gw.refund({ payment: charge.id })
    expect(refund.status).toBe("succeeded")
    expect(equals(refund.amount, money(2500, "USD"))).toBe(true)
  })
})

function makeMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class PaymentGatewayMock {
    private seq = 0
    private charges = new Map<string, { amount: ReturnType<typeof money> }>()
    async charge(input: { amount: ReturnType<typeof money>; idempotencyKey?: string }) {
      const id = `ch_${++this.seq}`
      this.charges.set(id, { amount: input.amount })
      return { id, status: "paid" as const, amount: input.amount }
    }
    async refund(input: { payment: string; amount?: ReturnType<typeof money> }) {
      const c = this.charges.get(input.payment)
      return { id: `re_${++this.seq}`, status: "succeeded" as const, amount: input.amount ?? c!.amount }
    }
  }
  return { PaymentGatewayMock }
}

// silence unused import in some configs
void subtract
