const columns = [
  "approval-date",
  "reimbursement-id",
  "case-id",
  "amazon-order-id",
  "reason",
  "sku",
  "fnsku",
  "asin",
  "condition",
  "currency-unit",
  "amount-per-unit",
  "amount-total",
  "quantity-reimbursed-cash",
  "quantity-reimbursed-inventory",
  "quantity-reimbursed-total",
  "original-reimbursement-id",
  "original-reimbursement-type"
]

export function reimbursementReport(rows: Record<string, string>[] = []) {
  return [
    columns.join("\t"),
    ...rows.map((overrides) => {
      const row: Record<string, string> = {
        "approval-date": "2026-10-02T00:00:00Z",
        "reimbursement-id": "R1",
        "case-id": "C1",
        "amazon-order-id": "ORDER1",
        reason: "Lost_Warehouse",
        sku: "SKU1",
        fnsku: "F1",
        asin: "A1",
        condition: "New",
        "currency-unit": "USD",
        "amount-per-unit": "3.123456",
        "amount-total": "6.246912",
        "quantity-reimbursed-cash": "2",
        "quantity-reimbursed-inventory": "0",
        "quantity-reimbursed-total": "2",
        ...overrides
      }
      return columns.map((column) => row[column] ?? "").join("\t")
    })
  ].join("\n")
}
