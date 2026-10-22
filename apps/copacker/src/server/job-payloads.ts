import { shopDomainSchema } from "@repo/copacker-marketplaces/shopify"
import { packingSchema } from "@repo/copacker-shipments"
import { z } from "zod"
import type { jobs } from "@/db/schema"
import { stores } from "@/lib/stores"

// What each kind of job carries. This module imports only zod and the packages, so every producer and handler can use
// it without an import cycle. A job's payload is checked against its schema when it runs.

export type JobKind = (typeof jobs.$inferSelect)["kind"]

const orgId = z.uuid()
const positive = z.number().int().positive()
const period = z.object({ from: z.iso.datetime(), to: z.iso.datetime() })
const shopifyOrderIds = z.array(z.number().int().positive().safe()).max(1000)

// The language of the request that queued an email, for a reader without an account.
const emailFields = { to: z.email(), locale: z.string().optional() }
const emailPayload = z.discriminatedUnion("type", [
  // `name` is who invites: the buyer, or the workspace a teammate is invited to.
  z.object({
    type: z.literal(["invite", "team", "forwarder"]),
    ...emailFields,
    invitation: z.string(),
    name: z.string().optional()
  }),
  z.object({ type: z.literal("po"), ...emailFields, orderId: z.uuid(), revision: positive.optional() }),
  z.object({ type: z.literal("ready"), ...emailFields, orderId: z.uuid(), shipmentId: z.uuid() }),
  z.object({
    type: z.literal("data_request"),
    ...emailFields,
    shop: z.string(),
    requestId: z.number().int(),
    orders: z.array(z.string()).max(1000)
  })
])

export const jobPayloads = {
  // Creates a shipment's AWD order or FBA inbound plan, then fetches its labels. `operationId` is the FBA step waited on.
  amazon: z.object({ shipmentId: z.uuid(), revision: z.number(), operationId: z.string().optional() }),
  email: emailPayload,
  // Saves an approved invoice's supplier SKUs, and its unit costs in Shopify.
  shopify: z.object({
    orgId,
    orderId: z.uuid(),
    revision: z.number(),
    changes: packingSchema.shape.changes,
    updateCost: z.boolean()
  }),
  import: z.object({ id: z.uuid(), revision: positive }),
  stock: z.object({ id: z.uuid(), revision: positive }),
  sales: z.object({
    orgId,
    source: z.enum(stores),
    revision: positive,
    // Where a paused sync picks up: the periods still to read, and the unbroken period stored so far in this sync.
    resume: z
      .object({
        remaining: z.array(period),
        covered: period.nullable(),
        customersIncluded: z.boolean().optional(),
        after: z.number().int().min(0).max(32).optional()
      })
      .optional()
  }),
  analytics: z.strictObject({ orgId, externalAccountId: z.string().min(1), revision: positive }),
  "shopify-event": z.object({ orgId, shop: shopDomainSchema, target: z.enum(["sales", "stock", "uninstalled"]) }),
  "shopify-subscribe": z.object({ orgId }),
  "shopify-compliance": z.discriminatedUnion("topic", [
    z.object({
      topic: z.literal("customers/data_request"),
      shop: shopDomainSchema,
      orders: shopifyOrderIds,
      requestId: z.number().int().positive().safe()
    }),
    z.object({ topic: z.literal("shop/redact"), shop: shopDomainSchema }),
    z.object({
      topic: z.literal("customers/redact"),
      shop: shopDomainSchema,
      customer: z.number().int().positive().safe(),
      orders: shopifyOrderIds
    })
  ]),
  "amazon-event": z.object({ orgId, sellerId: z.string(), target: z.enum(["sales", "stock"]) }),
  "amazon-subscribe": z.object({ orgId }),
  "amazon-ads": z.object({
    orgId,
    generation: z.uuid(),
    profileId: z.string(),
    from: z.iso.date(),
    to: z.iso.date(),
    reportId: z.string().optional(),
    productDetail: z.boolean().optional()
  }),
  "ebay-event": z.object({ orgId, userId: z.string().min(1) }),
  "ebay-subscribe": z.object({ orgId }),
  reconcile: z.object({ date: z.iso.date() }),
  // One shipment's labels, or those of every shipment of a buyer's that waits on them.
  labels: z.union([
    z.object({ shipmentId: z.uuid(), actor: z.string() }),
    z.object({ buyerOrgId: z.uuid(), actor: z.string() })
  ])
} satisfies Record<JobKind, z.ZodType>

// What a producer queues, and what the job's handler receives once it's checked.
export type JobPayload<K extends JobKind> = z.input<(typeof jobPayloads)[K]>
export type JobInput<K extends JobKind> = z.output<(typeof jobPayloads)[K]>
export type AnyJobPayload = { [K in JobKind]: JobPayload<K> }[JobKind]

// The row that queues a job. Every insert into jobs builds its rows here, so a payload that doesn't match its kind's
// schema is a type error.
export function jobRow<K extends JobKind>(
  kind: K,
  key: string,
  payload: JobPayload<K>,
  options: { runAt?: Date } = {}
) {
  return { kind, key, payload, ...options }
}
