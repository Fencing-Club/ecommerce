import { z } from "zod"

// Receiving requirements belong to the destination; transport requirements belong to the booked service.
// These defaults are suggestions in the form, never evidence that transport has been booked.
export const transportServices = ["parcel", "agl", "freight"] as const
export const transportProfiles = {
  parcel: { carrierLabels: "per_carton", collection: "pickup" },
  agl: { carrierLabels: "none", collection: "pickup" },
  freight: { carrierLabels: "none", collection: "pickup" }
} as const

export const transportSchema = z.object({
  service: z.enum(transportServices),
  handoff: z.enum(["supplier", "forwarder"]),
  collection: z.enum(["pickup", "dropoff"]),
  carrierLabels: z.enum(["per_carton", "none"])
})
export type ShipmentTransport = z.infer<typeof transportSchema>

export function shipmentLabelRequirements(destination: string, transport?: ShipmentTransport | null) {
  return {
    amazonCartonLabels: destination === "amazon",
    needsTransport: destination === "amazon" && !transport,
    carrierLabels: transport?.carrierLabels === "per_carton"
  }
}

// English copy for generated documents. The UI uses translated labels for the same values.
export function transportInstructions(transport?: ShipmentTransport | null): string[] {
  if (!transport) {
    return ["Transport arrangement not confirmed. Confirm handoff instructions before dispatch."]
  }
  const service = { parcel: "Parcel carrier", agl: "Amazon Global Logistics (AGL)", freight: "Freight carrier" }[
    transport.service
  ]
  const location = transport.handoff === "supplier" ? "supplier" : "freight forwarder"
  return [
    `${service}: ${transport.collection === "pickup" ? `pickup from the ${location}` : `the ${location} delivers to the carrier`}.`,
    transport.carrierLabels === "per_carton"
      ? "Apply one assigned carrier label to each carton, in addition to its receiving label."
      : "No separate carrier label per carton for this transport arrangement."
  ]
}
