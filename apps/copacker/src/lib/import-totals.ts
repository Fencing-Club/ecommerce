import { LocalizedError } from "@/i18n/errors"
import type { ImportProposal } from "@/server/import-proposal"

// The money an imported purchase order adds up to, the same way in the review and when it saves, so what the review
// shows is what saving checks.

// A price as the document writes it, such as "4.08", in minor units: nonnegative, with at most two decimals, and at most
// 1,000,000.00. Anything else is refused with the reason.
export function priceInMinorUnits(value: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
    throw new LocalizedError("enterPrice")
  }
  const [whole, fraction = ""] = value.split(".")
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(result) || result > 100000000) {
    throw new LocalizedError("priceTooHigh")
  }
  return result
}

// A charge's amount in minor units. A discount is written negative, such as "-5.00".
export function chargeInMinorUnits(value: string) {
  const negative = value.startsWith("-")
  return (negative ? -1 : 1) * priceInMinorUnits(negative ? value.slice(1) : value)
}

// An amount while it's being reviewed: null until it's filled in and reads as one.
function reviewed(value: string | null, read: (value: string) => number) {
  if (value === null) {
    return null
  }
  try {
    return read(value)
  } catch {
    return null
  }
}

type Line = Pick<ImportProposal["items"][number], "pieces" | "pricePerPiece" | "sourceLineTotal">

// A line's units × price, and the total the document prints for it, each null while it's missing or not an amount.
export function lineTotals(line: Line) {
  const price = reviewed(line.pricePerPiece, priceInMinorUnits)
  return {
    computed: line.pieces === null || price === null ? null : line.pieces * price,
    printed: reviewed(line.sourceLineTotal, priceInMinorUnits)
  }
}

// The products, the charges and their total, or null while a line or charge is incomplete: incomplete input is
// expected while reviewing, and a zero would be invented. `difference` is how far the total is from the document's, or
// null when the document gives none.
export function importTotals(proposal: {
  items: Line[]
  adjustments: Array<Pick<ImportProposal["adjustments"][number], "amount">>
  documentTotal: string | null
}) {
  let products = 0
  for (const line of proposal.items) {
    const { computed } = lineTotals(line)
    if (computed === null) {
      return null
    }
    products += computed
  }
  let adjustments = 0
  for (const charge of proposal.adjustments) {
    const amount = reviewed(charge.amount, chargeInMinorUnits)
    if (amount === null) {
      return null
    }
    adjustments += amount
  }
  const documentTotal = reviewed(proposal.documentTotal, priceInMinorUnits)
  const total = products + adjustments
  return { products, adjustments, total, difference: documentTotal === null ? null : total - documentTotal }
}
