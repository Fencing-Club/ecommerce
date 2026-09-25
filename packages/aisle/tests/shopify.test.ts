import { describe, expect, it } from "vitest"
import { normalizeShopDomain, shopDomainSchema } from "../src/shopify"

describe("normalizeShopDomain", () => {
  it.each([
    ["8f3f5f-3.myshopify.com", "8f3f5f-3.myshopify.com"],
    ["8f3f5f-3", "8f3f5f-3.myshopify.com"],
    ["https://admin.shopify.com/store/8f3f5f-3/products?x=1", "8f3f5f-3.myshopify.com"],
    ["admin.shopify.com/store/8f3f5f-3", "8f3f5f-3.myshopify.com"],
    [" HTTPS://8F3F5F-3.myshopify.com/admin ", "8f3f5f-3.myshopify.com"]
  ])("normalizes %s", (input, expected) => {
    expect(shopDomainSchema.parse(normalizeShopDomain(input))).toBe(expected)
  })

  it("leaves custom domains for validation to reject", () => {
    expect(shopDomainSchema.safeParse(normalizeShopDomain("fencing.club")).success).toBe(false)
  })
})
