import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createRegistry, isQuery, restockOperations } from "../src/index.ts"

describe("restock operation schemas", () => {
  const operations = restockOperations(z.strictObject({ units: z.number().int().positive() }))
  it("publishes channel discovery and retained report creation and a declared CSV projection without promising exports or PO creation", () => {
    const report = operations["report.restock"]
    expect(isQuery(report.descriptor, {})).toBe(false)
    expect(isQuery(operations["restock.channel.list"].descriptor, {})).toBe(true)
    expect(report.descriptor.effects[0]?.kind).toBe("local_write")
    expect(report.descriptor.execution.csvColumns).toContain("purchaseUnits")
    expect(report.input.parse({})).toEqual({})
    expect(report.input.safeParse({ action: "generate", selection: {}, fileFormat: "csv" }).success).toBe(false)
    expect(Object.keys(createRegistry(Object.values(operations)).openapi().paths)).toHaveLength(2)
  })
  it("rejects ambiguous selections and invalid periods at the server boundary", () => {
    const input = operations["report.restock"].input
    for (const invalid of [
      { channelIds: [] },
      { channelIds: ["amazon", "amazon"] },
      { days: 0 },
      { leadTimeDays: 731 },
      { supplierId: "name" },
      { state: "stocked" }
    ]) {
      expect(input.safeParse(invalid).success).toBe(false)
    }
    expect(
      input.parse({ channelIds: ["amazon"], days: 730, leadTimeDays: 1, status: "blocked", sku: "SKU" }).days
    ).toBe(730)
  })
})
