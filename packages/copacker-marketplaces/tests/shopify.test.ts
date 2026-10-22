import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  normalizeShopDomain,
  shopDomainSchema,
  Shopify,
  ShopifyPermissionError,
  ShopifyRequestError,
  piecesPerUnit,
  bundleSupplierComponents,
  shopifyLocationKind,
  variantName
} from "../src/shopify"
import { exchangeShopifyCode, refreshShopifyToken, revokeShopifyToken, verifyShopifyHmac } from "../src/shopify-auth"

const domain = "example.myshopify.com"
const itemId = "gid://shopify/InventoryItem/1"
const level = {
  id: "level1",
  location: {
    id: "gid://shopify/Location/1",
    name: "Warehouse",
    isFulfillmentService: false,
    fulfillmentService: null
  },
  quantities: [
    { name: "available", quantity: -2 },
    { name: "incoming", quantity: 0 }
  ]
}
const levels = { nodes: [level], pageInfo: { hasNextPage: true, endCursor: "levels-next" } }
const productDetails = {
  title: "Default Title",
  product: { id: "gid://shopify/Product/1", title: "Foil body cord", featuredMedia: null },
  media: { nodes: [] },
  requiresComponents: false,
  inventoryQuantity: -2,
  productVariantComponents: { nodes: [], pageInfo: { hasNextPage: false } }
}
function stockClient(data: unknown) {
  const transport = vi.fn<typeof fetch>(async () => Response.json({ data }))
  return { api: new Shopify(domain, "test", transport), transport }
}

describe("Shopify throttling", () => {
  it("retries throttled GraphQL responses and HTTP 429 with bounded backoff", async () => {
    const responses = [
      Response.json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] }),
      new Response(null, { status: 429 }),
      Response.json({ data: { shop: { myshopifyDomain: domain } } })
    ]
    const transport = vi.fn<typeof fetch>(async () => responses.shift() ?? Response.json({ data: {} }))
    const waits: number[] = []
    const delay = vi.fn<(ms: number) => Promise<void>>(async (ms) => {
      waits.push(ms)
    })
    const api = new Shopify(domain, "test", transport, delay)
    await expect(api.graphql("query Shop { shop { myshopifyDomain } }")).resolves.toEqual({
      shop: { myshopifyDomain: domain }
    })
    expect(transport).toHaveBeenCalledTimes(3)
    expect(delay.mock.calls).toEqual([[1000], [2000]])
    expect(waits).toEqual([1000, 2000])
  })

  it("waits as long as Shopify says the query's points take to refill", async () => {
    const throttled = (available: number) =>
      Response.json({
        errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        extensions: {
          cost: { requestedQueryCost: 900, throttleStatus: { currentlyAvailable: available, restoreRate: 50 } }
        }
      })
    const responses = [throttled(100), throttled(0), Response.json({ data: { shop: { myshopifyDomain: domain } } })]
    const transport = vi.fn<typeof fetch>(async () => responses.shift() ?? Response.json({ data: {} }))
    const delay = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    const api = new Shopify(domain, "test", transport, delay)
    await api.graphql("query Shop { shop { myshopifyDomain } }")
    // 800 points short at 50 a second is 16 seconds, plus one; 900 short is 18, plus one.
    expect(delay.mock.calls).toEqual([[17000], [19000]])
  })

  it("reports a query still throttled after its retries as a rate limit", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] })
    )
    const api = new Shopify(
      domain,
      "test",
      transport,
      vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
    )
    const error = await api.graphql("query Shop { shop { myshopifyDomain } }").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ShopifyRequestError)
    expect(error).toMatchObject({ status: 429 })
    expect(transport).toHaveBeenCalledTimes(5)
  })

  it("does not retry permission or other GraphQL errors", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ errors: [{ message: "Invalid query", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }] })
    )
    const api = new Shopify(domain, "test", transport, async () => {
      throw new Error("Unexpected retry")
    })
    await expect(api.graphql("query Invalid { missing }")).rejects.toThrow("Invalid query")
    expect(transport).toHaveBeenCalledTimes(1)
  })
})

