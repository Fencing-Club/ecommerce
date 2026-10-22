import { z } from "zod"
import { requireAccess } from "@/server/authorization"
import { linkExistingAwd } from "@/server/awd-link"
import {
  approveInvoice,
  checkPacking,
  correctShipment,
  newShipment,
  prepareAmazonShipment,
  receiveShipment,
  reopenPacking,
  savePacking,
  submitPacking
} from "@/server/orders"
import { forwardInputSchema, forwardShipment, shipShipment } from "@/server/shipment-legs"
import {
  cancelAtAmazon,
  reconcileShipment,
  retryShipment,
  saveTransport,
  transportInputSchema
} from "@/server/shipment-operations"
import { defineAction, type Guard } from "./define"

// Shipments: packing them, the buyer's approval, the Amazon shipment and its labels, and each leg on to the
// destination. Every change sends the shipment's revision the page last showed, which a changed shipment refuses.
const editsShipments: Guard = { area: "shipments", level: "edit" }
const buyerEditsShipments: Guard = { kind: "buyer", ...editsShipments }
const revision = z.number().int().positive()
const record = z.object({ id: z.uuid() })
const revised = z.object({ id: z.uuid(), revision })
const ok = { ok: true } as const

export const shipmentActions = {
  // Resumes the editable packing draft of a PO, or starts its next shipment.
  "shipment.create": defineAction({
    guard: editsShipments,
    input: record,
    run: async ({ id }, s) => ({ redirect: `/shipments/${(await newShipment(s, id)).id}` })
  }),
  "shipment.save": defineAction({
    guard: editsShipments,
    input: z.object({ id: z.uuid(), revision, orderRevision: revision, draft: z.unknown() }),
    run: ({ id, revision, orderRevision, draft }, s) => savePacking(s, id, draft, revision, orderRevision)
  }),
  "shipment.check": defineAction({
    guard: editsShipments,
    input: z.object({ id: z.uuid(), packing: z.unknown() }),
    run: ({ id, packing }, s) => checkPacking(s, id, packing)
  }),
  "shipment.submit": defineAction({
    guard: editsShipments,
    input: z.object({ id: z.uuid(), revision, packing: z.unknown() }),
    run: ({ id, revision, packing }, s) => submitPacking(s, id, packing, revision)
  }),
  // Approving a supplier's invoice accepts its prices.
  "shipment.approve": defineAction({
    guard: { ...editsShipments, prices: true },
    input: revised.extend({ updateCost: z.boolean() }),
    run: async ({ id, revision, updateCost }, s) => {
      await approveInvoice(s, id, revision, updateCost)
      return ok
    }
  }),
  "shipment.prepareAmazon": defineAction({
    guard: editsShipments,
    input: revised,
    run: async ({ id, revision }, s) => {
      await prepareAmazonShipment(s, id, revision)
      return ok
    }
  }),
  "shipment.reopenPacking": defineAction({
    guard: editsShipments,
    input: revised,
    run: async ({ id, revision }, s) => {
      await reopenPacking(s, id, revision)
      return ok
    }
  }),
  "shipment.correct": defineAction({
    guard: editsShipments,
    input: z.object({ id: z.uuid(), reason: z.string() }),
    run: async ({ id, reason }, s) => {
      await correctShipment(s, id, reason)
      return ok
    }
  }),
  "shipment.linkExisting": defineAction({
    guard: editsShipments,
    input: revised.extend({ amazonShipmentId: z.unknown() }),
    run: ({ id, revision, amazonShipmentId }, s) => linkExistingAwd(s, id, revision, amazonShipmentId)
  }),
  "shipment.retry": defineAction({
    guard: buyerEditsShipments,
    input: revised,
    run: async ({ id, revision }, s) => {
      await retryShipment(s, id, revision)
      return ok
    }
  }),
  "shipment.reconcile": defineAction({
    guard: buyerEditsShipments,
    input: z.object({ id: z.uuid(), amazonOrderId: z.string() }),
    run: async ({ id, amazonOrderId }, s) => {
      await reconcileShipment(s, id, amazonOrderId)
      return ok
    }
  }),
  "shipment.cancelAmazon": defineAction({
    guard: buyerEditsShipments,
    input: record,
    run: async ({ id }, s) => {
      await cancelAtAmazon(s, id)
      return ok
    }
  }),
  "shipment.transport": defineAction({
    guard: buyerEditsShipments,
    input: transportInputSchema,
    run: async (input, s) => {
      await saveTransport(s, input)
      return ok
    }
  }),
  "shipment.ship": defineAction({
    guard: editsShipments,
    input: record,
    run: async ({ id }, s) => {
      await shipShipment(s, id)
      return ok
    }
  }),
  // The forwarder moves its own leg on with Purchase orders: Edit. The buyer records the freight cost for a forwarder
  // that isn't on Copacker, so it needs prices too.
  "shipment.forward": defineAction({
    guard: (s) => {
      if (s.org.kind === "forwarder") {
        requireAccess(s, "orders", "edit")
      } else {
        requireAccess(s, "shipments", "edit")
        requireAccess(s, "prices")
      }
    },
    input: forwardInputSchema,
    run: async (input, s) => {
      await forwardShipment(s, input)
      return ok
    }
  }),
  "shipment.received": defineAction({
    guard: editsShipments,
    input: record,
    run: async ({ id }, s) => {
      await receiveShipment(s, id)
      return ok
    }
  })
}
