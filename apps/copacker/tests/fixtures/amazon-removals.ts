const common = {
  "request-date": "2026-10-02T10:00:00Z",
  "order-id": "REM1",
  sku: "SKU1",
  fnsku: "FN1",
  disposition: "UNSELLABLE",
  "shipped-quantity": "2"
}
const orders = {
  ...common,
  "order-source": "SELLER_INITIATED",
  "order-type": "Return",
  "service-speed": "Standard",
  "order-status": "Processing",
  "last-updated-date": "2026-10-10T12:00:00Z",
  "requested-quantity": "10",
  "cancelled-quantity": "1",
  "disposed-quantity": "3",
  "in-process-quantity": "4",
  "removal-fee": "2.123456789",
  currency: "USD"
}
const shipments = {
  ...common,
  "request-date": "2026-08-01T10:00:00Z",
  "shipment-date": "2026-10-05T12:00:00Z",
  carrier: "UPS",
  "tracking-number": "TRACK1",
  "removal-order-type": "Return"
}
export function removalReport(kind: "orders" | "shipments", rows: Record<string, string>[] = []) {
  const defaults: Record<string, string> = kind === "orders" ? orders : shipments
  const columns = Object.keys(defaults)
  return [
    columns.join("\t"),
    ...rows.map((row) => columns.map((column) => ({ ...defaults, ...row })[column] ?? "").join("\t"))
  ].join("\n")
}