describe("Shopify complete stock collection", () => {
  afterEach(() => vi.restoreAllMocks())
  const pageInfo = { hasNextPage: false, endCursor: null }
  const node = (id: number, inventoryLevels = { nodes: [level], pageInfo }) => ({
    id: `gid://shopify/ProductVariant/${id}`,
    sku: "shared-sku",
    ...productDetails,
    inventoryItem: { id: `gid://shopify/InventoryItem/${id}`, tracked: false, inventoryLevels }
  })
  function sequence(pages: Record<string, unknown>[]) {
    const transport = vi.fn<typeof fetch>(async () => {
      const data = pages.shift()
      if (!data) {
        throw new Error("Connection failed")
      }
      return Response.json({ data: { shop: { myshopifyDomain: domain }, ...data } })
    })
    return { api: new Shopify(domain, "test", transport), transport }
  }

  it("records each variant's selling price in the store's currency", async () => {
    const { api, transport } = sequence([
      {
        shop: { myshopifyDomain: domain, currencyCode: "USD" },
        productVariants: {
          nodes: [
            { ...node(1), price: "24.5" },
            { ...node(2), price: "10.00" }
          ],
          pageInfo
        }
      }
    ])
    const rows = (await api.stock()).rows
    expect(rows.map((row) => [row.priceMinor, row.priceCurrency])).toEqual([
      [2450, "USD"],
      [1000, "USD"]
    ])
    const request = JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as { query: string }
    expect(request.query).toContain("shop{myshopifyDomain currencyCode}")
    expect(request.query).toContain("title price")
  })

  it("records cost and country, and leaves the details Copacker keeps to Copacker", async () => {
    const { api, transport } = sequence([
      {
        productVariants: {
          nodes: [
            {
              ...node(1),
              inventoryItem: {
                ...node(1).inventoryItem,
                unitCost: { amount: "21.43", currencyCode: "USD" },
                countryCodeOfOrigin: "CN"
              }
            }
          ],
          pageInfo
        }
      }
    ])
    const [row] = (await api.stock()).rows
    expect(row).toMatchObject({ unitCostMinor: 2143, costCurrency: "USD", countryOfOrigin: "CN" })
    expect(row).not.toHaveProperty("supplierSku")
    expect(row).not.toHaveProperty("amazonStockTarget")
    const request = JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as { query: string }
    expect(request.query).not.toContain("metafield")
  })

  it("reads the metafields Copacker copies once, treating unusable values as unset", async () => {
    const variant = (id: number, values: Record<string, string | null>) => {
      const metafield = (key: string) =>
        values[key] === null || values[key] === undefined ? null : { value: values[key] }
      return {
        id: `gid://shopify/ProductVariant/${id}`,
        supplierSku: metafield("supplierSku"),
        asin: metafield("asin"),
        amazonTarget: metafield("amazonTarget"),
        storeTarget: metafield("storeTarget"),
        product: {
          id: `gid://shopify/Product/${id}`,
          caseQuantity: metafield("caseQuantity"),
          supplier: metafield("supplier")
        }
      }
    }
    const { api, transport } = sequence([
      {
        productVariants: {
          nodes: [
            variant(1, {
              supplierSku: " UF-1504 ",
              asin: "B000000001",
              amazonTarget: "0",
              storeTarget: "12",
              caseQuantity: "160",
              supplier: " Wuxi Guanda Sport Goods Co. Ltd. "
            }),
            variant(2, { amazonTarget: "abc", caseQuantity: "0", supplier: "None" })
          ],
          pageInfo: { hasNextPage: true, endCursor: "next" }
        }
      },
      { productVariants: { nodes: [variant(3, {})], pageInfo } }
    ])
    expect(await api.metafieldValues()).toEqual([
      {
        variantId: "gid://shopify/ProductVariant/1",
        productId: "gid://shopify/Product/1",
        supplierSku: "UF-1504",
        asin: "B000000001",
        amazonStockTarget: 0,
        storeStockTarget: 12,
        caseQuantity: 160,
        supplierName: "Wuxi Guanda Sport Goods Co. Ltd."
      },
      {
        variantId: "gid://shopify/ProductVariant/2",
        productId: "gid://shopify/Product/2",
        supplierSku: null,
        asin: null,
        amazonStockTarget: null,
        storeStockTarget: null,
        caseQuantity: null,
        supplierName: null
      },
      {
        variantId: "gid://shopify/ProductVariant/3",
        productId: "gid://shopify/Product/3",
        supplierSku: null,
        asin: null,
        amazonStockTarget: null,
        storeStockTarget: null,
        caseQuantity: null,
        supplierName: null
      }
    ])
    const second = JSON.parse(String(transport.mock.calls[1]?.[1]?.body)) as { variables: { after: string } }
    expect(second.variables.after).toBe("next")
  })

  it("collects both connections and retains variants without inventory levels", async () => {
    const initial = node(2)
    const { api, transport } = sequence([
      {
        productVariants: {
          nodes: [{ ...initial, inventoryItem: { ...initial.inventoryItem, inventoryLevels: levels } }],
          pageInfo: { hasNextPage: true, endCursor: "next-variant" }
        }
      },
      {
        inventoryItem: {
          id: initial.inventoryItem.id,
          inventoryLevels: {
            nodes: [
              { ...level, id: "level2", location: { ...level.location, id: "gid://shopify/Location/2", name: "Other" } }
            ],
            pageInfo
          }
        }
      },
      { productVariants: { nodes: [node(1, { nodes: [], pageInfo })], pageInfo } }
    ])
    const result = await api.stock()
    expect(result).toMatchObject({ source: "shopify", shopifyDomain: domain, scopeKey: "store" })
    expect(result.rows.map((row) => row.variantId)).toEqual([
      "gid://shopify/ProductVariant/1",
      "gid://shopify/ProductVariant/2"
    ])
    expect(result.rows[0]).toMatchObject({ tracked: false, levels: [], unit: "shopify_inventory_unit" })
    expect(result.rows[1]?.levels).toHaveLength(2)
    expect(result.rows[1]?.levels[0]).toMatchObject({ available: -2, incoming: 0, onHand: null, committed: null })
    expect(transport).toHaveBeenCalledTimes(3)
  })

  it("rejects duplicated variant and inventory identities", async () => {
    for (const second of [node(1), { ...node(2), inventoryItem: node(1).inventoryItem }]) {
      const { api } = sequence([{ productVariants: { nodes: [node(1), second], pageInfo } }])
      await expect(api.stock()).rejects.toThrow("product identity")
    }
  })

  it("rejects repeated location identities across pages", async () => {
    const first = node(1)
    const { api } = sequence([
      {
        productVariants: {
          nodes: [{ ...first, inventoryItem: { ...first.inventoryItem, inventoryLevels: levels } }],
          pageInfo
        }
      },
      { inventoryItem: { id: itemId, inventoryLevels: { nodes: [level], pageInfo } } }
    ])
    await expect(api.stock()).rejects.toThrow("location identity")
  })

  it("rejects missing or repeated variant cursors and incomplete location cursors", async () => {
    await expect(
      sequence([{ productVariants: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } }]).api.stock()
    ).rejects.toThrow("variant pagination")
    await expect(
      sequence(
        Array.from({ length: 2 }, () => ({
          productVariants: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "loop" } }
        }))
      ).api.stock()
    ).rejects.toThrow("variant pagination")
    const first = node(1)
    await expect(
      sequence([
        {
          productVariants: {
            nodes: [
              {
                ...first,
                inventoryItem: {
                  ...first.inventoryItem,
                  inventoryLevels: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } }
                }
              }
            ],
            pageInfo
          }
        }
      ]).api.stock()
    ).rejects.toThrow("location pagination")
  })

  it("carries product details and prefers the variant's own photo", async () => {
    const photo = (url: string) => ({ preview: { image: { url } } })
    const productPhoto = "https://cdn.shopify.com/product.jpg"
    const variantPhoto = "https://cdn.shopify.com/variant.jpg"
    const { api } = sequence([
      {
        productVariants: {
          nodes: [
            {
              ...node(1),
              title: "Left / 6",
              product: { id: "gid://shopify/Product/9", title: "Pro-grip glove", featuredMedia: photo(productPhoto) },
              media: { nodes: [photo(variantPhoto)] }
            },
            {
              ...node(2),
              title: "Right / 6",
              product: { id: "gid://shopify/Product/9", title: "Pro-grip glove", featuredMedia: photo(productPhoto) }
            }
          ],
          pageInfo
        }
      }
    ])
    const { rows } = await api.stock()
    expect(
      rows.map(({ productId, productTitle, variantTitle, imageUrl }) => ({
        productId,
        productTitle,
        variantTitle,
        imageUrl
      }))
    ).toEqual([
      {
        productId: "gid://shopify/Product/9",
        productTitle: "Pro-grip glove",
        variantTitle: "Left / 6",
        imageUrl: variantPhoto
      },
      {
        productId: "gid://shopify/Product/9",
        productTitle: "Pro-grip glove",
        variantTitle: "Right / 6",
        imageUrl: productPhoto
      }
    ])
  })

  it("marks bundles with the quantity Shopify derives from their components", async () => {
    const { api } = sequence([
      {
        productVariants: {
          nodes: [
            {
              ...node(1),
              requiresComponents: true,
              inventoryQuantity: 9,
              productVariantComponents: {
                nodes: [{ quantity: 3, productVariant: { id: "gid://shopify/ProductVariant/7" } }],
                pageInfo: { hasNextPage: false }
              }
            },
            {
              ...node(2),
              requiresComponents: true,
              inventoryQuantity: null,
              productVariantComponents: { nodes: [], pageInfo: { hasNextPage: true } }
            },
            node(3)
          ],
          pageInfo
        }
      }
    ])
    const { rows } = await api.stock()
    expect(rows.map((row) => row.bundle)).toEqual([
      { available: 9, components: [{ variantId: "gid://shopify/ProductVariant/7", quantity: 3 }] },
      // More components than one page returned: the recipe is unknown rather than partial.
      { available: null, components: null },
      undefined
    ])
  })

  it("withholds partial results on transport failure or lost job ownership", async () => {
    const pages = [{ productVariants: { nodes: [node(1)], pageInfo: { hasNextPage: true, endCursor: "next" } } }]
    await expect(sequence([...pages]).api.stock()).rejects.toThrow("Connection failed")
    const { api, transport } = sequence([...pages])
    const owned = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("Lease lost"))
    await expect(api.stock(owned)).rejects.toThrow("Lease lost")
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("enforces page and payload bounds", async () => {
    const pages = Array.from({ length: 200 }, (_, i) => ({
      productVariants: { nodes: [], pageInfo: { hasNextPage: true, endCursor: String(i) } }
    }))
    const bounded = sequence(pages)
    await expect(bounded.api.stock()).rejects.toThrow("variant page limit")
    expect(bounded.transport).toHaveBeenCalledTimes(200)
    const first = node(1)
    const huge = { ...level, location: { ...level.location, name: "x".repeat(8 * 1024 * 1024) } }
    await expect(
      sequence([
        {
          productVariants: {
            nodes: [
              { ...first, inventoryItem: { ...first.inventoryItem, inventoryLevels: { nodes: [huge], pageInfo } } }
            ],
            pageInfo
          }
        }
      ]).api.stock()
    ).rejects.toThrow("supported size")
  })
})

