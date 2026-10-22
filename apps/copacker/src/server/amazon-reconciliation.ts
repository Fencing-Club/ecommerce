import { z } from "zod"
import { exactMoney, formatMoney, sumMoney } from "@/lib/financial-money"

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

export function preferredPostingType(source: string) {
  if (source === "reimbursements") {
    return "FBAInventoryReimbursement"
  }
  return source === "returns" ? "Refund" : null
}

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

export function postingAmount(value: unknown) {
  const raw = object.safeParse(value).data
  return exactMoney(raw?.currencyAmount, raw?.currencyCode)
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
export function postingReferences(data: Record<string, unknown>) {
  return objects(data.relatedIdentifiers).flatMap((ref) => {
    const name = text(ref.relatedIdentifierName),
      value = text(ref.relatedIdentifierValue)
    return name && value ? [{ name, value }] : []
  })
}
export function postingEvidence(posting: ReconciliationPosting) {
  const items = objects(posting.data.items)
  const breakdowns = objects(posting.data.breakdowns)
  const references = postingReferences(posting.data)
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
type FinancialEvidence = ReturnType<typeof postingEvidence> & { total: unknown; hasReversalBreakdown?: boolean }
type ReimbursementCompetition = { rows: AmazonEvidence[]; truncated: boolean }

// Identical criteria for ranking a payment and finding other reports competing for that payment.
export function isStrongerPaymentCandidate(row: AmazonEvidence, posting: FinancialEvidence) {
  return (
    row.source === "reimbursements" &&
    Boolean(
      row.orderId &&
      (posting.orderId === row.orderId ||
        posting.references.some((ref) => ref.name === "ORDER_ID" && ref.value === row.orderId))
    ) &&
    Boolean(
      row.sku &&
      posting.products.some((item) => item.sku === row.sku && !(row.asin && item.asin && row.asin !== item.asin))
    ) &&
    posting.type === "FBAInventoryReimbursement" &&
    posting.marketplaceId === row.marketplaceId &&
    row.currency === posting.currency &&
    checkPostingTotal(posting.total, [{ currencyAmount: row.amount, currencyCode: row.currency }]) === "balanced"
  )
}

// Orderless reversals remain a separate diagnostic, never an order-backed stronger candidate.
function isPossibleReversalPayment(row: AmazonEvidence, posting: FinancialEvidence) {
  const amount = exactMoney(row.amount, row.currency)
  const orders = [
    posting.orderId,
    ...posting.references.filter((ref) => ref.name === "ORDER_ID").map((ref) => ref.value)
  ].filter(Boolean)
  return (
    row.source === "reimbursements" &&
    Boolean(amount && amount.integer < 0n) &&
    (!row.orderId || !orders.length) &&
    posting.type === "FBAInventoryReimbursement" &&
    posting.status === "RELEASED" &&
    !posting.hasReleaseLink &&
    Boolean(posting.hasReversalBreakdown) &&
    posting.marketplaceId === row.marketplaceId &&
    row.currency === posting.currency &&
    Boolean(
      row.sku &&
      row.asin &&
      posting.products.length &&
      posting.products.every((item) => item.sku === row.sku && item.asin === row.asin)
    ) &&
    posting.totals.items === "balanced" &&
    posting.totals.breakdowns === "balanced" &&
    checkPostingTotal(posting.total, [{ currencyAmount: row.amount, currencyCode: row.currency }]) === "balanced"
  )
}

// All-time stored report context is bounded separately from transaction and candidate pagination.
function paymentCompetition(rows: AmazonEvidence[], context: ReimbursementCompetition | undefined) {
  const reportsByOrder = new Map<string, AmazonEvidence[]>()
  for (const row of new Map([...(context?.rows ?? []), ...rows].map((row) => [row.id, row])).values()) {
    if (row.orderId) {
      const reports = reportsByOrder.get(row.orderId) ?? []
      reports.push(row)
      reportsByOrder.set(row.orderId, reports)
    }
  }
  const matches = new Map<string, string[]>()
  return (row: AmazonEvidence, posting: FinancialEvidence) => {
    let ids = matches.get(posting.transactionId)
    if (!ids) {
      const orders = new Set([
        posting.orderId,
        ...posting.references.filter((ref) => ref.name === "ORDER_ID").map((ref) => ref.value)
      ])
      ids = [...orders]
        .flatMap((order) => (order ? (reportsByOrder.get(order) ?? []) : []))
        .filter((report) => isStrongerPaymentCandidate(report, posting))
        .map((report) => report.id)
        .sort()
      matches.set(posting.transactionId, ids)
    }
    const others = ids.filter((id) => id !== row.id)
    let status = "not_assessed"
    if (context) {
      status = "no_other_matching_stored_rows"
      if (context.truncated) {
        status = "search_incomplete"
      }
      if (others.length) {
        status = "shared_candidate"
      }
    }
    return {
      status,
      scope: "stored_reimbursements_for_candidate_orders_all_dates",
      otherReportRowCount: context ? others.length : null,
      otherReportRowIds: context ? others.slice(0, 20) : [],
      returnedIdsTruncated: Boolean(context && others.length > 20),
      reportSearchTruncated: context?.truncated ?? null,
      countIsLowerBound: context?.truncated ?? null,
      paymentAssignmentConfirmed: false
    }
  }
}

export function reconcileAmazonEvidence(
  rows: AmazonEvidence[],
  inventory: Product[],
  postings: ReconciliationPosting[],
  candidatePage = 0,
  competition?: ReimbursementCompetition
) {
  const products = [...new Map(inventory.map((product) => [JSON.stringify(product), product])).values()]
  const financial = postings.map((posting) => {
    const items = objects(posting.data.items)
    const parts = objects(items[0]?.breakdowns)
    return {
      ...postingEvidence(posting),
      total: posting.data.totalAmount,
      // A single item with one explicit reversal component avoids inferring allocations within mixed payments.
      hasReversalBreakdown:
        items.length === 1 &&
        parts.length === 1 &&
        parts[0]?.breakdownType === "FBAReversedReimbursement" &&
        checkPostingTotal(posting.data.totalAmount, [parts[0]?.breakdownAmount]) === "balanced"
    }
  })
  const competingReports = paymentCompetition(rows, competition)
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
        const strongerPaymentCandidate = isStrongerPaymentCandidate(row, posting)
        return [
          {
            ...postingEvidenceFields(posting),
            strongerPaymentCandidate,
            possibleReversalPayment: isPossibleReversalPayment(row, posting),
            paymentCompetition: strongerPaymentCandidate ? competingReports(row, posting) : null,
            basis: orderReference ? "order_reference" : "product_only",
            itemIndexes: [...new Set(matchedItems.map((item) => item.itemIndex))],
            currencyMatches: row.currency ? row.currency === posting.currency : null,
            checks: reconciliationChecks(row, posting, orderReference, matchedItems.length)
          }
        ]
      })
      .sort(
        (a, b) =>
          Number(b.strongerPaymentCandidate) - Number(a.strongerPaymentCandidate) ||
          Number(b.possibleReversalPayment) - Number(a.possibleReversalPayment) ||
          Number(b.basis === "order_reference") - Number(a.basis === "order_reference") ||
          Number(b.type === preferredPostingType(row.source)) - Number(a.type === preferredPostingType(row.source)) ||
          (row.source === "reimbursements"
            ? Number(b.checks.signedSourceToTransactionTotal === "balanced") -
              Number(a.checks.signedSourceToTransactionTotal === "balanced")
            : 0) ||
          Math.abs(Date.parse(a.postedAt) - Date.parse(row.occurredAt)) -
            Math.abs(Date.parse(b.postedAt) - Date.parse(row.occurredAt)) ||
          a.transactionId.localeCompare(b.transactionId)
      )
    return {
      ...row,
      product: productMatch(row, products),
      finance: {
        status: candidates.length ? "candidates" : "unmatched",
        candidateCount: candidates.length,
        candidates: candidates.slice(candidatePage * 20, (candidatePage + 1) * 20),
        candidatePage,
        nextCandidatePage: candidates.length > (candidatePage + 1) * 20 ? candidatePage + 1 : null,
        reconciled: false,
        matching: {
          scope: "current_posting_search_page",
          candidateCount: candidates.length,
          strongerPaymentCandidateCount: candidates.filter((candidate) => candidate.strongerPaymentCandidate).length,
          possibleReversalPaymentCount: candidates.filter((candidate) => candidate.possibleReversalPayment).length,
          reversalPaymentCompetition: "not_assessed_across_report_pages",
          strongerPaymentCandidateBasis: "order_sku_marketplace_currency_signed_whole_transaction_amount",
          competingReportRows: competition ? "assessed_for_stronger_candidates" : "not_assessed_across_report_pages",
          sharedPaymentCandidateCount: competition
            ? candidates.filter((candidate) => candidate.paymentCompetition?.status === "shared_candidate").length
            : null,
          sameSignedAmountCount: candidates.filter(
            (candidate) =>
              candidate.checks.signedSourceToTransactionTotal === "balanced" &&
              candidate.type === preferredPostingType(row.source)
          ).length,
          ambiguity: candidates.length > 1 ? "multiple_candidates" : "unconfirmed",
          confirmation: "source_identifier_or_reviewed_allocation_required",
          amountAndProductAreNotUniqueIdentifiers: true
        }
      }
    }
  })
}

