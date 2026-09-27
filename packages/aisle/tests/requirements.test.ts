import { describe, expect, it } from "vitest"
import { orderInputSchema } from "../src/index"
import { destinationRequirements, itemRequirements, sharedPrep } from "../src/requirements"

const line = (overrides: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  variantId: "gid://shopify/ProductVariant/1",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  name: "Glove",
  variant: "Right",
  buyerSku: "glove-r",
  supplierSku: "",
  asin: "",
  fnsku: "X004ABC123",
  pieces: 4,
  piecesPerSet: 1,
  unitPrice: 100,
  ...overrides
})
const order = (items: ReturnType<typeof line>[]) =>
  orderInputSchema.parse({
    supplierId: "00000000-0000-4000-8000-000000000002",
    reference: "PO-1",
    destination: "awd_us",
    currency: "USD",
    dueDate: "2026-12-01",
    items
  })

describe("PO instructions", () => {
  it("adds Amazon's carton and label rules for Amazon, and none for other destinations", () => {
    expect(destinationRequirements("awd_us").join(" ")).toContain("One SKU per carton")
    expect(destinationRequirements("fba").join(" ")).toContain("Mixed-SKU cartons are allowed")
    expect(destinationRequirements("warehouse")).toEqual([])
    expect(destinationRequirements("forwarder")).toEqual([])
  })

  it("states shared preparation once, and each line's own steps on the line", () => {
    const po = order([
      line(),
      line({
        id: "00000000-0000-4000-8000-000000000003",
        variantId: "gid://shopify/ProductVariant/2",
        buyerSku: "glove-l",
        pieces: 4,
        piecesPerSet: 2,
        instructions: "Fold the cuff.\nNo tissue paper."
      })
    ])
    const shared = sharedPrep(po)
    expect(shared).toBe("POLYBAGGING")
    expect(itemRequirements(po.items[1]!, po.destination, shared)).toEqual([
      "Pack 2 pieces together as one unit",
      "Label with FNSKU X004ABC123",
      "Fold the cuff.",
      "No tissue paper."
    ])
    expect(itemRequirements(po.items[0]!, "warehouse")).toEqual(["Seal each unit in a clear polybag"])
  })

  it("asks for a suffocation warning label on the lines that need one, to any destination", () => {
    const po = order([line({ suffocationWarning: true })])
    expect(itemRequirements(po.items[0]!, "warehouse", "POLYBAGGING")).toEqual([
      "Put a suffocation warning label on each polybag"
    ])
    expect(order([line()]).items[0]!.suffocationWarning).toBe(false)
  })

  it("keeps preparation on each line when lines differ", () => {
    const po = order([
      line(),
      line({
        id: "00000000-0000-4000-8000-000000000003",
        variantId: "gid://shopify/ProductVariant/2",
        buyerSku: "glove-l",
        prepCategory: "NO_PREP"
      })
    ])
    expect(sharedPrep(po)).toBeNull()
  })
})
