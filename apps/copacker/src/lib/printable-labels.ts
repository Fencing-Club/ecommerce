import type { OrderItem } from "@repo/copacker-orders"
import { needsWarningLabel } from "@repo/copacker-shipments/requirements"
import type { LineLabel } from "@/server/product-barcodes"

// The product labels a packer prints, in the order the packing details list them.
export const printableLabelTypes = ["sku", "fnsku", "suffocation", "choking"] as const
export type PrintableLabelType = (typeof printableLabelTypes)[number]

// What one line's packing details ask it to print. A problem says why a barcode label can't be made yet; choking
// hazard labels come from the buyer, and Copacker doesn't make them.
export function printableLabels(
  item: Pick<OrderItem, "suffocationWarning" | "packingRequirements">,
  labels: ReadonlyArray<Pick<LineLabel, "state"> & { type?: "sku" | "fnsku"; problem?: string }>
): Array<{ type: PrintableLabelType; problem?: string }> {
  const barcode = (type: "sku" | "fnsku") => {
    const own = labels.filter((label) => label.state !== "none" && label.type === type)
    return own.length ? [{ type, problem: own.find((label) => label.state === "missing")?.problem }] : []
  }
  return [
    ...barcode("sku"),
    ...barcode("fnsku"),
    ...(needsWarningLabel(item) ? [{ type: "suffocation" as const }] : []),
    ...(item.packingRequirements?.labels.includes("choking") ? [{ type: "choking" as const }] : [])
  ]
}
