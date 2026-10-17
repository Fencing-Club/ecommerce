const columns = [
  "Date",
  "FNSKU",
  "ASIN",
  "MSKU",
  "Event Type",
  "Reference ID",
  "Quantity",
  "Fulfillment Center",
  "Disposition",
  "Reason",
  "Country",
  "Reconciled Quantity",
  "Unreconciled Quantity",
  "Date and Time",
  "Store"
]

export function inventoryMovementReport(rows: Record<string, string>[] = []) {
  return [
    columns.join("\t"),
    ...rows.map((overrides) => {
      const row: Record<string, string> = {
        Date: "2026-10-02",
        FNSKU: "FN1",
        ASIN: "A1",
        MSKU: "SKU1",
        "Event Type": "Adjustments",
        "Reference ID": "REF1",
        Quantity: "-3",
        "Fulfillment Center": "FC1",
        Disposition: "SELLABLE",
        Reason: "M",
        Country: "US",
        "Reconciled Quantity": "1",
        "Unreconciled Quantity": "2",
        "Date and Time": "10/02/2026 12:30:00",
        Store: "US",
        ...overrides
      }
      return columns.map((column) => row[column] ?? "").join("\t")
    })
  ].join("\n")
}
