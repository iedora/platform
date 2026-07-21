// @iedora/billing — domain-agnostic billing + payments framework.
// The mechanism (exact money, fee splits, a provider-agnostic gateway); products
// supply the policy (rates, plans, which provider).
export {
  add,
  allocate,
  compare,
  type Currency,
  equals,
  format,
  isNegative,
  isPositive,
  isZero,
  money,
  type Money,
  multiply,
  negate,
  percentage,
  type Rounding,
  subtract,
  sum,
  zero,
} from "./money.ts"
export { type FeeSplit, splitByFee, splitByRate } from "./split.ts"
export {
  type Charge,
  type ChargeInput,
  PaymentError,
  type PaymentErrorCode,
  type PaymentGateway,
  type PaymentStatus,
  type Refund,
  type RefundInput,
  type Setup,
  type SetupInput,
  type Transfer,
  type TransferInput,
} from "./gateway.ts"
