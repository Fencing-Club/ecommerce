import { describe, expect, it, vi } from "vitest"
import type { Amazon } from "../src/amazon"
import {
  amazonListing,
  amazonListingValues,
  readAmazonListing,
  writeAmazonListing,
  writeShopifyField
} from "../src/listing-writes"
import type { Shopify } from "../src/shopify"

describe("controlled listing adapters", () => {
  it("rejects invalid numbers before making a provider request", async () => {
    const request = vi.fn<Amazon["request"]>()
    const graphql = vi.fn<Shopify["graphql"]>()
    for (const value of [NaN, Infinity, -1, 1.5, 2147483648]) {
      await expect(
        writeAmazonListing(
          { request },
          { sellerId: "seller", sku: "sku", productType: "PRODUCT", field: "inventory", quantity: value }
        )
      ).rejects.toThrow(/Invalid|Too/)
      await expect(
        writeShopifyField(
          { graphql },
          { field: "price", productId: "product", variantId: "variant", amountMinor: value }
        )
      ).rejects.toThrow(/Invalid|Too/)
    }
    expect(request).not.toHaveBeenCalled()
    expect(graphql).not.toHaveBeenCalled()
  })
  it("parses Amazon's decimal-string money without rounding away precision", () => {
    const listing = amazonListing.parse({
      sku: "SKU",
      summaries: [{ marketplaceId: "ATVPDKIKX0DER", productType: "PRODUCT" }],
      offers: [{ marketplaceId: "ATVPDKIKX0DER", offerType: "B2C", price: { currencyCode: "USD", amount: "30.0" } }]
    })
    expect(amazonListingValues(listing)).toMatchObject({ amountMinor: 3000, currency: "USD" })
    expect(() =>
      amazonListing.parse({
        ...listing,
        offers: [{ ...listing.offers[0], price: { currencyCode: "USD", amount: "30.001" } }]
      })
    ).toThrow(/amount/)
  })
  it("preserves offer selectors and patches only the requested price", async () => {
    const request = vi
      .fn<Amazon["request"]>()
      .mockResolvedValue({ sku: "A/B", status: "ACCEPTED", submissionId: "accepted" })
    const result = await writeAmazonListing(
      { request },
      { sellerId: "SELLER", sku: "A/B", productType: "PRODUCT", field: "price", amountMinor: 1299, currency: "USD" }
    )
    expect(result.status).toBe("ACCEPTED")
    expect(request.mock.calls[0]![1]).toContain("A%2FB")
    expect(request.mock.calls[0]![2]).toEqual({
      productType: "PRODUCT",
      patches: [
        {
          op: "merge",
          path: "/attributes/purchasable_offer",
          value: [
            {
              marketplace_id: "ATVPDKIKX0DER",
              currency: "USD",
              audience: "ALL",
              our_price: [{ schedule: [{ value_with_tax: 12.99 }] }]
            }
          ]
        }
      ]
    })
  })
  it("rejects changed/ambiguous identity and distinguishes FBA from mixed fulfillment", async () => {
    await expect(
      readAmazonListing(
        { request: vi.fn<() => Promise<unknown>>().mockResolvedValue({ sku: "OTHER" }) },
        "SELLER",
        "SKU"
      )
    ).rejects.toThrow("identity mismatch")
    const value = amazonListing.parse({
      sku: "SKU",
      summaries: [{ marketplaceId: "ATVPDKIKX0DER", productType: "PRODUCT" }],
      fulfillmentAvailability: [{ fulfillmentChannelCode: "AMAZON_NA" }]
    })
    expect(amazonListingValues(value).fulfillmentMode).toBe("fba")
    expect(
      amazonListingValues({
        ...value,
        fulfillmentAvailability: [...value.fulfillmentAvailability, { fulfillmentChannelCode: "DEFAULT", quantity: 1 }]
      }).fulfillmentMode
    ).toBe("other")
    expect(() => amazonListingValues({ ...value, summaries: [...value.summaries, ...value.summaries] })).toThrow(
      "ambiguous"
    )
  })
  it("uses Shopify compare-and-swap and idempotency for absolute counts", async () => {
    const graphql = vi.fn<Shopify["graphql"]>().mockResolvedValue({ inventorySetQuantities: { userErrors: [] } })
    await writeShopifyField(
      { graphql },
      {
        field: "inventory",
        inventoryItemId: "item",
        locationId: "location",
        quantity: 10,
        expectedQuantity: 9,
        quantityState: "on_hand",
        key: "execution"
      }
    )
    expect(graphql.mock.calls[0]![0]).toContain("@idempotent")
    expect(graphql.mock.calls[0]![1]).toMatchObject({
      input: { quantities: [{ quantity: 10, changeFromQuantity: 9 }] }
    })
    graphql.mockResolvedValue({ inventoryItemUpdate: { userErrors: [{ field: ["sku"], message: "rejected" }] } })
    await expect(writeShopifyField({ graphql }, { field: "sku", inventoryItemId: "item", sku: "NEW" })).rejects.toThrow(
      "rejected"
    )
  })
})
