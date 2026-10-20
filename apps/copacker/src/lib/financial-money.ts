// Decimal comparison never rounds evidence into cents. JSON numbers have already lost any original lexical precision.
function decimal(value: unknown) {
  if (typeof value === "number" && Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return null
  }
  const raw = typeof value === "number" && Number.isFinite(value) ? String(value) : value
  if (typeof raw !== "string" || raw.length > 100 || !/^-?\d+(\.\d+)?$/.test(raw)) {
    return null
  }
  const [whole, fraction = ""] = raw.split(".")
  return { integer: BigInt(`${whole}${fraction}`), scale: fraction.length }
}
export type ExactMoney = { integer: bigint; scale: number; currency: string }
export function exactMoney(amount: unknown, currency: unknown): ExactMoney | null {
  const value = decimal(amount)
  return value && typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? { ...value, currency } : null
}
export function formatMoney(value: ExactMoney) {
  const digits = (value.integer < 0n ? -value.integer : value.integer).toString().padStart(value.scale + 1, "0")
  const sign = value.integer < 0n ? "-" : ""
  if (!value.scale) {
    return sign + digits
  }
  return `${sign}${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`
}
export function sumMoney(values: ExactMoney[], currency: string): ExactMoney {
  const scale = Math.max(0, ...values.map((value) => value.scale))
  return {
    currency,
    scale,
    integer: values.reduce((sum, value) => sum + value.integer * 10n ** BigInt(scale - value.scale), 0n)
  }
}
export function moneyTotals(values: ExactMoney[]) {
  return [...new Set(values.map((v) => v.currency))].sort().map((currency) => ({
    currency,
    amount: formatMoney(
      sumMoney(
        values.filter((v) => v.currency === currency),
        currency
      )
    )
  }))
}
export function equalMoney(left: ExactMoney, right: ExactMoney) {
  const scale = Math.max(left.scale, right.scale)
  return (
    left.currency === right.currency &&
    left.integer * 10n ** BigInt(scale - left.scale) === right.integer * 10n ** BigInt(scale - right.scale)
  )
}
