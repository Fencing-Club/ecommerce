import type { inventoryBasisRecords, inventoryLandedCharges } from "@/db/schema"
import { inventoryAmount, inventoryMicros } from "./inventory-money"
type Record = typeof inventoryBasisRecords.$inferSelect
type Charge = typeof inventoryLandedCharges.$inferSelect
type Lot = {
  id: string
  purchaseId: string | null
  quantity: number
  consumed: number
  value: bigint | null
  currency: string | null
  estimated: boolean
}
const amounts = (values: Map<string, bigint>) =>
  [...values]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: inventoryAmount(amount) }))
const share = (value: bigint, start: number, count: number, quantity: number) =>
  (value * BigInt(start + count)) / BigInt(quantity) - (value * BigInt(start)) / BigInt(quantity)
// Recomputed from current evidence; no persisted allocations become stale after corrections or late bills.
export function calculateInventoryFifo(records: Record[], charges: Charge[], opening: Record, from: Date, to: Date) {
  const active = records.filter((row) => !row.retiredAt)
  const purchases = new Map(
    active.filter((row) => row.kind === "purchase" && row.occurredAt < to).map((row) => [row.id, row])
  )
  const receipts = active
    .filter((row) => row.kind === "receipt" && row.occurredAt < to)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id))
  const purchaseValues = new Map<string, { value: bigint; currency: string; estimated: boolean; received: number }>()
  const landedByPurchase = new Map<string, { value: bigint; estimated: boolean }>()
  for (const charge of charges.filter((row) => !row.retiredAt)) {
    for (const allocation of charge.allocations) {
      const purchase = purchases.get(allocation.purchaseId)
      if (!purchase) {
        continue
      }
      if (charge.data.currency !== purchase.data.totalCost?.currency) {
        throw new Error("Landed currency mismatch")
      }
      const prior = landedByPurchase.get(purchase.id)
      landedByPurchase.set(purchase.id, {
        value: (prior?.value ?? 0n) + inventoryMicros(allocation.amount),
        estimated: (prior?.estimated ?? false) || charge.data.costBasis !== "actual"
      })
    }
  }
  for (const purchase of purchases.values()) {
    if (!purchase.data.totalCost) {
      continue
    }
    const total = purchase.data.totalCost,
      landed = landedByPurchase.get(purchase.id)
    const value = inventoryMicros(total.amount) + (landed?.value ?? 0n)
    const estimated = purchase.data.costBasis !== "actual" || (landed?.estimated ?? false)
    if (value < 0n) {
      throw new Error("Negative landed value")
    }
    purchaseValues.set(purchase.id, { value, currency: total.currency, estimated, received: 0 })
  }
  const receiptValues = new Map<string, { value: bigint; currency: string; estimated: boolean }>()
  for (const receipt of receipts) {
    const purchase = purchases.get(receipt.purchaseId ?? ""),
      valuation = purchaseValues.get(receipt.purchaseId ?? "")
    if (!purchase || !valuation) {
      continue
    }
    if (valuation.received + receipt.quantity > purchase.quantity) {
      throw new Error("Receipt quantity exceeded")
    }
    receiptValues.set(receipt.id, {
      value: share(valuation.value, valuation.received, receipt.quantity, purchase.quantity),
      currency: valuation.currency,
      estimated: valuation.estimated
    })
    valuation.received += receipt.quantity
  }
  const lots: Lot[] = []
  if (opening.quantity > 0) {
    lots.push({
      id: opening.id,
      purchaseId: null,
      quantity: opening.quantity,
      consumed: 0,
      value: opening.data.totalCost ? inventoryMicros(opening.data.totalCost.amount) : null,
      currency: opening.data.totalCost?.currency ?? null,
      estimated: opening.data.costBasis !== "actual"
    })
  }
  const relevant = active.filter((row) => row.location === opening.location && row.occurredAt < to)
  const excluded = {
    receiptsAtOrBeforeCutover: relevant
      .filter((row) => row.kind === "receipt" && row.occurredAt <= opening.occurredAt)
      .map((row) => row.id),
    nonSellableReceipts: relevant
      .filter((row) => row.data.input.kind === "receipt" && row.data.input.condition !== "sellable")
      .map((row) => row.id),
    depletionsBeforeCutover: relevant
      .filter((row) => row.kind === "depletion" && row.occurredAt < opening.occurredAt)
      .map((row) => row.id)
  }
  const events = relevant
    .filter(
      (row) =>
        (row.data.input.kind === "receipt" &&
          row.data.input.condition === "sellable" &&
          row.occurredAt > opening.occurredAt) ||
        (row.kind === "depletion" && row.occurredAt >= opening.occurredAt)
    )
    .sort((a, b) => {
      const date = a.occurredAt.getTime() - b.occurredAt.getTime()
      if (date) {
        return date
      }
      if (a.kind === b.kind) {
        return a.id.localeCompare(b.id)
      }
      return a.kind === "receipt" ? -1 : 1
    })
  let hasShortage = false
  let nextLot = 0
  const periodCosts = new Map<string, bigint>()
  const rows = []
  for (const event of events) {
    if (event.kind === "receipt") {
      const valuation = receiptValues.get(event.id)
      lots.push({
        id: event.id,
        purchaseId: event.purchaseId,
        quantity: event.quantity,
        consumed: 0,
        value: valuation?.value ?? null,
        currency: valuation?.currency ?? null,
        estimated: valuation?.estimated ?? true
      })
      continue
    }
    const wasBlocked = hasShortage
    let needed = event.quantity,
      unknownCostQuantity = 0,
      estimated = false
    const costs = new Map<string, bigint>()
    const allocations = []
    if (!wasBlocked) {
      while (nextLot < lots.length && needed > 0) {
        const lot = lots[nextLot]!
        const quantity = Math.min(needed, lot.quantity - lot.consumed)
        if (quantity <= 0) {
          nextLot += 1
          continue
        }
        const cost = lot.value === null ? null : share(lot.value, lot.consumed, quantity, lot.quantity)
        allocations.push({
          lotId: lot.id,
          purchaseId: lot.purchaseId,
          quantity,
          amount: cost === null ? null : inventoryAmount(cost),
          currency: lot.currency,
          estimated: lot.estimated
        })
        if (cost === null || !lot.currency) {
          unknownCostQuantity += quantity
        } else {
          costs.set(lot.currency, (costs.get(lot.currency) ?? 0n) + cost)
        }
        estimated ||= lot.estimated
        lot.consumed += quantity
        needed -= quantity
        if (lot.consumed === lot.quantity) {
          nextLot += 1
        }
      }
    }
    if (needed > 0) {
      hasShortage = true
    }
    let status = "valued"
    if (wasBlocked) {
      status = "blocked_after_shortage"
    } else if (needed > 0) {
      status = "insufficient_inventory"
    } else if (unknownCostQuantity > 0) {
      status = "missing_cost"
    } else if (costs.size > 1) {
      status = "mixed_currency"
    } else if (estimated) {
      status = "estimated"
    }
    if (event.occurredAt >= from) {
      for (const [currency, value] of costs) {
        periodCosts.set(currency, (periodCosts.get(currency) ?? 0n) + value)
      }
      const knownCosts = amounts(costs)
      rows.push({
        id: event.id,
        occurredAt: event.occurredAt,
        quantity: event.quantity,
        status,
        unallocatedQuantity: needed,
        unknownCostQuantity,
        allocations,
        knownCosts,
        cogs: needed === 0 && unknownCostQuantity === 0 && knownCosts.length === 1 ? knownCosts[0] : null
      })
    }
  }
  const remaining = new Map<string, bigint>()
  let unknownRemainingQuantity = 0
  const balances = lots.map((lot) => {
    const quantity = lot.quantity - lot.consumed
    const value = lot.value === null ? null : lot.value - (lot.value * BigInt(lot.consumed)) / BigInt(lot.quantity)
    if (value === null) {
      unknownRemainingQuantity += quantity
    } else if (lot.currency) {
      remaining.set(lot.currency, (remaining.get(lot.currency) ?? 0n) + value)
    }
    return {
      lotId: lot.id,
      purchaseId: lot.purchaseId,
      quantity,
      amount: value === null ? null : inventoryAmount(value),
      currency: lot.currency,
      estimated: lot.estimated
    }
  })
  return {
    rows,
    openingId: opening.id,
    cutover: opening.occurredAt,
    valuationBasis: "current_active_evidence",
    knownCogsByCurrency: amounts(periodCosts),
    recordedCostCoverageComplete: !hasShortage && rows.every((row) => row.unknownCostQuantity === 0),
    hasEstimatedCosts: rows.some((row) => row.allocations.some((allocation) => allocation.estimated)),
    hasEstimatedInventoryValue: balances.some((lot) => lot.quantity > 0 && lot.estimated),
    hasShortage,
    endingQuantity: hasShortage ? null : balances.reduce((sum, lot) => sum + lot.quantity, 0),
    knownEndingValues: hasShortage ? null : amounts(remaining),
    unknownRemainingQuantity,
    lots: balances.slice(0, 100),
    lotsTruncated: balances.length > 100,
    excluded,
    purchases: [...purchaseValues].map(([id, value]) => ({
      purchaseId: id,
      landedValue: inventoryAmount(value.value),
      currency: value.currency,
      estimated: value.estimated,
      receivedQuantity: value.received,
      unreceivedValue: inventoryAmount(
        value.value - (value.value * BigInt(value.received)) / BigInt(purchases.get(id)!.quantity)
      )
    })),
    notes: [
      "Recorded evidence does not establish complete source coverage.",
      "Opening inventory includes receipts at or before cutover; receipts are not added twice.",
      "Late bills restate prior costs. No historical knowledge-date snapshot or automatic FX is implied.",
      "After an inventory shortage, later depletion is blocked and lot balances are provisional until evidence is corrected.",
      "Purchase and receipt cost snapshots exclude unrecorded landed charges; absence of a bill is not proof of zero cost."
    ]
  }
}