describe("Shopify stock pages", () => {
  it("preserves signed quantities, missing states and both pagination connections", async () => {
    const page = {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1",
          sku: null,
          ...productDetails,
          inventoryItem: { id: itemId, tracked: false, inventoryLevels: levels }
        }
      ],
      pageInfo: { hasNextPage: true, endCursor: "variants-next" }
    }
    const { api, transport } = stockClient({ shop: { myshopifyDomain: domain }, productVariants: page })
    expect(await api.stockPage("prior")).toEqual({ ...page, currency: null })
    const call = transport.mock.calls[0]
    expect(String(call?.[0])).toBe(`https://${domain}/admin/api/2026-07/graphql.json`)
    expect(JSON.parse(String(call?.[1]?.body)).variables).toEqual({ after: "prior" })
    expect(page.nodes[0]?.inventoryItem.inventoryLevels.nodes[0]?.quantities).toHaveLength(2)
  })

  it("fetches the next inventory-level page for the exact item", async () => {
    const { api, transport } = stockClient({
      shop: { myshopifyDomain: domain },
      inventoryItem: { id: itemId, inventoryLevels: levels }
    })
    expect(await api.stockLevelsPage(itemId, "prior-level")).toEqual(levels)
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body)).variables).toEqual({
      id: itemId,
      after: "prior-level"
    })
  })

  it("rejects a different shop or item instead of accepting its quantities", async () => {
    const foreign = stockClient({
      shop: { myshopifyDomain: "other.myshopify.com" },
      productVariants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })
    await expect(foreign.api.stockPage()).rejects.toThrow("store identity")
    const changed = stockClient({
      shop: { myshopifyDomain: domain },
      inventoryItem: { id: "gid://shopify/InventoryItem/2", inventoryLevels: levels }
    })
    await expect(changed.api.stockLevelsPage(itemId)).rejects.toThrow("inventory item identity")
  })

  it("rejects duplicate quantity states and invalid numbers", async () => {
    for (const quantities of [
      [
        { name: "available", quantity: 1 },
        { name: "available", quantity: 2 }
      ],
      [{ name: "available", quantity: 1.5 }],
      [{ name: "available", quantity: Number.MAX_SAFE_INTEGER + 1 }]
    ]) {
      const { api } = stockClient({
        shop: { myshopifyDomain: domain },
        inventoryItem: { id: itemId, inventoryLevels: { ...levels, nodes: [{ ...level, quantities }] } }
      })
      await expect(api.stockLevelsPage(itemId)).rejects.toThrow("stock levels")
    }
  })

  it("rejects invalid input identities before contacting Shopify", async () => {
    const { api, transport } = stockClient({})
    await expect(api.stockLevelsPage("wrong")).rejects.toThrow(/InventoryItem/)
    expect(transport).not.toHaveBeenCalled()
  })
})

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

