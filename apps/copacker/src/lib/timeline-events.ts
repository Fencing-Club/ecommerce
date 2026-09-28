import { z } from "zod"

// Why a purchase order got a new revision, as a key in orders.timeline.events.
export const revisionReasons = ["created", "edited", "approvedSupplierChanges", "approvedCommercialChanges"] as const

const text = z.string()

// What happened to a purchase order, as a key in orders.timeline.events and the values it names, so each reader sees it
// in their own language. Values are what someone typed (a note, a reason, a carrier) or names, kept as written; a date
// is an ISO day.
export const timelineEventSchema = z.discriminatedUnion("key", [
  z.object({
    key: z.enum([
      ...revisionReasons,
      "submittedToSupplier",
      "sent",
      "closed",
      "shipmentReceived",
      "supplierShipped",
      "supplierReportedCollected",
      "amazonShipmentCancelled",
      "labelsReleased",
      "labelsReleasedToShare",
      "readyDateCleared",
      "changesProposed",
      "changesWithdrawn",
      "changesDeclined",
      "packingReady",
      "invoiceEntered",
      "invoiceChangesSubmitted"
    ]),
    values: z.null()
  }),
  z.object({ key: z.literal("readyDateSet"), values: z.object({ date: z.iso.date() }) }),
  z.object({ key: z.literal("changesProposedWithNote"), values: z.object({ note: text }) }),
  z.object({
    key: z.enum(["changesDeclinedWithReason", "correctionRequested"]),
    values: z.object({ reason: text })
  }),
  z.object({
    key: z.enum(["supplierChangesApproved", "invoiceChangesApproved"]),
    values: z.object({ revision: z.number().int() })
  }),
  z.object({ key: z.literal("packingQueued"), values: z.object({ network: text }) }),
  z.object({ key: z.literal("packingSplit"), values: z.object({ networks: z.array(text) }) }),
  z.object({ key: z.literal("forwarderShipped"), values: z.object({ forwarder: text, tracking: text }) })
])
export type TimelineEvent = z.infer<typeof timelineEventSchema>
export type TimelineEventKey = TimelineEvent["key"]

// The event's columns: its key and values.
export const eventMessage = (event: TimelineEvent) => ({ messageKey: event.key, messageValues: event.values })

// A stored event as a timeline event, or null for one recorded as text before events had keys.
export function storedEvent(row: { messageKey: string | null; messageValues: unknown }): TimelineEvent | null {
  const parsed = timelineEventSchema.safeParse({ key: row.messageKey, values: row.messageValues ?? null })
  return parsed.success ? parsed.data : null
}
