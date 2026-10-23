import { z } from "zod"
import type { Amazon } from "./amazon"
import { usMarketplaceId } from "./amazon-marketplaces"
import { costMinor, type Shopify } from "./shopify"

export const shopifyWriteReadQuery = `query WriteObservation($id:ID!){shop{myshopifyDomain currencyCode} currentAppInstallation{accessScopes{handle}} productVariant(id:$id){id sku price requiresComponents product{id} inventoryItem{id tracked unitCost{amount currencyCode}}}}`
export async function readShopifyWrite(api: Pick<Shopify, "graphql">, domain: string, variantId: string) {
  const result = z
    .object({
      shop: z.object({ myshopifyDomain: z.literal(domain), currencyCode: z.literal("USD") }),
      currentAppInstallation: z.object({ accessScopes: z.array(z.object({ handle: z.string() })) }),
      productVariant: z.object({
        id: z.literal(variantId),
        sku: z.string().nullable(),
        price: z.string(),
        requiresComponents: z.boolean(),
        product: z.object({ id: z.string() }),
        inventoryItem: z.object({
          id: z.string(),
          tracked: z.boolean(),
          unitCost: z.object({ amount: z.string(), currencyCode: z.literal("USD") }).nullable()
        })
      })
    })
    .parse(await api.graphql(shopifyWriteReadQuery, { id: variantId }))
  return {
    ...result.productVariant,
    amountMinor: costMinor(result.productVariant.price),
    costMinor: result.productVariant.inventoryItem.unitCost
      ? costMinor(result.productVariant.inventoryItem.unitCost.amount)
      : null,
    scopes: result.currentAppInstallation.accessScopes.map((scope) => scope.handle)
  }
}

const money = z.object({ currencyCode: z.string(), amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/) })
export const amazonListing = z.object({
  sku: z.string().min(1),
  summaries: z
    .array(z.object({ marketplaceId: z.string(), productType: z.string(), asin: z.string().optional() }))
    .default([]),
  offers: z.array(z.object({ marketplaceId: z.string(), offerType: z.string(), price: money })).default([]),
  fulfillmentAvailability: z
    .array(z.object({ fulfillmentChannelCode: z.string(), quantity: z.number().int().nonnegative().optional() }))
    .default([])
})
export async function amazonListingPage(api: Pick<Amazon, "request">, sellerId: string, pageToken?: string) {
  const query = new URLSearchParams({
    marketplaceIds: usMarketplaceId,
    includedData: "summaries,offers,fulfillmentAvailability",
    pageSize: "20"
  })
  if (pageToken) {
    query.set("pageToken", pageToken)
  }
  return z
    .object({
      items: z.array(amazonListing).max(20),
      pagination: z.object({ nextToken: z.string().optional() }).optional()
    })
    .parse(await api.request("GET", `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}?${query}`))
}
export async function readAmazonListing(api: Pick<Amazon, "request">, sellerId: string, sku: string) {
  const result = amazonListing.parse(
    await api.request(
      "GET",
      `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?marketplaceIds=${usMarketplaceId}&includedData=summaries,offers,fulfillmentAvailability`
    )
  )
  if (result.sku !== sku) {
    throw new Error("Amazon listing identity mismatch")
  }
  return result
}
export function amazonListingValues(item: z.infer<typeof amazonListing>) {
  const summaries = item.summaries.filter((summary) => summary.marketplaceId === usMarketplaceId)
  const offers = item.offers.filter((offer) => offer.marketplaceId === usMarketplaceId && offer.offerType === "B2C")
  const merchant = item.fulfillmentAvailability.filter((row) => row.fulfillmentChannelCode === "DEFAULT")
  const fba = item.fulfillmentAvailability.some((row) => row.fulfillmentChannelCode !== "DEFAULT")
  if (summaries.length !== 1 || offers.length > 1 || merchant.length > 1) {
    throw new Error("Amazon listing is ambiguous")
  }
  const offer = offers[0]
  const decimal = offer?.price.amount.split(".")
  const amountMinor = decimal ? Number(BigInt(decimal[0]!) * 100n + BigInt((decimal[1] ?? "").padEnd(2, "0"))) : null
  if (offer && (offer.price.currencyCode !== "USD" || !Number.isSafeInteger(amountMinor))) {
    throw new Error("Unsupported Amazon price basis")
  }
  let fulfillmentMode: "fbm" | "fba" | "other" = "other"
  if (merchant.length && !fba) {
    fulfillmentMode = "fbm"
  }
  if (!merchant.length && fba) {
    fulfillmentMode = "fba"
  }
  return {
    sellerSku: item.sku,
    productType: summaries[0]!.productType,
    asin: summaries[0]!.asin ?? null,
    fulfillmentMode,
    amountMinor,
    currency: offer?.price.currencyCode ?? null,
    quantity: merchant[0]?.quantity ?? null
  }
}
export async function writeAmazonListing(
  api: Pick<Amazon, "request">,
  input: { sellerId: string; sku: string; productType: string } & (
    | { field: "price"; amountMinor: number; currency: "USD" }
    | { field: "inventory"; quantity: number }
  )
) {
  if (input.field === "price") {
    z.number().int().nonnegative().max(2147483647).parse(input.amountMinor)
    z.literal("USD").parse(input.currency)
  } else {
    z.number().int().nonnegative().max(2147483647).parse(input.quantity)
  }
  const patch =
    input.field === "price"
      ? {
          op: "merge",
          path: "/attributes/purchasable_offer",
          value: [
            {
              marketplace_id: usMarketplaceId,
              currency: input.currency,
              audience: "ALL",
              our_price: [{ schedule: [{ value_with_tax: input.amountMinor / 100 }] }]
            }
          ]
        }
      : {
          op: "merge",
          path: "/attributes/fulfillment_availability",
          value: [{ fulfillment_channel_code: "DEFAULT", quantity: input.quantity }]
        }
  return z
    .object({
      sku: z.string(),
      status: z.enum(["ACCEPTED", "INVALID"]),
      submissionId: z.string(),
      issues: z.array(z.object({ code: z.string(), severity: z.string() })).optional()
    })
    .parse(
      await api.request(
        "PATCH",
        `/listings/2021-08-01/items/${encodeURIComponent(input.sellerId)}/${encodeURIComponent(input.sku)}?marketplaceIds=${usMarketplaceId}`,
        { productType: input.productType, patches: [patch] }
      )
    )
}

