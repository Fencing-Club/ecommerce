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
const variant = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  product: z.object({ title: z.string() }),
  inventoryItem: z.object({
    id: z.string(),
    unitCost: z.object({ amount: z.string(), currencyCode: z.string() }).nullable()
  }),
  supplierSku: field,
  asin: field
})
export type CatalogVariant = z.infer<typeof variant>
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
      throw new Error(`Shopify request failed (${response.status})`)
    }
    const envelope = z
      .object({ data: z.unknown().optional(), errors: z.array(z.unknown()).optional() })
      .parse(await response.json())
    if (envelope.errors?.length) {
      throw new Error("Shopify rejected the request; check app permissions")
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
const fields = `id title sku product{title} inventoryItem{id unitCost{amount currencyCode}} supplierSku:metafield(namespace:"custom",key:"supplier_sku"){value} asin:metafield(namespace:"custom",key:"asin"){value}`