it("classifies denied inventory access without exposing provider diagnostics", async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ errors: [{ message: "private detail", extensions: { code: "ACCESS_DENIED" } }] })
  )
  await expect(new Shopify(domain, "test", transport).stockPage()).rejects.toThrow(ShopifyPermissionError)
})

describe("variantName", () => {
  it("leaves out the name Shopify gives a product's only variant", () => {
    expect(variantName("Red / Large")).toBe("Red / Large")
    expect(variantName("Default Title")).toBeNull()
    expect(variantName("")).toBeNull()
    expect(variantName(null)).toBeNull()
  })
})

describe("shopifyLocationKind", () => {
  const collective = "https://curator-merchant-to-merchant.sfe.shopifyinternal.com/curator"

  it("treats locations without a fulfillment service as the merchant's own", () => {
    expect(shopifyLocationKind({ isFulfillmentService: false, fulfillmentService: null })).toBe("merchant")
  })

  it("recognises Shopify Collective by its fulfillment service, whatever the location is called", () => {
    expect(shopifyLocationKind({ isFulfillmentService: true, fulfillmentService: { callbackUrl: collective } })).toBe(
      "shopify_collective"
    )
  })

  it("recognises Amazon's fulfillment location by its fulfillment service", () => {
    expect(
      shopifyLocationKind({
        isFulfillmentService: true,
        fulfillmentService: { callbackUrl: "https://api.maple.prod.scoville.dubai.aws.dev/" }
      })
    ).toBe("amazon_fulfillment")
  })

  it("marks other app-managed locations as fulfillment services", () => {
    expect(
      shopifyLocationKind({ isFulfillmentService: true, fulfillmentService: { callbackUrl: "https://3pl.example/" } })
    ).toBe("fulfillment_service")
    expect(shopifyLocationKind({ isFulfillmentService: true, fulfillmentService: { callbackUrl: null } })).toBe(
      "fulfillment_service"
    )
    expect(shopifyLocationKind({ isFulfillmentService: true, fulfillmentService: { callbackUrl: "not a url" } })).toBe(
      "fulfillment_service"
    )
  })
})

