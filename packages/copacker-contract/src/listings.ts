import { z } from "zod"
import { id, revision, pageInputSchema, pageInfoSchema } from "./protocol.ts"
import { readMetadata } from "./reads.ts"
import { defineOperation } from "./registry.ts"

export const listingSchema = z.strictObject({
  id,
  revision,
  linkRevision: revision,
  source: z.strictObject({
    connectionId: id,
    provider: z.literal("amazon"),
    accountId: z.string(),
    marketplaceId: z.string(),
    externalId: z.string()
  }),
  sellerSku: z.string(),
  asin: z.string().nullable(),
  fulfillmentMode: z.enum(["fba", "fbm", "other"]),
  variantId: z.string().nullable(),
  piecesPerListing: z.number().int().positive().nullable(),
  inventoryOwner: z.enum(["external", "manual"]),
  price: z.strictObject({ amountMinor: z.number().int(), currency: z.string() }).nullable(),
  availability: z.number().int().nullable(),
  availabilityLocationId: z.string().nullable(),
  active: z.boolean(),
  observedAt: z.iso.datetime(),
  capabilities: z.array(
    z.strictObject({
      field: z.enum(["sku", "price", "inventory"]),
      writable: z.boolean(),
      reason: z.string().nullable()
    })
  )
})
const metadata = (name: string, write = false) => ({
  ...readMetadata(name, [write ? "products:write" : "products:read"], ["buyer"]),
  effects: write
    ? [{ kind: "local_write" as const, description: "Change a guarded listing link; no provider effect." }]
    : [],
  execution: {
    kind: write ? ("mutation" as const) : ("query" as const),
    idempotent: true,
    confirmation: false,
    readBranches: []
  }
})
export const listingOperations = {
  "product.listing.list": defineOperation(
    metadata("product.listing.list"),
    pageInputSchema.extend({
      connectionId: id.optional(),
      marketplaceId: z.string().optional(),
      sellerSku: z.string().optional(),
      unlinked: z.boolean().optional(),
      variantId: z.string().optional()
    }),
    z.strictObject({ items: z.array(listingSchema), page: pageInfoSchema })
  ),
  "product.listing.show": defineOperation(metadata("product.listing.show"), z.strictObject({ id }), listingSchema),
  "product.listing.link": defineOperation(
    metadata("product.listing.link", true),
    z.strictObject({
      id,
      expectedRevision: revision,
      expectedLinkRevision: revision,
      variantId: z.string(),
      piecesPerListing: z.number().int().min(1).max(1000000),
      inventoryOwner: z.enum(["external", "manual"]).default("external")
    }),
    listingSchema
  ),
  "product.listing.unlink": defineOperation(
    metadata("product.listing.unlink", true),
    z.strictObject({ id, expectedRevision: revision, expectedLinkRevision: revision }),
    listingSchema
  )
}
