import { allocate, type Money, money, multiply, subtract, zero } from "./money"

// Marketplace fee splits. The platform charges the payer a GROSS amount and keeps
// a FEE; the payee (tutor, seller, creator) receives the NET. This is the generic
// take-rate: a product supplies the rate/fee policy (tutor's rank commission,
// a flat 10%, a fixed listing fee), the framework computes exact minor units.

export interface FeeSplit {
  /** What the payer is charged. */
  gross: Money
  /** The platform's cut. */
  fee: Money
  /** What the payee receives (gross − fee). */
  net: Money
}

/**
 * Percentage take-rate: the platform keeps `rate` (0..1) of gross, the payee gets
 * the rest. Uses loss-free allocation so fee + net === gross to the minor unit.
 *
 * ```ts
 * // tutor: rank commission 0.2 on a $50 lesson
 * splitByRate(money(5000, "USD"), 0.2) // fee $10.00, net $40.00
 * ```
 */
export function splitByRate(gross: Money, rate: number): FeeSplit {
  if (rate < 0 || rate > 1) throw new RangeError(`fee rate must be in [0,1], got ${rate}`)
  // Allocate by weights so no minor unit is lost to rounding.
  const [fee, net] = allocate(gross, [rate, 1 - rate]) as [Money, Money]
  return { gross, fee, net }
}

/**
 * Fee = an optional fixed amount plus an optional percentage of gross, capped at
 * the gross (the payee never goes negative). Covers "flat 30¢ + 2.9%", a pure
 * fixed listing fee, or a pure percentage.
 */
export function splitByFee(gross: Money, fee: { fixed?: Money; percent?: number }): FeeSplit {
  let cut = zero(gross.currency)
  if (fee.fixed) {
    if (fee.fixed.currency !== gross.currency) {
      throw new TypeError(`fixed fee currency ${fee.fixed.currency} != gross ${gross.currency}`)
    }
    cut = { amount: cut.amount + fee.fixed.amount, currency: gross.currency }
  }
  if (fee.percent) {
    if (fee.percent < 0 || fee.percent > 1) throw new RangeError(`percent must be in [0,1], got ${fee.percent}`)
    cut = { amount: cut.amount + multiply(gross, fee.percent).amount, currency: gross.currency }
  }
  const capped = money(Math.min(cut.amount, gross.amount), gross.currency)
  return { gross, fee: capped, net: subtract(gross, capped) }
}