describe("piecesPerUnit", () => {
  const components = (quantities: number[], hasNextPage = false) => ({
    nodes: quantities.map((quantity, index) => ({
      quantity,
      productVariant: { id: `gid://shopify/ProductVariant/${index}` }
    })),
    pageInfo: { hasNextPage }
  })

  it("is 1 for an item and the component total for a bundle", () => {
    expect(piecesPerUnit({ requiresComponents: false, productVariantComponents: components([]) })).toBe(1)
    expect(piecesPerUnit({ requiresComponents: true, productVariantComponents: components([3]) })).toBe(3)
    expect(piecesPerUnit({ requiresComponents: true, productVariantComponents: components([1, 1]) })).toBe(2)
  })

  it("refuses to guess when Shopify didn't return the whole bundle", () => {
    expect(() => piecesPerUnit({ requiresComponents: true, productVariantComponents: components([2], true) })).toThrow(
      "components"
    )
  })
})

describe("bundle supplier components", () => {
  it("reads bundle components without supplier SKUs, which Copacker adds", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: {
          productVariants: {
            nodes: [
              {
                id: "gid://shopify/ProductVariant/10",
                title: "Two pack",
                sku: "BUNDLE",
                product: { id: "gid://shopify/Product/10", title: "Cord bundle" },
                inventoryItem: { id: "gid://shopify/InventoryItem/10", unitCost: null },
                requiresComponents: true,
                productVariantComponents: {
                  nodes: [
                    {
                      quantity: 2,
                      productVariant: {
                        id: "gid://shopify/ProductVariant/1",
                        sku: "CORD"
                      }
                    }
                  ],
                  pageInfo: { hasNextPage: false }
                }
              }
            ]
          }
        }
      })
    )
    const [bundle] = await new Shopify(domain, "test", transport).search("BUNDLE")
    // Until Copacker adds the components' supplier SKUs, a bundle can't be ordered.
    expect(() => bundleSupplierComponents(bundle!)).toThrow("supplier SKUs")
    const request = JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as { query: string }
    expect(request.query).not.toContain("metafield")
  })

  it("keeps each physical component's buyer and supplier SKU", () => {
    const productVariantComponents = {
      nodes: [
        {
          quantity: 2,
          productVariant: { id: "gid://shopify/ProductVariant/1", sku: "CORD", supplierSku: { value: "OC-1" } }
        },
        { quantity: 1, productVariant: { id: "gid://shopify/ProductVariant/2", sku: "MASK", supplierSku: null } }
      ],
      pageInfo: { hasNextPage: false }
    }
    expect(bundleSupplierComponents({ requiresComponents: true, productVariantComponents })).toEqual([
      { variantId: "gid://shopify/ProductVariant/1", quantity: 2, buyerSku: "CORD", supplierSku: "OC-1" },
      { variantId: "gid://shopify/ProductVariant/2", quantity: 1, buyerSku: "MASK", supplierSku: null }
    ])
  })

  it("rejects a bundle query that omitted supplier SKU data", () => {
    expect(() =>
      bundleSupplierComponents({
        requiresComponents: true,
        productVariantComponents: {
          nodes: [{ quantity: 1, productVariant: { id: "gid://shopify/ProductVariant/1" } }],
          pageInfo: { hasNextPage: false }
        }
      })
    ).toThrow("supplier SKUs")
  })
})

