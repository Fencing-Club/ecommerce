import { z } from "zod"
export const shopDomainSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/)
// Accepts what merchants paste: an admin URL, a storefront .myshopify.com URL, or the bare store handle.
export function normalizeShopDomain(input: string) {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
  const admin = value.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/)
  if (admin) {
    return `${admin[1]}.myshopify.com`
  }
  const host = value.split(/[/?#]/)[0] ?? ""
  return /^[a-z0-9][a-z0-9-]*$/.test(host) ? `${host}.myshopify.com` : host
}
const field = z.object({ value: z.string() }).nullable()
const stockPageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
// Apps that manage a location register a fulfillment service, and Shopify calls that service's callback. Known apps
// are recognised by the callback's host, never by the location's display name (which can be renamed or localized).
// Collective locations mirror a partner's stock; Amazon's location mirrors the seller's FBA stock.
export type ShopifyLocationKind = "merchant" | "shopify_collective" | "amazon_fulfillment" | "fulfillment_service"
// Merchant locations hold the store's own stock. Locations with a fulfillment service are created and managed by an
// app (Shopify Collective, Amazon, 3PLs), and their quantities are reported by that app.
const serviceHosts = new Map<string, ShopifyLocationKind>([
  ["curator-merchant-to-merchant.sfe.shopifyinternal.com", "shopify_collective"],
  ["api.maple.prod.scoville.dubai.aws.dev", "amazon_fulfillment"]
])
export function shopifyLocationKind(location: {
  isFulfillmentService: boolean
  fulfillmentService: { callbackUrl: string | null } | null
}): ShopifyLocationKind {
  if (!location.isFulfillmentService) {
    return "merchant"
  }
  const callback = location.fulfillmentService?.callbackUrl
  const host = callback && URL.canParse(callback) ? new URL(callback).hostname : ""
  return serviceHosts.get(host) ?? "fulfillment_service"
}
// The variants a bundle is made of and how many of each one bundle contains.
export type BundleComponent = { variantId: string; quantity: number }
const bundleComponents = z.object({
  nodes: z
    .array(z.object({ quantity: z.number().int().positive().safe(), productVariant: z.object({ id: z.string() }) }))
    .max(25),
  pageInfo: z.object({ hasNextPage: z.boolean() })
})
const bundleComponentFields = "nodes{quantity productVariant{id}} pageInfo{hasNextPage}"
function bundleComponentList(components: z.infer<typeof bundleComponents>): BundleComponent[] | null {
  return components.pageInfo.hasNextPage
    ? null
    : components.nodes.map((node) => ({ variantId: node.productVariant.id, quantity: node.quantity }))
}
const stockLevel = z.object({
  id: z.string().min(1),
  location: z.object({
    id: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/),
    name: z.string(),
    isFulfillmentService: z.boolean(),
    fulfillmentService: z.object({ callbackUrl: z.string().nullable() }).nullable()
  }),
  quantities: z
    .array(
      z.object({
        name: z.enum(["available", "on_hand", "incoming", "committed"]),
        quantity: z.number().int().safe()
      })
    )
    .max(4)
    .refine((values) => new Set(values.map((value) => value.name)).size === values.length)
})
const stockLevels = z.object({ nodes: z.array(stockLevel).max(250), pageInfo: stockPageInfo })
const stockLevelFields = `id location{id name isFulfillmentService fulfillmentService{callbackUrl}} quantities(names:["available","on_hand","incoming","committed"]){name quantity}`
// Inventory thumbnails, resized by Shopify's CDN.
const stockMediaFields = "preview{image{url(transform:{maxWidth:160,maxHeight:160})}}"
const stockMedia = z.object({ preview: z.object({ image: z.object({ url: z.url() }).nullable() }).nullable() })
const variant = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  product: z.object({ id: z.string(), title: z.string() }),
  inventoryItem: z.object({
    id: z.string(),
    unitCost: z.object({ amount: z.string(), currencyCode: z.string() }).nullable()
  }),
  supplierSku: field,
  asin: field,
  requiresComponents: z.boolean(),
  productVariantComponents: bundleComponents
})
export type CatalogVariant = z.infer<typeof variant>
// Pieces in one sellable unit: a bundle's component quantities added up (a 3-pack of one item is 3), otherwise 1.
export function piecesPerUnit(catalog: Pick<CatalogVariant, "requiresComponents" | "productVariantComponents">) {
  if (!catalog.requiresComponents) {
    return 1
  }
  const components = bundleComponentList(catalog.productVariantComponents)
  if (!components?.length) {
    throw new Error("Shopify didn't return this bundle's components; check the bundle in Shopify")
  }
  return components.reduce((sum, component) => sum + component.quantity, 0)
}
export class ShopifyPermissionError extends Error {}
// Shopify answered with an HTTP error; the status says whether reconnecting (401, 403) or waiting (429, 5xx) helps.
export class ShopifyRequestError extends Error {
  constructor(readonly status: number) {
    super(`Shopify request failed (${status})`)
  }
}
export class Shopify {
  constructor(
    private domain: string,
    private token: string,
    private transport: typeof fetch = fetch
  ) {
    shopDomainSchema.parse(domain)
  }
  async graphql(query: string, variables: Record<string, unknown> = {}) {
    const response = await this.transport(`https://${this.domain}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": this.token, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) {
      throw new ShopifyRequestError(response.status)
    }
    const envelope = z
      .object({ data: z.unknown().optional(), errors: z.array(z.unknown()).optional() })
      .parse(await response.json())
    if (
      envelope.errors?.some(
        (error) => z.object({ extensions: z.object({ code: z.literal("ACCESS_DENIED") }) }).safeParse(error).success
      )
    ) {
      throw new ShopifyPermissionError("Reconnect Shopify to authorize inventory location access")
    }
    if (envelope.errors?.length) {
      // GraphQL error messages describe the query, not the store's data, so they are safe to keep for diagnosis.
      const messages = envelope.errors.map((error) => z.object({ message: z.string() }).safeParse(error).data?.message)
      throw new Error(`Shopify rejected the request: ${messages.filter(Boolean).join("; ") || "no details"}`)
    }
    return envelope.data
  }
  async search(query: string) {
    return z.object({ productVariants: z.object({ nodes: z.array(variant) }) }).parse(
      await this.graphql(`query Catalog($query:String!){productVariants(first:30,query:$query){nodes{${fields}}}}`, {
        query
      })
    ).productVariants.nodes
  }
  async catalogPage(after: string | null = null) {
    return z
      .object({
        productVariants: z.object({
          nodes: z.array(variant),
          pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
        })
      })
      .parse(
        await this.graphql(
          `query ImportCatalog($after:String){productVariants(first:100,after:$after){nodes{${fields}} pageInfo{hasNextPage endCursor}}}`,
          { after }
        )
      ).productVariants
  }
  async stockPage(after: string | null = null) {
    const parsed = z
      .object({
        shop: z.object({ myshopifyDomain: z.literal(this.domain) }),
        productVariants: z.object({
          nodes: z
            .array(
              z.object({
                id: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
                sku: z.string().nullable(),
                title: z.string(),
                product: z.object({
                  id: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/),
                  title: z.string(),
                  featuredMedia: stockMedia.nullable()
                }),
                media: z.object({ nodes: z.array(stockMedia).max(1) }),
                requiresComponents: z.boolean(),
                inventoryQuantity: z.number().int().safe().nullable(),
                productVariantComponents: bundleComponents,
                inventoryItem: z.object({
                  id: z.string().regex(/^gid:\/\/shopify\/InventoryItem\/\d+$/),
                  tracked: z.boolean(),
                  inventoryLevels: stockLevels
                })
              })
            )
            .max(50),
          pageInfo: stockPageInfo
        })
      })
      .safeParse(
        await this.graphql(
          `query Stock($after:String){shop{myshopifyDomain} productVariants(first:50,after:$after){nodes{id sku title product{id title featuredMedia{${stockMediaFields}}} media(first:1){nodes{${stockMediaFields}}} requiresComponents inventoryQuantity productVariantComponents(first:25){${bundleComponentFields}} inventoryItem{id tracked inventoryLevels(first:20){nodes{${stockLevelFields}} pageInfo{hasNextPage endCursor}}}} pageInfo{hasNextPage endCursor}}}`,
          { after }
        )
      )
    if (!parsed.success) {
      throw new Error("Shopify stock page or store identity is invalid")
    }
    return parsed.data.productVariants
  }
  async stockLevelsPage(inventoryItemId: string, after: string | null = null) {
    z.string()
      .regex(/^gid:\/\/shopify\/InventoryItem\/\d+$/)
      .parse(inventoryItemId)
    const parsed = z
      .object({
        shop: z.object({ myshopifyDomain: z.literal(this.domain) }),
        inventoryItem: z.object({ id: z.literal(inventoryItemId), inventoryLevels: stockLevels })
      })
      .safeParse(
        await this.graphql(
          `query StockLevels($id:ID!,$after:String){shop{myshopifyDomain} inventoryItem(id:$id){id inventoryLevels(first:250,after:$after){nodes{${stockLevelFields}} pageInfo{hasNextPage endCursor}}}}`,
          { id: inventoryItemId, after }
        )
      )
    if (!parsed.success) {
      throw new Error("Shopify stock levels or inventory item identity is invalid")
    }
    return parsed.data.inventoryItem.inventoryLevels
  }
  async stock(assertActive?: () => Promise<void>) {
    const startedAt = new Date().toISOString()
    const deadline = Date.now() + 5 * 60 * 1000
    let requests = 0,
      bytes = 0,
      levelCount = 0
    const rows: {
      variantId: string
      inventoryItemId: string
      buyerSku: string | null
      // Product details for grouping and display. Optional because snapshots stored before they were collected lack them.
      productId?: string
      productTitle?: string
      variantTitle?: string
      imageUrl?: string | null
      // A bundle holds no stock of its own; Shopify reports how many can be sold from its components' stock instead.
      // Components are null when Shopify lists more than it returned in one page.
      bundle?: { available: number | null; components?: BundleComponent[] | null }
      tracked: boolean
      unit: "shopify_inventory_unit"
      levels: {
        locationId: string
        locationName: string
        // Optional because snapshots stored before location kinds were collected lack it.
        locationKind?: ShopifyLocationKind
        available: number | null
        onHand: number | null
        incoming: number | null
        committed: number | null
      }[]
    }[] = []
    const variantIds = new Set<string>(),
      inventoryIds = new Set<string>(),
      variantCursors = new Set<string>()
    const check = async () => {
      await assertActive?.()
      if (Date.now() >= deadline) {
        throw new Error("Shopify stock collection timed out")
      }
    }
    const fetchPage = async <T>(read: () => Promise<T>) => {
      await check()
      if (++requests > 500) {
        throw new Error("Shopify stock collection exceeds the request limit")
      }
      const page = await read()
      await check()
      bytes += Buffer.byteLength(JSON.stringify(page), "utf8")
      if (bytes > 8 * 1024 * 1024) {
        throw new Error("Shopify stock collection exceeds the supported size")
      }
      return page
    }
    const compare = (a: string, b: string) => {
      if (a === b) {
        return 0
      }
      return a < b ? -1 : 1
    }
    let after: string | null = null
    for (let pageNumber = 0; pageNumber < 200; pageNumber++) {
      const page = await fetchPage(() => this.stockPage(after))
      for (const variant of page.nodes) {
        const item = variant.inventoryItem
        if (variantIds.has(variant.id) || inventoryIds.has(item.id)) {
          throw new Error("Shopify stock repeated a product identity")
        }
        variantIds.add(variant.id)
        inventoryIds.add(item.id)
        const row: (typeof rows)[number] = {
          variantId: variant.id,
          inventoryItemId: item.id,
          buyerSku: variant.sku,
          productId: variant.product.id,
          productTitle: variant.product.title,
          variantTitle: variant.title,
          // Prefer the variant's own photo, then the product's.
          imageUrl:
            variant.media.nodes[0]?.preview?.image?.url ?? variant.product.featuredMedia?.preview?.image?.url ?? null,
          ...(variant.requiresComponents && {
            bundle: {
              available: variant.inventoryQuantity,
              components: bundleComponentList(variant.productVariantComponents)
            }
          }),
          tracked: item.tracked,
          unit: "shopify_inventory_unit",
          levels: []
        }
        const locations = new Set<string>(),
          levelIds = new Set<string>(),
          cursors = new Set<string>()
        let levels = item.inventoryLevels
        for (let levelPage = 0; ; levelPage++) {
          for (const level of levels.nodes) {
            if (locations.has(level.location.id) || levelIds.has(level.id)) {
              throw new Error("Shopify stock repeated a location identity")
            }
            if (++levelCount > 20000) {
              throw new Error("Shopify stock collection exceeds the location limit")
            }
            locations.add(level.location.id)
            levelIds.add(level.id)
            const quantity = (name: string) => level.quantities.find((value) => value.name === name)?.quantity ?? null
            row.levels.push({
              locationId: level.location.id,
              locationName: level.location.name,
              locationKind: shopifyLocationKind(level.location),
              available: quantity("available"),
              onHand: quantity("on_hand"),
              incoming: quantity("incoming"),
              committed: quantity("committed")
            })
          }
          if (!levels.pageInfo.hasNextPage) {
            break
          }
          const cursor = levels.pageInfo.endCursor
          if (!cursor || cursors.has(cursor) || levelPage >= 99) {
            throw new Error("Shopify stock location pagination did not complete")
          }
          cursors.add(cursor)
          levels = await fetchPage(() => this.stockLevelsPage(item.id, cursor))
        }
        row.levels.sort((a, b) => compare(a.locationId, b.locationId))
        rows.push(row)
      }
      if (!page.pageInfo.hasNextPage) {
        rows.sort((a, b) => compare(a.variantId, b.variantId))
        return {
          source: "shopify" as const,
          scopeKey: "store" as const,
          shopifyDomain: this.domain,
          startedAt,
          observedAt: new Date().toISOString(),
          rows
        }
      }
      const cursor = page.pageInfo.endCursor
      if (!cursor || variantCursors.has(cursor)) {
        throw new Error("Shopify stock variant pagination did not complete")
      }
      variantCursors.add(cursor)
      after = cursor
    }
    throw new Error("Shopify stock collection exceeds the variant page limit")
  }
  async variants(ids: string[]) {
    return z
      .object({ nodes: z.array(variant.nullable()) })
      .parse(
        await this.graphql(`query Variants($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{${fields}}}}`, { ids })
      ).nodes
  }
  async supplierSku(variantId: string, value: string) {
    if (!value) {
      const result = z
        .object({ metafieldsDelete: z.object({ userErrors: z.array(z.object({ message: z.string() })) }) })
        .parse(
          await this.graphql(
            `mutation ClearSupplierSku($fields:[MetafieldIdentifierInput!]!){metafieldsDelete(metafields:$fields){userErrors{message}}}`,
            { fields: [{ ownerId: variantId, namespace: "custom", key: "supplier_sku" }] }
          )
        )
      if (result.metafieldsDelete.userErrors.length) {
        throw new Error("Shopify rejected supplier SKU removal")
      }
      return
    }
    const response = z
      .object({ metafieldsSet: z.object({ userErrors: z.array(z.object({ message: z.string() })) }) })
      .parse(
        await this.graphql(
          `mutation SupplierSku($fields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$fields){userErrors{message}}}`,
          {
            fields: [
              { ownerId: variantId, namespace: "custom", key: "supplier_sku", type: "single_line_text_field", value }
            ]
          }
        )
      )
    if (response.metafieldsSet.userErrors.length) {
      throw new Error("Shopify rejected supplier SKU update")
    }
  }
  async unitCost(inventoryItemId: string, cost: number) {
    const response = z
      .object({ inventoryItemUpdate: z.object({ userErrors: z.array(z.object({ message: z.string() })) }) })
      .parse(
        await this.graphql(
          `mutation Cost($id:ID!,$input:InventoryItemInput!){inventoryItemUpdate(id:$id,input:$input){userErrors{message}}}`,
          { id: inventoryItemId, input: { cost: (cost / 100).toFixed(2) } }
        )
      )
    if (response.inventoryItemUpdate.userErrors.length) {
      throw new Error("Shopify rejected unit cost update")
    }
  }
}
const fields = `id title sku product{id title} inventoryItem{id unitCost{amount currencyCode}} supplierSku:metafield(namespace:"custom",key:"supplier_sku"){value} asin:metafield(namespace:"custom",key:"asin"){value} requiresComponents productVariantComponents(first:25){${bundleComponentFields}}`
