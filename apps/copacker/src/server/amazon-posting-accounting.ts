import { equalMoney, formatMoney } from "@/lib/financial-money"
import { postingAmount, postingEvidence, postingReferences, type ReconciliationPosting } from "./amazon-reconciliation"
import type { SharedReleasePair } from "./amazon-shared-release"

export function postingLinks(row: ReconciliationPosting) {
  return postingReferences(row.data).filter((ref) =>
    ["RELEASE_TRANSACTION_ID", "DEFERRED_TRANSACTION_ID"].includes(ref.name)
  )
}
// Select the released posting once. Historical deferred copies and report amounts never create another contribution.
export function amazonPostingAccounting(
  row: ReconciliationPosting,
  related: ReconciliationPosting[],
  truncated: boolean,
  sharedPairs: SharedReleasePair[] = []
) {
  const evidence = postingEvidence(row),
    total = postingAmount(row.data.totalAmount)
  const ownLinks = postingLinks(row)
  const connectedIds = new Set([row.transactionId])
  const candidates = [...new Map(related.map((other) => [other.transactionId, other])).values()]
  const edges = new Map<string, Set<string>>()
  for (const other of candidates) {
    for (const ref of postingLinks(other)) {
      const outgoing = edges.get(other.transactionId) ?? new Set<string>()
      outgoing.add(ref.value)
      edges.set(other.transactionId, outgoing)
      const incoming = edges.get(ref.value) ?? new Set<string>()
      incoming.add(other.transactionId)
      edges.set(ref.value, incoming)
    }
  }
  const pending = [row.transactionId]
  for (const pair of sharedPairs) {
    for (const [from, to] of [
      [pair.originalId, pair.releasedId],
      [pair.releasedId, pair.originalId]
    ] as const) {
      const outgoing = edges.get(from) ?? new Set<string>()
      outgoing.add(to)
      edges.set(from, outgoing)
    }
  }
  for (let index = 0; index < pending.length; index++) {
    for (const id of edges.get(pending[index]!) ?? []) {
      if (!connectedIds.has(id)) {
        connectedIds.add(id)
        pending.push(id)
      }
    }
  }
  const relatedRows = candidates.filter(
    (other) => other.transactionId !== row.transactionId && connectedIds.has(other.transactionId)
  )
  const blockers: string[] = []
  if (truncated) {
    blockers.push("linked_search_truncated")
  }
  if (!total || total.currency !== row.currency) {
    blockers.push("invalid_total")
  }
  if (evidence.totals.breakdowns !== "balanced") {
    blockers.push("unbalanced_breakdowns")
  }
  if (!evidence.marketplaceId) {
    blockers.push("missing_marketplace")
  }
  if (ownLinks.some((ref) => !relatedRows.some((other) => other.transactionId === ref.value))) {
    blockers.push("missing_linked_posting")
  }
  const links = [...new Set(ownLinks.map((ref) => `${ref.name}:${ref.value}`))]
  if (links.length > 1 || relatedRows.length > 1) {
    blockers.push("ambiguous_release_chain")
  }
  for (const other of relatedRows) {
    const linked = postingEvidence(other),
      amount = postingAmount(other.data.totalAmount)
    const deferred = evidence.status === "DEFERRED_RELEASED" ? row : other
    const released = evidence.status === "RELEASED" ? row : other
    if (postingEvidence(deferred).status !== "DEFERRED_RELEASED" || postingEvidence(released).status !== "RELEASED") {
      blockers.push("inconsistent_release_status")
    }
    const directed =
      postingLinks(deferred).some(
        (ref) => ref.name === "RELEASE_TRANSACTION_ID" && ref.value === released.transactionId
      ) ||
      postingLinks(released).some(
        (ref) => ref.name === "DEFERRED_TRANSACTION_ID" && ref.value === deferred.transactionId
      )
    const contradictory =
      postingLinks(other).some((ref) => ref.value !== row.transactionId) ||
      ownLinks.some((ref) => ref.value !== other.transactionId) ||
      postingLinks(deferred).some((ref) => ref.name !== "RELEASE_TRANSACTION_ID") ||
      postingLinks(released).some((ref) => ref.name !== "DEFERRED_TRANSACTION_ID")
    const shared = sharedPairs.some(
      (pair) => pair.originalId === deferred.transactionId && pair.releasedId === released.transactionId
    )
    if ((!directed && !shared) || contradictory) {
      blockers.push("inconsistent_release_reference")
    }
    if (
      !amount ||
      !total ||
      !equalMoney(total, amount) ||
      amount.currency !== other.currency ||
      other.type !== row.type ||
      linked.marketplaceId !== evidence.marketplaceId ||
      (row.orderId !== null && other.orderId !== null && row.orderId !== other.orderId) ||
      linked.totals.breakdowns !== "balanced"
    ) {
      blockers.push("release_evidence_mismatch")
    }
  }
  if (evidence.status === "DEFERRED_RELEASED" && relatedRows.length === 0) {
    blockers.push("missing_release_reference")
  }
  if (!["DEFERRED", "DEFERRED_RELEASED", "RELEASED"].includes(evidence.status ?? "")) {
    blockers.push("unknown_status")
  }
  const included = blockers.length === 0 && evidence.status === "RELEASED"
  let status = "excluded_deferred_copy"
  if (blockers.length) {
    status = "requires_review"
  } else if (evidence.status === "DEFERRED") {
    status = "deferred"
  } else if (included) {
    status = "included_released_posting"
  }
  let linkBasis = ownLinks.length || relatedRows.length ? "explicit_release_reference" : null
  if (sharedPairs.some((pair) => pair.originalId === row.transactionId || pair.releasedId === row.transactionId)) {
    linkBasis = "unique_shared_shipment_or_refund_id"
  }
  return {
    status,
    blockers: [...new Set(blockers)],
    countingKey: included ? row.transactionId : null,
    releasedPostingAmount: included && total ? { amount: formatMoney(total), currency: total.currency } : null,
    linkedTransactionIds: relatedRows.map((other) => other.transactionId).sort(),
    linkBasis,
    basis: "released_posting_once_not_bank_settlement",
    reportAmountsAdded: false,
    costBasis: "unknown"
  }
}
