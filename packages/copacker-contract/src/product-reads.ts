import { z } from "zod"
import { id as uuid, pageInfoSchema, pageInputSchema, revision } from "./protocol.ts"
import { readMetadata, readQuery } from "./reads.ts"
import { defineOperation } from "./registry.ts"

const id = z.string().min(1).max(4096)
export const readSourceSchema = z.strictObject({
  connectionId: uuid,
  provider: z.string(),
  accountId: z.string(),
  externalId: z.string()
})
const money = z.strictObject({ amountMinor: z.number().int(), currency: z.string() }).nullable()
const variant = z.strictObject({
  id,
  revision: revision.nullable(),
  productId: id,
  sku: z.string().nullable(),
  supplierSku: z.string().nullable(),
  asin: z.string().nullable(),
  title: z.string(),
  options: z.record(z.string(), z.string()),
  source: readSourceSchema.nullable(),
  price: money,
  cost: money,
  priceBasis: z.string().nullable(),
  piecesPerSellablePack: z.number().int().nullable(),
  sellablePacksPerCase: z.number().int().nullable()
})
const product = z.strictObject({
  id,
  revision: revision.nullable(),
  kind: z.enum(["buyer", "supplier"]),
  identityBasis: z.enum(["provider", "copacker"]),
  title: z.string(),
  status: z.enum(["active", "archived", "unknown"]),
  supplierId: id.nullable(),
  source: readSourceSchema.nullable(),
  observedAt: z.iso.datetime().nullable(),
  variants: z.array(variant),
  allowedActions: z.array(z.string())
})
const filters = {
  kind: z.enum(["buyer", "supplier"]).optional(),
  connectionId: id.optional(),
  supplierId: id.optional(),
  status: z.enum(["active", "archived", "unknown"]).optional(),
  sku: readQuery.optional(),
  query: readQuery.optional(),
  sort: z.literal("title").default("title"),
  direction: z.enum(["asc", "desc"]).default("asc")
}
export const productReadOperations = {
  "product.list": defineOperation(
    readMetadata("product.list", ["products:read"], ["buyer", "supplier"]),
    pageInputSchema.extend(filters),
    z.strictObject({ items: z.array(product), page: pageInfoSchema })
  ),
  "product.search": defineOperation(
    readMetadata("product.search", ["products:read"], ["buyer", "supplier"]),
    pageInputSchema.extend({ query: readQuery, connectionId: id.optional(), supplierId: id.optional() }),
    z.strictObject({ items: z.array(product), page: pageInfoSchema })
  ),
  "product.show": defineOperation(
    readMetadata("product.show", ["products:read"], ["buyer", "supplier"]),
    z.strictObject({ id }),
    product
  )
}

const balance = z.strictObject({
  variantId: id,
  locationId: id,
  sku: z.string().nullable(),
  source: readSourceSchema.nullable(),
  kind: z.enum(["physical", "reported", "channel_availability"]),
  quantityState: z.string(),
  quantity: z.number().nullable(),
  unit: z.string(),
  revision: revision.nullable(),
  snapshotId: id.nullable(),
  observedAt: z.iso.datetime().nullable(),
  tracking: z.boolean().nullable(),
  writable: z.boolean()
})
const stockFilters = {
  connectionId: id.optional(),
  locationId: id.optional(),
  variantId: id.optional(),
  sku: readQuery.optional(),
  kind: z.enum(["physical", "reported", "channel_availability"]).optional()
}
const location = z.strictObject({
  id,
  name: z.string(),
  kind: z.enum(["merchant", "supplier", "amazon_reported"]),
  source: readSourceSchema.nullable(),
  snapshotId: id.nullable(),
  observedAt: z.iso.datetime().nullable(),
  quantityStates: z.array(z.string()),
  writable: z.boolean()
})
export const inventoryReadOperations = {
  "inventory.list": defineOperation(
    readMetadata("inventory.list", ["inventory:read"], ["buyer", "supplier"]),
    pageInputSchema.extend(stockFilters),
    z.strictObject({ items: z.array(balance), page: pageInfoSchema })
  ),
  "inventory.show": defineOperation(
    readMetadata("inventory.show", ["inventory:read"], ["buyer", "supplier"]),
    z.strictObject({ id, locationId: id.optional() }),
    z.strictObject({ items: z.array(balance) })
  ),
  "location.list": defineOperation(
    readMetadata("location.list", ["inventory:read"], ["buyer", "supplier"]),
    pageInputSchema.extend({
      connectionId: id.optional(),
      kind: z.enum(["merchant", "supplier", "amazon_reported"]).optional()
    }),
    z.strictObject({ items: z.array(location), page: pageInfoSchema })
  )
}
