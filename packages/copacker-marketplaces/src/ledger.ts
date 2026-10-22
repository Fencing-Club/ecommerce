import { reportDay } from "./report-tsv"

// Amazon's FBA inventory ledger summary (GET_LEDGER_SUMMARY_VIEW_DATA), aggregated daily for the country. Each row is
// one day, one FNSKU and one disposition; only sellable units count as stock a customer can buy.
export const ledgerReportType = "GET_LEDGER_SUMMARY_VIEW_DATA"
export const ledgerReportOptions = { aggregateByLocation: "COUNTRY", aggregatedByTimePeriod: "DAILY" }

export type LedgerDay = { sku: string; day: string; endingUnits: number }

function normalize(header: string) {
  return header.trim().replace(/^"|"$/g, "").toLocaleLowerCase()
}

// Dates arrive as MM/DD/YYYY or YYYY-MM-DD; both become YYYY-MM-DD.
function isoDay(value: string) {
  const day = reportDay(value.trim().replace(/^"|"$/g, ""))
  if (/^\d{4}-\d{2}-\d{2}/.test(day)) {
    return day.slice(0, 10)
  }
  throw new Error("Amazon's inventory ledger has a date Copacker can't read")
}

// Sellable units at the end of each day per seller SKU, adding up FNSKUs that share a SKU.
export function parseLedgerSummary(text: string): LedgerDay[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) {
    return []
  }
  const headers = lines[0]!.split("\t").map(normalize)
  const column = (name: string) => {
    const index = headers.indexOf(name)
    if (index < 0) {
      throw new Error(`Amazon's inventory ledger is missing the ${name} column`)
    }
    return index
  }
  const date = column("date"),
    sku = column("msku"),
    disposition = column("disposition"),
    ending = column("ending warehouse balance")
  const days = new Map<string, LedgerDay>()
  for (const line of lines.slice(1)) {
    const cells = line.split("\t").map((cell) => cell.trim().replace(/^"|"$/g, ""))
    if (normalize(cells[disposition] ?? "") !== "sellable" || !cells[sku]) {
      continue
    }
    const units = Number(cells[ending])
    if (!Number.isSafeInteger(units)) {
      throw new Error("Amazon's inventory ledger has a balance Copacker can't read")
    }
    const day = isoDay(cells[date] ?? "")
    const key = `${cells[sku]}\t${day}`
    const current = days.get(key)
    days.set(key, { sku: cells[sku], day, endingUnits: (current?.endingUnits ?? 0) + units })
  }
  return [...days.values()]
}
