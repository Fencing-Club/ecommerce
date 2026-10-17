const monthly = {
  asin: "A1",
  fnsku: "FN1",
  fulfillment_center: "FC1",
  country_code: "US",
  month_of_charge: "2026-09",
  currency: "USD",
  estimated_monthly_storage_fee: "12.345678901",
  average_quantity_on_hand: "2.75",
  item_volume: "0.001234",
  volume_units: "cubic feet",
  storage_rate: "0.78",
  est_base_msf: "10",
  est_sus: "2.345678901"
}
const aged = {
  "snapshot-date": "2026-09-15",
  sku: "SKU1",
  fnsku: "FN1",
  asin: "A1",
  currency: "USD",
  country: "US",
  "qty-charged": "2",
  "amount-charged": "4.123456789",
  "per-unit-volume": "0.001234",
  "volume-unit": "cubic feet",
  "surcharge-age-tier": "181-210",
  "rate-surcharge": "0.5"
}
function report(defaults: Record<string, string>, rows: Record<string, string>[]) {
  const columns = Object.keys(defaults)
  return [
    columns.join("\t"),
    ...rows.map((row) => columns.map((key) => ({ ...defaults, ...row })[key] ?? "").join("\t"))
  ].join("\n")
}
export function monthlyStorageReport(rows: Record<string, string>[] = []) {
  return report(monthly, rows)
}
export function agedStorageReport(rows: Record<string, string>[] = []) {
  return report(aged, rows)
}
