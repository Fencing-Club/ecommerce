import { z } from "zod"
import { id, pageInfoSchema, pageInputSchema, revision } from "./protocol.ts"
import { readMetadata, readQuery } from "./reads.ts"
import { defineOperation } from "./registry.ts"
const providerRef = z.strictObject({
  provider: z.literal("amazon"),
  accountId: z.string(),
  network: z.string(),
  externalId: z.string()
})
const shipment = z.strictObject({
  id: id.nullable(),
  origin: z.enum(["copacker", "external"]),
  poId: id.nullable(),
  revision: revision.nullable(),
  poRevision: revision.nullable(),
  state: z.string(),
  reference: z.string().nullable(),
  providerReferences: z.array(providerRef),
  route: z
    .strictObject({
      supplierId: id,
      forwarderId: id.nullable(),
      deliveryId: id.nullable(),
      destination: z.enum(["amazon", "warehouse"])
    })
    .nullable(),
  bookingReference: z.string().nullable(),
  forwarderCarrier: z.string().nullable(),
  forwarderReference: z.string().nullable(),
  createdAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
  allowedActions: z.array(z.string())
})
export const shipmentReadOperations = {
  "shipment.list": defineOperation(
    readMetadata("shipment.list", ["shipments:read"], ["buyer", "supplier", "forwarder"]),
    pageInputSchema.extend({
      origin: z.enum(["copacker", "external"]).optional(),
      poId: id.optional(),
      state: readQuery.optional(),
      query: readQuery.optional()
    }),
    z.strictObject({ items: z.array(shipment), page: pageInfoSchema })
  ),
  "shipment.show": defineOperation(
    readMetadata("shipment.show", ["shipments:read"], ["buyer", "supplier", "forwarder"]),
    z.strictObject({ id }),
    shipment
  )
}
