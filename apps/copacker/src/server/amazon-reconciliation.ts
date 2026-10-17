import { z } from "zod"

const object = z.record(z.string(), z.unknown())
const objects = (value: unknown) => z.array(object).safeParse(value).data ?? []
const text = (value: unknown) => z.string().min(1).safeParse(value).data ?? null
export type AmazonEvidence = {
  id: string
  source: string
  occurredAt: string
  marketplaceId: string
  sku: string | null
  asin: string | null
  fnsku: string | null
  orderId: string | null
  currency: string | null
  amount: string | null
}
type Product = { sku: string; asin: string | null; fnsku: string | null }
export type ReconciliationPosting = {
  transactionId: string
  orderId: string | null
  postedAt: Date
  type: string
  currency: string
  data: Record<string, unknown>
}
const keys = ["sku", "asin", "fnsku"] as const

// Current inventory identity is an observation, not a historical product/batch assignment.
function productMatch(row: AmazonEvidence, products: Product[]) {
  const supplied = keys.filter((key) => row[key] !== null)
  if (!supplied.length) {
    return { status: "missing_identifiers", candidates: [] }
  }
  const candidates = products.filter((product) => supplied.some((key) => row[key] === product[key]))
  const exact = candidates.filter((product) => supplied.every((key) => row[key] === product[key]))
  let status = "unmatched"
  if (exact.length === 1) {
    status = "matched_current"
  } else if (candidates.length > 1) {
    status = "ambiguous"
  } else if (candidates.length) {
    status = "conflicting_identifiers"
  }
  const selected = exact.length ? exact : candidates
  return { status, candidates: selected.slice(0, 20), candidateCount: selected.length }
}

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
export function postingAmount(value: unknown) {
  const raw = object.safeParse(value).data
  const number = decimal(raw?.currencyAmount)
  const currency = text(raw?.currencyCode)
  return number && currency ? { ...number, currency } : null
}
export function checkPostingTotal(totalValue: unknown, parts: unknown[]) {
  const total = postingAmount(totalValue)
  const amounts = parts.map(postingAmount)
  if (!total || !amounts.length || amounts.some((value) => value === null)) {
    return "unavailable"
  }
  const valid = amounts.filter((value) => value !== null)
  if (valid.some((value) => value.currency !== total.currency)) {
    return "currency_mismatch"
  }
  const scale = Math.max(total.scale, ...valid.map((value) => value.scale))
  const normalized = (value: { integer: bigint; scale: number }) => value.integer * 10n ** BigInt(scale - value.scale)
  return valid.reduce((sum, value) => sum + normalized(value), 0n) === normalized(total)
    ? "balanced"
    : "amount_mismatch"
}
export function postingEvidence(posting: ReconciliationPosting) {
  const items = objects(posting.data.items)
  const breakdowns = objects(posting.data.breakdowns)
  const references = objects(posting.data.relatedIdentifiers).flatMap((ref) => {
    const name = text(ref.relatedIdentifierName),
      value = text(ref.relatedIdentifierValue)
    return name && value ? [{ name, value }] : []
  })
  const products = items.flatMap((item, index) =>
    objects(item.contexts).flatMap((context) => {
      if (context.contextType !== "ProductContext") {
        return []
      }
      const sku = text(context.sku),
        asin = text(context.asin)
      return sku || asin ? [{ itemIndex: index, sku, asin }] : []
    })
  )
  const marketplace = object.safeParse(posting.data.marketplaceDetails).data
  return {
    transactionId: posting.transactionId,
    orderId: posting.orderId,
    postedAt: posting.postedAt.toISOString(),
    type: posting.type,
    currency: posting.currency,
    marketplaceId: text(marketplace?.marketplaceId),
    status: text(posting.data.transactionStatus),
    references,
    products,
    hasReleaseLink: references.some(
      (ref) => ref.name === "DEFERRED_TRANSACTION_ID" || ref.name === "RELEASE_TRANSACTION_ID"
    ),
    totals: {
      breakdowns: checkPostingTotal(
        posting.data.totalAmount,
        breakdowns.map((part) => part.breakdownAmount)
      ),
      items: checkPostingTotal(
        posting.data.totalAmount,
        items.map((item) => item.totalAmount)
      )
    }
  }
}
export function reconcileAmazonEvidence(
  rows: AmazonEvidence[],
  inventory: Product[],
  postings: ReconciliationPosting[]
) {
  const products = [...new Map(inventory.map((product) => [JSON.stringify(product), product])).values()]
  const financial = postings.map(postingEvidence)
  return rows.map((row) => {
    const candidates = financial
      .flatMap((posting) => {
        // An explicitly different marketplace is not a match. Missing marketplace remains an unresolved candidate.
        if (posting.marketplaceId && posting.marketplaceId !== row.marketplaceId) {
          return []
        }
        const orderReference = Boolean(
          row.orderId &&
          (posting.orderId === row.orderId ||
            posting.references.some((ref) => ref.name === "ORDER_ID" && ref.value === row.orderId))
        )
        const matchedItems = posting.products.filter(
          (product) =>
            ((row.sku && row.sku === product.sku) || (row.asin && row.asin === product.asin)) &&
            !(row.sku && product.sku && row.sku !== product.sku) &&
            !(row.asin && product.asin && row.asin !== product.asin)
        )
        if (!orderReference && !matchedItems.length) {
          return []
        }
        return [
          {
            ...posting,
            basis: orderReference ? "order_reference" : "product_only",
            itemIndexes: matchedItems.map((item) => item.itemIndex),
            currencyMatches: row.currency ? row.currency === posting.currency : null
          }
        ]
      })
      .sort(
        (a, b) =>
          Number(b.basis === "order_reference") - Number(a.basis === "order_reference") ||
          a.transactionId.localeCompare(b.transactionId)
      )
    return {
      ...row,
      product: productMatch(row, products),
      finance: {
        status: candidates.length ? "candidates" : "unmatched",
        candidateCount: candidates.length,
        candidates: candidates.slice(0, 20),
        reconciled: false
      }
    }
  })
}
