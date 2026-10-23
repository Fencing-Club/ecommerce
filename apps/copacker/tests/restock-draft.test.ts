import { randomUUID } from "node:crypto"
import { orderInputSchema } from "@repo/copacker-orders"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { orderLineCatalog } from "../src/server/order-line-catalog"
import { prepareOrder } from "../src/server/orders"
import { prepareRestockDraft } from "../src/server/restock-draft"
import { restockLines } from "../src/stories/fixtures/catalog"
import { testSession } from "./test-session"

vi.mock("../src/server/order-line-catalog", () => ({ orderLineCatalog: vi.fn<typeof orderLineCatalog>() }))
vi.mock("../src/server/orders", () => ({ prepareOrder: vi.fn<typeof prepareOrder>() }))

const session = testSession({ orgId: randomUUID(), kind: "buyer" })
const supplierId = randomUUID()
const rowId = randomUUID()
const variantId = "gid://shopify/ProductVariant/1"
const input = {
  reference: "RESTOCK-1",
  supplierId,
  currency: "USD",
  lines: [{ rowId, purchaseUnits: 24, receiver: "awd_us" }]
}
function report(): Parameters<typeof prepareRestockDraft>[1] {
  return {
    reportId: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    settings: { days: 60, leadTimeDays: 45 },
    identityBasis: "provider",
    targetBasis: "pooled",
    channels: [
      {
        id: "amazon",
        name: "Amazon",
        kind: "amazon",
        connectionId: randomUUID(),
        locationId: null,
        eligible: true,
        issues: []
      }
    ],
    rows: [
      {
        ...restockLines[0]!,
        variantId,
        rowId,
        channelId: "amazon",
        sku: "SKU",
        packOf: 2,
        supplier: { id: supplierId, name: "Supplier" },
        unitCostMinor: 500,
        costCurrency: "USD",
        minimumOrder: 12,
        caseQuantity: 12,
        blocked: [],
        purchaseUnits: 24,
        source: {
          provider: "shopify",
          connectionId: randomUUID(),
          accountId: "shop.myshopify.com",
          variantId,
          productId: null
        },
        explanation: { rawNeed: 24, leadTimeOrigin: "workspace", inventorySnapshotIds: [], openPoIds: [], issues: [] }
      }
    ],
    dependencies: [],
    coverage: []
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(orderLineCatalog).mockResolvedValue(
    new Map([
      [
        variantId,
        {
          id: randomUUID(),
          variantId,
          inventoryItemId: "gid://shopify/InventoryItem/1",
          name: "Product",
          variant: "Pack",
          buyerSku: "SKU",
          supplierSku: "SUPPLIER",
          asin: "",
          fnsku: "",
          pieces: 2,
          piecesPerSet: 2,
          unitPrice: 250,
          instructions: "Keep dry",
          prepCategory: "POLYBAGGING",
          suffocationWarning: true,
          receiver: "fba"
        }
      ]
    ])
  )
  vi.mocked(prepareOrder).mockImplementation(async (_, raw) => ({
    input: orderInputSchema.parse(raw),
    shopifyDomain: "shop.myshopify.com",
    amazonSellerId: null
  }))
})
describe("restock draft preparation", () => {
  it("reuses catalog preparation, converts units to pieces and preserves the explicitly selected receiver", async () => {
    const prepared = await prepareRestockDraft(session, report(), input)
    expect(prepared.input.items[0]).toMatchObject({
      pieces: 48,
      unitPrice: 250,
      receiver: "awd_us",
      instructions: "Keep dry",
      suffocationWarning: true
    })
    expect(orderLineCatalog).toHaveBeenCalledWith(session.org.id, "shop.myshopify.com", [variantId], "USD", "amazon")
    expect(prepareOrder).toHaveBeenCalledOnce()
  })
  it.each(["expired", "blocked", "supplier", "price", "pack", "ineligible"])(
    "rejects %s report data before provider reads",
    async (reason) => {
      const current = report()
      const row = current.rows[0]!
      if (reason === "expired") {
        current.expiresAt = new Date(0).toISOString()
      }
      if (reason === "blocked") {
        row.blocked = ["stock_unknown"]
      }
      if (reason === "supplier") {
        row.supplier = null
      }
      if (reason === "price") {
        row.unitCostMinor = null
      }
      if (reason === "pack") {
        row.packOf = 0
      }
      if (reason === "ineligible") {
        current.channels[0]!.eligible = false
      }
      let code = "validation_failed"
      if (reason === "expired") {
        code = "stale_plan"
      }
      if (reason === "ineligible") {
        code = "invalid_input"
      }
      await expect(prepareRestockDraft(session, current, input)).rejects.toMatchObject({ code })
      expect(orderLineCatalog).not.toHaveBeenCalled()
    }
  )
  it.each([0, 1, 13, 1.5, 1000001])("rejects invalid quantities or case multiples (%s)", async (purchaseUnits) => {
    await expect(
      prepareRestockDraft(session, report(), { ...input, lines: [{ ...input.lines[0], purchaseUnits }] })
    ).rejects.toThrow(/purchaseUnits|minimum and case quantity/)
    expect(orderLineCatalog).not.toHaveBeenCalled()
  })
  it("rejects a duplicate variant instead of dropping or merging selected allocations", async () => {
    await expect(
      prepareRestockDraft(session, report(), {
        ...input,
        lines: [...input.lines, { ...input.lines[0], receiver: "fba" }]
      })
    ).rejects.toThrow("appearing once")
  })
  it("requires an explicit compatible receiver", async () => {
    for (const receiver of [undefined, "warehouse"]) {
      await expect(
        prepareRestockDraft(session, report(), { ...input, lines: [{ rowId, purchaseUnits: 24, receiver }] })
      ).rejects.toThrow(/receiver/)
    }
  })
  it("rejects changed packs, SKU identity, store and fractional piece prices", async () => {
    for (const change of ["pack", "sku", "price", "store"]) {
      const current = report()
      if (change === "pack") {
        current.rows[0]!.packOf = 3
      }
      if (change === "sku") {
        current.rows[0]!.sku = "OLD"
      }
      if (change === "price") {
        current.rows[0]!.unitCostMinor = 501
      }
      if (change === "store") {
        vi.mocked(prepareOrder).mockImplementationOnce(async (_, raw) => ({
          input: orderInputSchema.parse(raw),
          shopifyDomain: "other.myshopify.com",
          amazonSellerId: null
        }))
      }
      await expect(prepareRestockDraft(session, current, input)).rejects.toMatchObject({
        code: change === "price" ? "validation_failed" : "stale_plan"
      })
    }
  })
  it("requires purchasing and price access before reading catalog data", async () => {
    const restricted = testSession({
      orgId: session.org.id,
      kind: "buyer",
      role: "member",
      access: { restock: "view" }
    })
    await expect(prepareRestockDraft(restricted, report(), input)).rejects.toMatchObject({ code: "forbidden" })
    expect(orderLineCatalog).not.toHaveBeenCalled()
  })
  it("rejects identity changes between catalog loading and authoritative preparation", async () => {
    vi.mocked(prepareOrder).mockImplementationOnce(async (_, raw) => {
      const prepared = orderInputSchema.parse(raw)
      prepared.items[0]!.buyerSku = "CHANGED"
      return { input: prepared, shopifyDomain: "shop.myshopify.com", amazonSellerId: null }
    })
    await expect(prepareRestockDraft(session, report(), input)).rejects.toMatchObject({ code: "stale_plan" })
  })
  it("accepts an ordinary single-piece row whose report pack is null, but rejects a catalog pack mismatch", async () => {
    const current = report()
    current.rows[0]!.packOf = null
    const catalog = await orderLineCatalog(session.org.id, "shop.myshopify.com", [variantId], "USD", "amazon")
    const line = catalog.get(variantId)!
    vi.mocked(orderLineCatalog).mockResolvedValue(new Map([[variantId, { ...line, pieces: 1, piecesPerSet: 1 }]]))
    const prepared = await prepareRestockDraft(session, current, input)
    expect(prepared.input.items[0]).toMatchObject({ pieces: 24, piecesPerSet: 1, unitPrice: 500 })
    vi.mocked(orderLineCatalog).mockResolvedValue(catalog)
    await expect(prepareRestockDraft(session, current, input)).rejects.toMatchObject({ code: "stale_plan" })
  })
})
