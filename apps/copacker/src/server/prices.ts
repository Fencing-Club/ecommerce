import type { OrderInput } from "@repo/copacker-orders"
import type { PackingDraft } from "@repo/copacker-shipments"
import type { proposalChanges } from "./order-proposals"

// Purchase order data for someone who doesn't see prices, for the client components that need the rest of it: every
// line without its price or its supplier's catalog price, and no cost adjustments.
export function unpricedOrder(data: OrderInput): OrderInput {
  const catalog = <Snapshot extends { priceMinor: number | null }>(snapshot: Snapshot | undefined) =>
    snapshot && { ...snapshot, priceMinor: null }
  return {
    ...data,
    adjustments: [],
    items: data.items.map((item) => ({
      ...item,
      unitPrice: 0,
      supplierCatalog: catalog(item.supplierCatalog),
      components: item.components?.map((component) => ({
        ...component,
        supplierCatalog: catalog(component.supplierCatalog)
      }))
    }))
  }
}

// A packing draft for someone who doesn't see prices: its invoice lines without prices. The server keeps the purchase
// order's prices when they save it.
export function unpricedDraft(draft: PackingDraft | null): PackingDraft | null {
  return draft && { ...draft, changes: draft.changes?.map(({ itemId, supplierSku }) => ({ itemId, supplierSku })) }
}

// Keep the shape of proposed changes visible without exposing their prices.
export function unpricedChanges(changes: ReturnType<typeof proposalChanges>): ReturnType<typeof proposalChanges> {
  return {
    ...changes,
    lines: changes.lines.map((line) =>
      line.change === "removed"
        ? { ...line, before: { ...line.before, unitPrice: 0 } }
        : { ...line, before: line.before && { ...line.before, unitPrice: 0 }, after: { ...line.after, unitPrice: 0 } }
    ),
    total: { before: 0, after: 0 }
  }
}
