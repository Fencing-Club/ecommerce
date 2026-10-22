import { z } from "zod"

const units = z.record(z.string().min(1), z.number().int().nonnegative().safe())

// The saved contents describe the shipment, not units independently confirmed received.
export function declaredShipmentUnits(saved: { units: unknown; fetchedAt: Date } | undefined) {
  const parsed = units.safeParse(saved?.units)
  const rows = parsed.success
    ? Object.entries(parsed.data)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sku, quantity]) => ({ sku, quantity }))
    : []
  return {
    status: rows.length ? "saved_declared_contents" : "unknown",
    source: "amazon_inbound_shipments",
    fetchedAt: saved?.fetchedAt.toISOString() ?? null,
    unit: "saleable_units",
    rows,
    missingSkuMeaning: "unknown",
    receivedUnitsConfirmed: false,
    caseConversion: null,
    physicalPieces: null
  }
}
