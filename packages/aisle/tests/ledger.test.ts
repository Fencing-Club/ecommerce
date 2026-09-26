import { gzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"
import { Amazon } from "../src/amazon"
import { ledgerReportOptions, ledgerReportType, parseLedgerSummary } from "../src/ledger"

const header = [
  "Date",
  "FNSKU",
  "ASIN",
  "MSKU",
  "Title",
  "Disposition",
  "Starting Warehouse Balance",
  "Ending Warehouse Balance",
  "Location"
].join("\t")
const row = (date: string, fnsku: string, sku: string, disposition: string, ending: number) =>
  [date, fnsku, "B000000001", sku, "Socks", disposition, "0", String(ending), "US"].join("\t")

describe("FBA inventory ledger", () => {
  it("adds up sellable units per SKU and day, ignoring other dispositions", () => {
    const text = [
      header,
      row("09/01/2026", "X1", "socks-l", "SELLABLE", 5),
      row("09/01/2026", "X2", "socks-l", "SELLABLE", 3),
      row("09/01/2026", "X1", "socks-l", "CUSTOMER_DAMAGED", 9),
      row("09/02/2026", "X1", "socks-l", "SELLABLE", 0)
    ].join("\r\n")
    expect(parseLedgerSummary(text)).toEqual([
      { sku: "socks-l", day: "2026-09-01", endingUnits: 8 },
      { sku: "socks-l", day: "2026-09-02", endingUnits: 0 }
    ])
    expect(parseLedgerSummary("")).toEqual([])
    expect(() => parseLedgerSummary("Date\tMSKU\n")).toThrow("disposition column")
    expect(() => parseLedgerSummary(`${header}\n${row("Sept 1", "X1", "a", "SELLABLE", 1)}`)).toThrow("date")
  })
  it("requests the report, waits for Amazon to build it and downloads the compressed document", async () => {
    const tsv = [header, row("2026-09-01", "X1", "socks-l", "SELLABLE", 4)].join("\n")
    const responses: Response[] = [
      Response.json({ reportId: "r1" }),
      Response.json({ processingStatus: "IN_PROGRESS" }),
      Response.json({ processingStatus: "DONE", reportDocumentId: "d1" }),
      Response.json({ url: "https://files.example.com/d1", compressionAlgorithm: "GZIP" }),
      new Response(gzipSync(tsv))
    ]
    const requests: { url: string; body?: unknown }[] = []
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.startsWith("https://api.amazon.com")) {
        return Response.json({ access_token: "test", expires_in: 3600 })
      }
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return responses.shift()!
    })
    const api = new Amazon({ clientId: "a", clientSecret: "b", refreshToken: "c" }, transport)
    const input = {
      reportType: ledgerReportType,
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2026-09-01T00:00:00Z",
      dataEndTime: "2026-09-02T00:00:00Z",
      reportOptions: ledgerReportOptions
    }
    const text = await api.report(input, { deadline: Date.now() + 60000, pollMs: 1 })
    expect(parseLedgerSummary(text!)).toEqual([{ sku: "socks-l", day: "2026-09-01", endingUnits: 4 }])
    expect(requests[0]).toEqual({
      url: "https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports",
      body: input
    })
    expect(requests.at(-1)?.url).toBe("https://files.example.com/d1")
  })
  it("returns nothing when Amazon cancels a report for lack of data, and fails on a fatal report", async () => {
    const make = (status: string) => {
      const responses = [Response.json({ reportId: "r1" }), Response.json({ processingStatus: status })]
      return new Amazon(
        { clientId: "a", clientSecret: "b", refreshToken: "c" },
        vi.fn<typeof fetch>(async (input) =>
          String(input).startsWith("https://api.amazon.com")
            ? Response.json({ access_token: "test", expires_in: 3600 })
            : responses.shift()!
        )
      )
    }
    const input = {
      reportType: ledgerReportType,
      marketplaceIds: ["ATVPDKIKX0DER"],
      dataStartTime: "2026-09-01T00:00:00Z",
      dataEndTime: "2026-09-02T00:00:00Z"
    }
    expect(await make("CANCELLED").report(input, { deadline: Date.now() + 60000 })).toBeNull()
    await expect(make("FATAL").report(input, { deadline: Date.now() + 60000 })).rejects.toThrow("couldn't build")
  })
})
