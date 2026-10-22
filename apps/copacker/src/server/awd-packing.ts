import type { awdInboundShipmentSchema } from "@repo/copacker-marketplaces/amazon"
import { type OrderInput } from "@repo/copacker-orders"
import { centimetresPerInch, kilogramsPerPound } from "@repo/copacker-packing-rules"
import { buildAwdRequest, type Packing } from "@repo/copacker-shipments"
import type { z } from "zod"
import { LocalizedError } from "@/i18n/errors"

type RemoteShipment = z.infer<typeof awdInboundShipmentSchema>
type Package = RemoteShipment["shipmentContainerQuantities"][number]

// Amazon may return imperial measurements and separate identical carton groups. Compare physical cartons after
// converting units, rounding dimensions to 1 mm and weight to 10 g, and combining identical groups.
function cartonSignature(packages: Package[]) {
  const groups = new Map<string, number>()
  for (const { count, distributionPackage: carton } of packages) {
    const { dimensions, weight } = carton.measurements
    const lengthScales: Record<string, number> = { CENTIMETERS: 1, INCHES: centimetresPerInch }
    const weightScales: Record<string, number> = { KILOGRAMS: 1, POUNDS: kilogramsPerPound }
    const lengthScale = lengthScales[dimensions.unitOfMeasurement]
    const weightScale = weightScales[weight.unitOfMeasurement]
    if (!lengthScale || !weightScale || carton.type !== "CASE") {
      throw new LocalizedError("awdCartonsDiffer")
    }
    const key = JSON.stringify({
      products: carton.contents.products.map(({ sku, quantity }) => [sku, quantity]).sort(),
      dimensions: [dimensions.length, dimensions.width, dimensions.height]
        .map((value) => Math.round(value * lengthScale * 10))
        .sort((a, b) => a - b),
      weight: Math.round(weight.weight * weightScale * 100)
    })
    groups.set(key, (groups.get(key) ?? 0) + count)
  }
  return JSON.stringify([...groups].sort(([a], [b]) => a.localeCompare(b)))
}

export function checkLinkedAwd(remote: RemoteShipment, order: OrderInput, packing: Packing) {
  if (remote.shipmentStatus !== "CREATED") {
    throw new LocalizedError("awdShipmentAlreadyShipped")
  }
  const expected = buildAwdRequest(order, packing, "")
  if (cartonSignature(expected.packagesToInbound) !== cartonSignature(remote.shipmentContainerQuantities)) {
    throw new LocalizedError("awdCartonsDiffer")
  }
  const normalized = (value: unknown) =>
    typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase() : ""
  // Contact names and phone formatting may change; the pickup location itself must match.
  for (const field of ["addressLine1", "addressLine2", "postalCode", "countryCode"] as const) {
    if (normalized(expected.originAddress[field]) !== normalized(remote.originAddress[field])) {
      throw new LocalizedError("awdOriginDiffers")
    }
  }
}