function postingEvidenceFields(posting: FinancialEvidence) {
  const { total: _total, hasReversalBreakdown: _hasReversalBreakdown, ...fields } = posting
  return fields
}

function reconciliationChecks(
  row: AmazonEvidence,
  posting: ReturnType<typeof postingEvidence> & { total: unknown },
  hasOrderReference: boolean,
  itemCount: number
) {
  const blockers: string[] = []
  if (!hasOrderReference) {
    blockers.push("no_order_reference")
  }
  if (!itemCount) {
    blockers.push("no_item_identity")
  }
  if (!posting.marketplaceId) {
    blockers.push("marketplace_missing")
  }
  if (posting.status !== "RELEASED") {
    blockers.push("not_released")
  }
  if (posting.hasReleaseLink) {
    blockers.push("deferred_release_requires_review")
  }
  if (posting.type !== preferredPostingType(row.source)) {
    blockers.push("posting_type_requires_review")
  }
  if (!row.currency) {
    blockers.push("source_currency_missing")
  } else if (row.currency !== posting.currency) {
    blockers.push("currency_mismatch")
  }
  if (posting.totals.breakdowns !== "balanced" || posting.totals.items !== "balanced") {
    blockers.push("posting_totals_unresolved")
  }
  const totalComparison =
    row.amount && row.currency
      ? checkPostingTotal(posting.total, [{ currencyAmount: row.amount, currencyCode: row.currency }])
      : "unavailable"
  const sourceAmount = exactMoney(row.amount, row.currency)
  const postingTotal = postingAmount(posting.total)
  const difference =
    sourceAmount && postingTotal && sourceAmount.currency === postingTotal.currency
      ? {
          currency: sourceAmount.currency,
          amount: formatMoney(
            sumMoney([postingTotal, { ...sourceAmount, integer: -sourceAmount.integer }], sourceAmount.currency)
          )
        }
      : null
  // Even equality compares different granularities. It never certifies an allocation or reversal.
  blockers.push("source_to_posting_allocation_required", "reversal_review_required")
  return {
    blockers,
    signedSourceToTransactionTotal: totalComparison,
    transactionMinusSource: difference,
    dateDistanceDays: Math.abs(Date.parse(posting.postedAt) - Date.parse(row.occurredAt)) / 86400000,
    amountComparisonMeaning: "whole_transaction_not_item_allocation",
    additionalRecognizedAmount: null
  }
}
