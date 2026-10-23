import { z } from "zod"
import { readSourceSchema } from "./product-reads.ts"
import { id, pageInfoSchema, pageInputSchema, issueSchema } from "./protocol.ts"
import { readMetadata, readQuery } from "./reads.ts"
import { defineOperation } from "./registry.ts"

const order = z.strictObject({
  id,
  source: readSourceSchema,
  reference: z.string(),
  createdAt: z.iso.datetime(),
  observedAt: z.iso.datetime(),
  status: z.string(),
  channel: z.string(),
  items: z.array(
    z.strictObject({
      sku: z.string().nullable(),
      sourceVariantId: z.string().nullable(),
      title: z.string().nullable(),
      quantity: z.number(),
      unit: z.literal("source_order_unit")
    })
  ),
  netProductSales: z.strictObject({ amountMinor: z.number().int(), currency: z.string() }).nullable(),
  coverageIssues: z.array(issueSchema)
})
export const orderReadOperations = {
  "order.list": defineOperation(
    readMetadata("order.list", ["orders:read"], ["buyer"]),
    pageInputSchema
      .extend({
        provider: z.enum(["shopify", "amazon", "ebay"]).optional(),
        connectionId: id.optional(),
        sku: readQuery.optional(),
        query: readQuery.optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        timeZone: z.literal("UTC").default("UTC"),
        sort: z.literal("createdAt").default("createdAt"),
        direction: z.enum(["asc", "desc"]).default("desc")
      })
      .refine((v) => (!v.from && !v.to) || (!!v.from && !!v.to && v.from <= v.to), "Supply an ordered from/to range."),
    z.strictObject({ items: z.array(order), page: pageInfoSchema })
  ),
  "order.show": defineOperation(
    readMetadata("order.show", ["orders:read"], ["buyer"]),
    z.union([z.strictObject({ id }), z.strictObject({ reference: readQuery, connectionId: id.optional() })]),
    order
  )
}
