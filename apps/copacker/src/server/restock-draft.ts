import { orderInputSchema } from "@repo/copacker-orders"
import { z } from "zod"
import { can } from "@/lib/access"
import { CliError } from "./cli-auth"
import type { restockDefinitions } from "./operation-restock"
import { orderLineCatalog } from "./order-line-catalog"
import { prepareOrder } from "./orders"
import type { Session } from "./workspace-session"

const selectedLine = z.strictObject({
  rowId: z.uuid(),
  purchaseUnits: z.number().int().positive().max(1000000),
  receiver: z.enum(["fba", "awd_us", "warehouse"])
})
// Reuse the commercial field constraints; clients select report rows, never supply hydrated product identities.
const restockDraftSelectionSchema = z.strictObject({
  reference: orderInputSchema.shape.reference,
  supplierId: orderInputSchema.shape.supplierId,
  currency: orderInputSchema.shape.currency,
  deliveryId: orderInputSchema.shape.deliveryId,
  via: orderInputSchema.shape.via,
  lines: z.array(selectedLine).min(1).max(150)
})
type Report = z.output<(typeof restockDefinitions)["report.restock"]["output"]>

// Preparation only: the future plan handler owns authorization, retained-report lookup, dependency validation and
// persistence. Calling this function does not make a report consumable and never creates or sends an order.
export async function prepareRestockDraft(s: Session, report: Report, raw: unknown) {
  if (s.org.kind !== "buyer" || !can(s, "restock") || !can(s, "orders", "edit") || !can(s, "prices")) {
    throw new CliError("forbidden", "Restock and purchase-order editing access with prices are required.", 403)
  }
  const selection = restockDraftSelectionSchema.parse(raw)
  if (Date.parse(report.expiresAt) <= Date.now()) {
    throw new CliError("stale_plan", "Request a new restock report before preparing drafts.", 409)
  }
  const rows = selection.lines.map((selected) => {
    const row = report.rows.find((candidate) => candidate.rowId === selected.rowId)
    const channel = report.channels.find((candidate) => candidate.id === row?.channelId)
    if (!row || !channel?.eligible) {
      throw new CliError("invalid_input", "Select an eligible row from this report.")
    }
    if (
      row.blocked.length ||
      row.explanation.issues.length ||
      row.purchaseUnits === null ||
      row.status === "not_stocked" ||
      row.status === "no_listing" ||
      row.supplier?.id !== selection.supplierId ||
      row.unitCostMinor === null ||
      row.costCurrency !== selection.currency ||
      row.packOf === null ||
      row.packOf < 1
    ) {
      throw new CliError(
        "validation_failed",
        "Resolve the row's supplier, stock, demand, pack and price before ordering.",
        409
      )
    }
    if ((channel.kind === "amazon") !== (selected.receiver !== "warehouse")) {
      throw new CliError("invalid_input", "The selected receiver does not match the restock channel.")
    }
    if (
      (row.minimumOrder !== null && selected.purchaseUnits < row.minimumOrder) ||
      (row.caseQuantity !== null && row.caseQuantity > 0 && selected.purchaseUnits % row.caseQuantity !== 0)
    ) {
      throw new CliError("validation_failed", "Selected units must satisfy the row's minimum and case quantity.", 409)
    }
    return { selected, row, channel }
  })
  const first = rows[0]!
  if (
    new Set(rows.map(({ row }) => row.variantId)).size !== rows.length ||
    rows.some(
      ({ row, channel }) =>
        row.source.connectionId !== first.row.source.connectionId ||
        row.source.accountId !== first.row.source.accountId ||
        channel.id !== first.channel.id
    )
  ) {
    throw new CliError("invalid_input", "A draft must use one channel and store, with each variant appearing once.")
  }
  const catalog = await orderLineCatalog(
    s.org.id,
    first.row.source.accountId,
    rows.map(({ row }) => row.variantId),
    selection.currency,
    first.channel.kind === "amazon" ? "amazon" : "warehouse"
  )
  const items = rows.map(({ selected, row }) => {
    const line = catalog.get(row.variantId)
    if (!line || line.piecesPerSet !== row.packOf || line.buyerSku !== row.sku) {
      throw new CliError("stale_plan", "Product identity or pack size changed. Request a new report.", 409)
    }
    // The report quotes sellable units; the shared PO model prices pieces. Never hide a rounding discrepancy.
    const unitPrice = row.unitCostMinor! / line.piecesPerSet
    if (!Number.isSafeInteger(unitPrice)) {
      throw new CliError("validation_failed", "The report cost cannot be represented exactly per piece.", 409)
    }
    return { ...line, pieces: selected.purchaseUnits * line.piecesPerSet, unitPrice, receiver: selected.receiver }
  })
  const { lines: _, ...fields } = selection
  const prepared = await prepareOrder(s, orderInputSchema.parse({ ...fields, items }))
  if (prepared.shopifyDomain !== first.row.source.accountId) {
    throw new CliError("stale_plan", "The connected store changed. Request a new report.", 409)
  }
  if (
    prepared.input.items.some((line, index) => {
      const selected = items[index]
      return (
        !selected ||
        line.variantId !== selected.variantId ||
        line.piecesPerSet !== selected.piecesPerSet ||
        line.buyerSku !== selected.buyerSku ||
        line.inventoryItemId !== selected.inventoryItemId
      )
    })
  ) {
    throw new CliError("stale_plan", "Product identity changed during preparation. Request a new report.", 409)
  }
  return prepared
}
