import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { resolveRestockSupplier } from "../src/server/restock-supplier"

const orgA = randomUUID(),
  orgB = randomUUID(),
  linkA = randomUUID(),
  linkB = randomUUID()
const links = [
  { id: linkA, supplierOrgId: orgA, removedAt: null },
  { id: linkB, supplierOrgId: orgB, removedAt: null }
]
const product = {
  id: randomUUID(),
  supplierOrgId: orgA,
  supplierSku: "SAME",
  title: "Foil cord",
  revision: 1,
  active: true,
  currency: "USD",
  priceMinor: 190,
  priceBasis: "piece",
  piecesPerSellablePack: 1,
  sellablePacksPerCase: 160
}
const lookup = { supplierSku: "SAME", currency: "USD" }

describe("restock supplier identity", () => {
  it("suggests the sole active linked supplier without treating the SKU as a supplier ID", () => {
    expect(resolveRestockSupplier(lookup, links, [product])).toMatchObject({
      status: "supplier_resolved",
      supplierId: linkA,
      match: { status: "matched", unitPriceMinor: 190 }
    })
  })
  it("requires buyer selection when two linked suppliers use the same SKU", () => {
    expect(
      resolveRestockSupplier(lookup, links, [product, { ...product, id: randomUUID(), supplierOrgId: orgB }])
    ).toMatchObject({ status: "supplier_ambiguous", supplierId: null })
  })
  it("does not suggest unlinked, archived or removed suppliers", () => {
    expect(resolveRestockSupplier(lookup, links.slice(1), [product]).status).toBe("supplier_not_resolved")
    expect(resolveRestockSupplier(lookup, links, [{ ...product, active: false }]).status).toBe("supplier_not_resolved")
    expect(resolveRestockSupplier(lookup, [{ ...links[0], removedAt: new Date() }], [product]).status).toBe(
      "supplier_not_resolved"
    )
  })
  it("preserves a unique supplier when price needs review", () => {
    expect(resolveRestockSupplier(lookup, links, [{ ...product, priceMinor: null }])).toMatchObject({
      status: "supplier_resolved",
      supplierId: linkA,
      match: { status: "price_missing", unitPriceMinor: null }
    })
    expect(resolveRestockSupplier({ ...lookup, currency: "CNY" }, links, [product])).toMatchObject({
      status: "supplier_resolved",
      supplierId: linkA,
      match: { status: "currency_review", unitPriceMinor: null }
    })
  })
  it("does not guess when the supplier SKU is missing or differs by case", () => {
    expect(resolveRestockSupplier({ ...lookup, supplierSku: null }, links, [product]).status).toBe(
      "supplier_sku_missing"
    )
    expect(resolveRestockSupplier({ ...lookup, supplierSku: "same" }, links, [product]).status).toBe(
      "supplier_not_resolved"
    )
  })
})