export const shopifyWriteQueries = {
  item: `mutation Item($id:ID!,$input:InventoryItemInput!){inventoryItemUpdate(id:$id,input:$input){inventoryItem{id} userErrors{field message}}}`,
  price: `mutation Price($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){productVariants{id} userErrors{field message}}}`,
  inventory: `mutation Inventory($input:InventorySetQuantitiesInput!,$key:String!){inventorySetQuantities(input:$input) @idempotent(key:$key){inventoryAdjustmentGroup{createdAt} userErrors{field message}}}`
}
const errors = z.array(z.object({ field: z.array(z.string()).nullable(), message: z.string() }))
export class ListingWriteRejected extends Error {}
export async function writeShopifyField(
  api: Pick<Shopify, "graphql">,
  input:
    | { field: "sku"; inventoryItemId: string; sku: string }
    | { field: "price"; productId: string; variantId: string; amountMinor: number }
    | {
        field: "inventory"
        inventoryItemId: string
        locationId: string
        quantity: number
        expectedQuantity: number
        quantityState: "available" | "on_hand"
        key: string
      }
) {
  if (input.field === "price") {
    z.number().int().nonnegative().max(2147483647).parse(input.amountMinor)
  }
  if (input.field === "inventory") {
    z.number().int().min(-2147483648).max(2147483647).parse(input.quantity)
    z.number().int().min(-2147483648).max(2147483647).parse(input.expectedQuantity)
  }
  let response: unknown
  let operation: string
  if (input.field === "price") {
    operation = "productVariantsBulkUpdate"
    response = await api.graphql(shopifyWriteQueries.price, {
      productId: input.productId,
      variants: [{ id: input.variantId, price: (input.amountMinor / 100).toFixed(2) }]
    })
  } else if (input.field === "inventory") {
    operation = "inventorySetQuantities"
    response = await api.graphql(shopifyWriteQueries.inventory, {
      key: input.key,
      input: {
        name: input.quantityState,
        reason: "correction",
        referenceDocumentUri: `copacker://write/${input.key}`,
        quantities: [
          {
            inventoryItemId: input.inventoryItemId,
            locationId: input.locationId,
            quantity: input.quantity,
            changeFromQuantity: input.expectedQuantity
          }
        ]
      }
    })
  } else {
    operation = "inventoryItemUpdate"
    response = await api.graphql(shopifyWriteQueries.item, {
      id: input.inventoryItemId,
      input: { sku: input.sku }
    })
  }
  const payload = z.record(z.string(), z.object({ userErrors: errors })).parse(response)[operation]
  if (!payload) {
    throw new Error("Shopify write response missing")
  }
  if (payload.userErrors.length) {
    throw new ListingWriteRejected("Shopify rejected the requested change")
  }
}
