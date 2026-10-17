// Six-decimal ledger precision. Callers validate decimal strings before conversion.
export function inventoryMicros(amount: string) {
  const negative = amount.startsWith("-")
  const [whole, fraction = ""] = (negative ? amount.slice(1) : amount).split(".")
  const value = BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, "0"))
  return negative ? -value : value
}
export function inventoryAmount(value: bigint) {
  const magnitude = value < 0n ? -value : value
  const fraction = (magnitude % 1000000n).toString().padStart(6, "0").replace(/0+$/, "")
  return `${value < 0n ? "-" : ""}${magnitude / 1000000n}${fraction ? `.${fraction}` : ""}`
}