describe("Shopify webhook subscriptions", () => {
  const address = "https://copacker.example/api/webhooks/shopify"
  it("adds only the topics missing at this address and keeps other environments' subscriptions", async () => {
    const bodies: Array<{ query: string; variables: Record<string, unknown> }> = []
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> }
      bodies.push(body)
      if (body.query.startsWith("query Webhooks")) {
        return Response.json({
          data: {
            webhookSubscriptions: {
              nodes: [
                { topic: "ORDERS_CREATE", uri: address },
                { topic: "ORDERS_UPDATED", uri: "https://dev.example/api/webhooks/shopify" }
              ]
            }
          }
        })
      }
      return Response.json({ data: { webhookSubscriptionCreate: { userErrors: [] } } })
    })
    const api = new Shopify(domain, "test", transport)
    expect(await api.subscribeWebhooks(address, ["ORDERS_CREATE", "ORDERS_UPDATED"])).toEqual(["ORDERS_UPDATED"])
    expect(bodies.slice(1).map((body) => body.variables)).toEqual([{ topic: "ORDERS_UPDATED", uri: address }])
  })

  it("reports why Shopify refused a subscription", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) =>
      String(init?.body).includes("query Webhooks")
        ? Response.json({ data: { webhookSubscriptions: { nodes: [] } } })
        : Response.json({
            data: {
              webhookSubscriptionCreate: { userErrors: [{ message: "Protected customer data access required" }] }
            }
          })
    )
    await expect(new Shopify(domain, "test", transport).subscribeWebhooks(address, ["ORDERS_CREATE"])).rejects.toThrow(
      "Shopify rejected the ORDERS_CREATE subscription: Protected customer data access required"
    )
  })
})

