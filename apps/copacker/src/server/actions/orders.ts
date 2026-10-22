import { z } from "zod"
import { addComment } from "@/server/comments"
import { retryJob } from "@/server/jobs"
import { addLandedCost, removeLandedCost } from "@/server/landed-costs"
import { closeOrder, createOrder, deleteDraftOrder, submitOrder, updateDraftOrder } from "@/server/orders"
import { defineAction, fields, type Guard } from "./define"

// Purchase orders: drafting, sending, closing and deleting them, their comments and landed costs, and retrying a PO's
// failed email or Shopify job. Purchase orders: Edit needs prices too (see highestLevel).
const editsOrders: Guard = { area: "orders", level: "edit" }
const record = z.object({ id: z.uuid() })
const revision = z.number().int().positive()

export const orderActions = {
  "order.create": defineAction({
    guard: editsOrders,
    input: fields,
    run: async (data, s) => ({ redirect: `/orders/${(await createOrder(s, data)).id}` })
  }),
  // Saves a draft as its next revision.
  "order.update": defineAction({
    guard: editsOrders,
    input: z.object({ id: z.uuid(), revision, order: z.unknown() }),
    run: async ({ id, revision, order }, s) => {
      await updateDraftOrder(s, id, order, revision)
      return { redirect: `/orders/${id}` }
    }
  }),
  "order.submit": defineAction({
    guard: editsOrders,
    input: z.object({ id: z.uuid(), revision }),
    run: async ({ id, revision }, s) => ({ ok: true, ...(await submitOrder(s, id, revision)) })
  }),
  "order.close": defineAction({
    guard: editsOrders,
    input: record,
    run: async ({ id }, s) => {
      await closeOrder(s, id)
      return { ok: true }
    }
  }),
  "order.delete": defineAction({
    guard: editsOrders,
    input: record,
    run: async ({ id }, s) => {
      await deleteDraftOrder(s, id)
      return { redirect: "/orders" }
    }
  }),
  // Commenting needs only to see the PO.
  "order.comment": defineAction({ guard: { area: "orders" }, input: fields, run: (data, s) => addComment(s, data) }),
  "landedCost.create": defineAction({ guard: editsOrders, input: fields, run: (data, s) => addLandedCost(s, data) }),
  "landedCost.delete": defineAction({
    guard: editsOrders,
    input: record,
    run: async ({ id }, s) => {
      await removeLandedCost(s, id)
      return { ok: true }
    }
  }),
  "job.retry": defineAction({
    guard: { admin: true, kind: "buyer" },
    input: record,
    run: async ({ id }, s) => {
      await retryJob(s, id)
      return { ok: true }
    }
  })
}
