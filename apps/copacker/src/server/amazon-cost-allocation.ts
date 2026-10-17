import { z } from "zod"
import { type HistoricalProductMapping, historicalProductMatch } from "./amazon-product-mappings"
import { type ReconciliationPosting, postingAmount, checkPostingTotal, postingEvidence } from "./amazon-reconciliation"

const object = z.record(z.string(), z.unknown())
const list = z.array(object)
type Money = NonNullable<ReturnType<typeof postingAmount>>
function sum(values: Money[], currency: string): Money {
  const scale = Math.max(0, ...values.map((value) => value.scale))
  return {
    currency,
    scale,
    integer: values.reduce((total, value) => total + value.integer * 10n ** BigInt(scale - value.scale), 0n)
  }
}
function format(value: Money) {
  const digits = (value.integer < 0n ? -value.integer : value.integer).toString().padStart(value.scale + 1, "0")
  const sign = value.integer < 0n ? "-" : ""
  if (!value.scale) {
    return sign + digits
  }
  return `${sign}${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`
}
const isFee = (path: string[]) =>
  path.includes("AmazonFees") || ["Commission", "FBAPerUnitFulfillmentFee"].includes(path.at(-1) ?? "")
// Validate every parent/child sum and return leaves once. Unknown categories remain unclassified.
function feeLeaves(
  value: unknown,
  currency: string,
  path: string[] = [],
  depth = 0
): { valid: boolean; fees: Money[] } {
  const nodes = list.safeParse(value)
  if (!nodes.success || !nodes.data.length || depth > 20) {
    return { valid: false, fees: [] }
  }
  const fees: Money[] = []
  for (const node of nodes.data) {
    const amount = postingAmount(node.breakdownAmount)
    if (!amount || amount.currency !== currency || typeof node.breakdownType !== "string") {
      return { valid: false, fees: [] }
    }
    const next = [...path, node.breakdownType]
    const children = node.breakdowns
    if (children !== undefined && children !== null && !(Array.isArray(children) && children.length === 0)) {
      const parsed = list.safeParse(children)
      if (
        !parsed.success ||
        checkPostingTotal(
          node.breakdownAmount,
          parsed.data.map((child) => child.breakdownAmount)
        ) !== "balanced"
      ) {
        return { valid: false, fees: [] }
      }
      const nested = feeLeaves(children, currency, next, depth + 1)
      if (!nested.valid) {
        return { valid: false, fees: [] }
      }
      fees.push(...nested.fees)
    } else if (isFee(next)) {
      fees.push(amount)
    }
  }
  return { valid: true, fees }
}
export function allocateAmazonPosting(posting: ReconciliationPosting, mappings: HistoricalProductMapping[]) {
  const evidence = postingEvidence(posting)
  const total = postingAmount(posting.data.totalAmount)
  const partner = object.safeParse(posting.data.sellingPartnerMetadata).data
  const metadataMarketplace = typeof partner?.marketplaceId === "string" ? partner.marketplaceId : null
  const marketplace = evidence.marketplaceId ?? metadataMarketplace
  const items = list.safeParse(posting.data.items)
  let reason: string | null = null
  if (!total || total.currency !== posting.currency) {
    reason = "invalid_total"
  } else if (
    !marketplace ||
    (metadataMarketplace && evidence.marketplaceId && metadataMarketplace !== evidence.marketplaceId)
  ) {
    reason = "marketplace_unresolved"
  } else if (
    evidence.status !== "RELEASED" ||
    evidence.hasReleaseLink ||
    !["Shipment", "Refund"].includes(posting.type)
  ) {
    reason = "transaction_requires_review"
  } else if (!items.success || evidence.totals.items !== "balanced" || evidence.totals.breakdowns !== "balanced") {
    reason = "totals_not_balanced"
  }
  const transactionFees = feeLeaves(posting.data.breakdowns, posting.currency)
  const itemFees = items.success
    ? items.data.map((item) => {
        const roots = list.safeParse(item.breakdowns)
        if (
          !roots.success ||
          checkPostingTotal(
            item.totalAmount,
            roots.data.map((root) => root.breakdownAmount)
          ) !== "balanced"
        ) {
          return { valid: false, fees: [] }
        }
        return feeLeaves(item.breakdowns, posting.currency)
      })
    : []
  // Compare normalized money rather than lexical trailing zeros.
  const feeTotal = sum(transactionFees.fees, posting.currency)
  const allItemFees = sum(
    itemFees.flatMap((item) => item.fees),
    posting.currency
  )
  const balancedFees =
    transactionFees.valid &&
    itemFees.length > 0 &&
    itemFees.every((item) => item.valid) &&
    feeTotal.integer * 10n ** BigInt(allItemFees.scale) === allItemFees.integer * 10n ** BigInt(feeTotal.scale)
  const allocations =
    reason === null && items.success
      ? items.data.map((item, index) => {
          const contexts = list.safeParse(item.contexts)
          const identities = contexts.success
            ? contexts.data
                .filter((context) => context.contextType === "ProductContext")
                .map((context) => ({
                  sku: typeof context.sku === "string" ? context.sku : null,
                  asin: typeof context.asin === "string" ? context.asin : null
                }))
            : []
          const unique = [...new Map(identities.map((identity) => [JSON.stringify(identity), identity])).values()]
          const identity = unique.length === 1 ? unique[0] : null
          const match = identity
            ? historicalProductMatch(
                { ...identity, fnsku: null, marketplaceId: marketplace!, occurredAt: posting.postedAt.toISOString() },
                mappings
              )
            : null
          const target = match?.status === "confirmed" ? match.candidates[0] : null
          return {
            itemIndex: index,
            status: target ? "allocated" : "unallocated",
            reason: target ? null : (match?.status ?? "product_context_ambiguous"),
            mapping: target ?? null,
            net: format(postingAmount(item.totalAmount)!),
            fee: balancedFees ? format(sum(itemFees[index]!.fees, posting.currency)) : null
          }
        })
      : []
  const allocatedItems = allocations.filter((item) => item.status === "allocated")
  const allocatedNet = sum(
    allocatedItems.map((item) => postingAmount({ currencyCode: posting.currency, currencyAmount: item.net })!),
    posting.currency
  )
  const unallocated = total ? sum([total, { ...allocatedNet, integer: -allocatedNet.integer }], posting.currency) : null
  const allocatedFees =
    balancedFees && reason === null
      ? sum(
          allocatedItems.map((item) => postingAmount({ currencyCode: posting.currency, currencyAmount: item.fee })!),
          posting.currency
        )
      : null
  const unallocatedFees = allocatedFees
    ? sum([feeTotal, { ...allocatedFees, integer: -allocatedFees.integer }], posting.currency)
    : null
  return {
    transactionId: posting.transactionId,
    postedAt: posting.postedAt.toISOString(),
    currency: posting.currency,
    marketplaceId: marketplace,
    status: reason ? "unallocated" : "item_totals_reconciled",
    reason,
    allocationDateBasis: "posting_date",
    total: total ? format(total) : null,
    allocatedNet: format(allocatedNet),
    unallocatedNet: unallocated ? format(unallocated) : null,
    allocatedFees: allocatedFees ? format(allocatedFees) : null,
    unallocatedFees: unallocatedFees ? format(unallocatedFees) : null,
    recognizedFees: balancedFees && reason === null ? format(feeTotal) : null,
    feeCheck: balancedFees && reason === null ? "balanced" : "unavailable",
    feeScope: "AmazonFees, Commission, FBAPerUnitFulfillmentFee",
    allocations
  }
}