describe("Shopify authorization", () => {
  const app = { clientId: "client", clientSecret: "secret" }
  const token = {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    refresh_token_expires_in: 7200,
    scope: "read_orders"
  }
  it("trades the callback code for an expiring token", async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const transport = vi.fn<typeof fetch>(async () => Response.json(token))
    await expect(exchangeShopifyCode(app, domain, "code", transport)).resolves.toEqual({
      token: { token: "access", refreshToken: "refresh", expiresAt: 4_600_000, refreshExpiresAt: 8_200_000 },
      scope: "read_orders"
    })
    const [url, init] = transport.mock.calls[0]!
    expect(url).toBe(`https://${domain}/admin/oauth/access_token`)
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: "client",
      client_secret: "secret",
      expiring: 1,
      code: "code"
    })
    vi.useRealTimers()
  })
  it("reports a rejected exchange or refresh with its status", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 400 }))
    await expect(exchangeShopifyCode(app, domain, "code", transport)).rejects.toMatchObject({ status: 400 })
    await expect(refreshShopifyToken(app, domain, "refresh", transport)).rejects.toBeInstanceOf(ShopifyRequestError)
  })
  it("refreshes with a form-encoded grant", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(token))
    await expect(refreshShopifyToken(app, domain, "old", transport)).resolves.toMatchObject({ token: "access" })
    const body = transport.mock.calls[0]![1]?.body
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(Object.fromEntries(body as URLSearchParams)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old",
      client_id: "client",
      client_secret: "secret"
    })
  })
  it("revokes the app's permissions", async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    await expect(revokeShopifyToken(domain, "access", transport)).resolves.toBe(true)
    expect(transport).toHaveBeenCalledWith(
      `https://${domain}/admin/api_permissions/current.json`,
      expect.objectContaining({ method: "DELETE", headers: { "X-Shopify-Access-Token": "access" } })
    )
  })
  it("validates Shopify callbacks and rejects tampering", () => {
    const params = new URLSearchParams({ code: "abc", shop: "test.myshopify.com", state: "nonce", timestamp: "123" }),
      secret = "test-secret"
    params.set("hmac", createHmac("sha256", secret).update(params.toString()).digest("hex"))
    expect(verifyShopifyHmac(params, secret)).toBe(true)
    params.set("state", "different")
    expect(verifyShopifyHmac(params, secret)).toBe(false)
    params.set("hmac", "short")
    expect(verifyShopifyHmac(params, secret)).toBe(false)
  })
})
