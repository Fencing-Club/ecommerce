import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  catalogReadOperations,
  createRegistry,
  inventoryReadOperations,
  orderReadOperations,
  partnerReadOperations,
  poReadOperations,
  productReadOperations,
  shipmentReadOperations
} from "../src/index.ts"

describe("resource read contracts", () => {
  it("publishes strict read-only operations and injected domain schemas", () => {
    const catalogs = catalogReadOperations(
      z.strictObject({ minimum: z.number(), priceMinor: z.number() }),
      z.strictObject({ increment: z.number() })
    )
    const pos = poReadOperations(z.strictObject({ id: z.uuid(), unitPriceMinor: z.number().nullable() }))
    const definitions = [
      ...Object.values(catalogs),
      ...Object.values(pos),
      ...Object.values(inventoryReadOperations),
      ...Object.values(orderReadOperations),
      ...Object.values(partnerReadOperations),
      ...Object.values(productReadOperations),
      ...Object.values(shipmentReadOperations)
    ]
    const registry = createRegistry(definitions)
    expect(registry.list()).toHaveLength(16)
    for (const definition of definitions) {
      expect(definition.descriptor.execution.kind).toBe("query")
      expect(definition.descriptor.effects).toEqual([])
      expect(definition.input.safeParse({ unknown: "value" }).success).toBe(false)
    }
    expect(Object.keys(registry.openapi().paths)).toHaveLength(16)
    expect(catalogs["catalog.show"].output.safeParse({ id: "bad", secret: "not allowed" }).success).toBe(false)
  })
  it("requires complete ordered date windows and rejects unsupported sorts and filters", () => {
    expect(orderReadOperations["order.list"].input.safeParse({ from: "2026-10-01" }).success).toBe(false)
    expect(orderReadOperations["order.list"].input.safeParse({ from: "2026-10-03", to: "2026-10-01" }).success).toBe(
      false
    )
    expect(orderReadOperations["order.list"].input.parse({ from: "2026-10-01", to: "2026-10-02" }).timeZone).toBe("UTC")
    expect(orderReadOperations["order.list"].input.parse({}).direction).toBe("desc")
    expect(productReadOperations["product.list"].input.safeParse({ sort: "price" }).success).toBe(false)
    expect(
      orderReadOperations["order.show"].input.safeParse({
        id: "00000000-0000-4000-8000-000000000001",
        reference: "#1043"
      }).success
    ).toBe(false)
  })
})
