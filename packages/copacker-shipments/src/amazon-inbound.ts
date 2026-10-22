import type {
  Amazon,
  AmazonPrep,
  FbaBox,
  FbaDeliveryWindow,
  FbaPackingOption,
  FbaPlacementOption,
  FbaTransportationOption
} from "@repo/copacker-marketplaces/amazon"
import { type OrderInput } from "@repo/copacker-orders"
import { type AmazonNetwork } from "@repo/copacker-packing-rules"
import { cartonsValue, fbaBoxes, fbaPallets, type Packing } from "./index"

// Amazon inbound shipments: naming and finding them, the choices an FBA inbound plan asks for, and spreading Amazon's
// inbound freight over what each shipment carried. Nothing here reads a database or depends on a web framework.

// Why an FBA inbound plan can't go on. `code` names the reason and `values` fill in its message, so the app can say it
// in the buyer's language.
export class FbaInboundError extends Error {
  constructor(
    readonly code: "amazonPackSeparately" | "amazonPalletSplit" | "amazonNoBox",
    readonly values: Record<string, string> = {}
  ) {
    super(code)
  }
}

// The reference an AWD order is created with, and the name of an FBA inbound plan (at most 40 characters), so one found
// in Amazon can be matched to its shipment revision.
export const amazonReference = (shipmentId: string, revision: number) => `copacker-${shipmentId}-${revision}`
export const fbaPlanName = (shipmentId: string, revision: number) => `cp-${shipmentId.replaceAll("-", "")}-${revision}`

// Each network's page for one of its inbound shipments in Seller Central, which opens on the shipment's events.
export const sellerCentralShipment: Record<AmazonNetwork, (shipmentId: string) => string> = {
  fba: (id) => `https://sellercentral.amazon.com/fba/inbound-shipment/summary/${id}`,
  awd_us: (id) => `https://sellercentral.amazon.com/awd/inbound-shipment/${id}`
}

// What an FBA plan costs: its fees less its discounts, in the plan's currency.
const netFees = (option: Pick<FbaPackingOption, "fees" | "discounts">) =>
  option.fees.reduce((sum, fee) => sum + fee.value.amount, 0) -
  option.discounts.reduce((sum, discount) => sum + discount.value.amount, 0)

// The packing option whose groups keep each carton's products together, with the fewest groups and then the lowest fees,
// and each SKU's group in it. Amazon puts products that must ship separately in different packing groups, and a carton
// can't span two. When no option keeps every carton to one group, the one with the fewest groups and lowest fees comes
// back with `fits` false, so its groups can show the supplier which cartons to repack.
export async function choosePackingOption(
  api: Pick<Amazon, "fbaPackingGroupItems">,
  planId: string,
  options: FbaPackingOption[],
  order: OrderInput,
  packing: Packing
) {
  const offered: Array<{ option: FbaPackingOption; groups: Map<string, string>; fits: boolean }> = []
  for (const option of options.filter((row) => row.status === "OFFERED")) {
    // Each SKU's packing group in this option.
    const groups = new Map<string, string>()
    for (const group of option.packingGroups) {
      for (const item of await api.fbaPackingGroupItems(planId, group)) {
        groups.set(item.msku, group)
      }
    }
    const skus = (carton: Packing["cartons"][number]) =>
      carton.items.map((content) => order.items.find((item) => item.id === content.itemId)!.buyerSku)
    const fits = packing.cartons.every((carton) => new Set(skus(carton).map((sku) => groups.get(sku))).size === 1)
    offered.push({ option, groups, fits })
  }
  const [best] = offered.toSorted(
    (a, b) =>
      Number(b.fits) - Number(a.fits) ||
      a.option.packingGroups.length - b.option.packingGroups.length ||
      netFees(a.option) - netFees(b.option)
  )
  if (!best) {
    throw new FbaInboundError("amazonPackSeparately")
  }
  return best
}

// The placement Amazon offers with the lowest fees, and then the fewest shipments.
export function choosePlacementOption(options: FbaPlacementOption[]) {
  const [best] = options
    .filter((option) => option.status === "OFFERED")
    .toSorted((a, b) => netFees(a) - netFees(b) || a.shipmentIds.length - b.shipmentIds.length)
  return best ?? null
}

// The buyer's own carrier or forwarder takes FBA shipments: as small parcels when Amazon allows it, or as less than a
// truckload when the cartons are on pallets.
export function chooseTransportationOption(options: FbaTransportationOption[], palletized = false) {
  const own = options.filter((option) => option.shippingSolution === "USE_YOUR_OWN_CARRIER")
  const modes = palletized ? ["FREIGHT_LTL", "FREIGHT_FTL_PALLET"] : ["GROUND_SMALL_PARCEL"]
  const preferred = modes.map((mode) => own.find((option) => option.shippingMode === mode)).find(Boolean)
  // Pallets go as freight or not at all: Amazon prints pallet labels only for a confirmed LTL or FTL shipment.
  return preferred ?? (palletized ? null : (own.at(0) ?? null))
}

// What Amazon is told about each shipment's pallets, when the cartons are on pallets: its whole pallets, identical ones
// counted together, and the declared value of its goods, which Amazon needs to quote freight. A pallet whose cartons
// Amazon sends to two warehouses can't be booked.
export function palletConfiguration(
  order: OrderInput,
  packing: Packing,
  cartons: Array<{ cartonId: string; shipmentId: string }>,
  shipmentId: string
) {
  if (!packing.palletized) {
    return {}
  }
  const ids = new Set(cartons.filter((carton) => carton.shipmentId === shipmentId).map((carton) => carton.cartonId))
  const { pallets, split } = fbaPallets(packing, ids)
  if (split.length) {
    throw new FbaInboundError("amazonPalletSplit", { pallets: split.join(", ") })
  }
  const value = cartonsValue(
    order,
    packing.cartons.filter((carton) => ids.has(carton.cartonId))
  )
  return {
    pallets,
    freightInformation: { declaredValue: { amount: value / 100, code: order.currency }, freightClass: "NONE" }
  }
}

// The week the cartons are expected at Amazon: the first delivery window starting once they're ready, or the latest
// Amazon offers when all start sooner. The buyer can move it in Seller Central until the shipment closes.
export function chooseDeliveryWindow(options: FbaDeliveryWindow[], readyDate: string) {
  const open = options
    .filter((option) => option.availabilityType === "AVAILABLE")
    .toSorted((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate))
  return open.find((option) => option.startDate.slice(0, 10) >= readyDate) ?? open.at(-1) ?? null
}

// Matches each supplier carton to one of Amazon's boxes by its contents, then by size and weight, so each carton gets
// its own box label. Cartons packed the same way can take any of their boxes.
export function matchBoxes(
  order: OrderInput,
  packing: Packing,
  prep: ReadonlyMap<string, AmazonPrep>,
  boxes: Array<{ box: FbaBox; shipmentId: string }>
) {
  const contents = (items: Array<{ msku: string; quantity: number }>) =>
    JSON.stringify(items.map((item) => [item.msku, item.quantity]).toSorted())
  const size = (values: number[]) => JSON.stringify(values.map((value) => Math.round(value * 10) / 10))
  const remaining = [...boxes]
  return fbaBoxes(order, packing, prep).map(({ cartonId, box }) => {
    const wanted = contents(box.items)
    const dims = size([box.dimensions.length, box.dimensions.width, box.dimensions.height, box.weight.value])
    const candidates = remaining.filter((row) => row.box.boxId && contents(row.box.items ?? []) === wanted)
    const exact = candidates.find(
      (row) =>
        row.box.dimensions &&
        row.box.weight &&
        size([row.box.dimensions.length, row.box.dimensions.width, row.box.dimensions.height, row.box.weight.value]) ===
          dims
    )
    const match = exact ?? candidates[0]
    if (!match) {
      throw new FbaInboundError("amazonNoBox", { carton: cartonId })
    }
    remaining.splice(remaining.indexOf(match), 1)
    return { cartonId, boxId: match.box.boxId!, shipmentId: match.shipmentId }
  })
}

// The ID Amazon gives an AWD inbound shipment, such as STAR-ABC123, and an FBA inbound plan, such as
// wf0a1b2c3d-0000-4000-8000-0123456789ab.
export const awdShipmentIdPattern = /^STAR-[A-Z0-9]+$/
export const fbaInboundPlanIdPattern = /^wf[0-9a-f-]{36}$/

// The inbound shipment a freight charge names: an FBA shipment (FBA15ABC12) or an AWD shipment (STAR-ABC123, sometimes
// with a date before it). Transfers from AWD to FBA (repl-...) and other references name no inbound shipment.
export function freightShipment(reference: string | null) {
  const fba = reference?.match(/^FBA[0-9A-Z]{6,}$/)
  if (fba) {
    return { network: "fba" as const, shipmentId: fba[0] }
  }
  const awd = reference?.match(/(?:^|_)(STAR-[0-9A-Z]+)$/)
  return awd ? { network: "awd" as const, shipmentId: awd[1]! } : null
}

export type FreightCharge = { reference: string | null; freightMinor: number }

// Spreads freight over the SKUs of the shipments it was charged for, as a cost per unit shipped: each shipment's
// freight is shared by its units. Freight for a shipment whose contents aren't known, or naming no inbound shipment
// (such as transfers from AWD to FBA), is returned as `unallocatedMinor`, to spread over every unit sold instead.
export function freightPerSku(
  charges: readonly FreightCharge[],
  shipments: ReadonlyMap<string, Readonly<Record<string, number>> | null>
) {
  const freight = new Map<string, number>(),
    shipped = new Map<string, number>()
  let unallocated = 0
  const byShipment = new Map<string, number>()
  for (const charge of charges) {
    const shipment = freightShipment(charge.reference)
    const units = shipment ? shipments.get(shipment.shipmentId) : null
    const total = units ? Object.values(units).reduce((sum, count) => sum + count, 0) : 0
    if (shipment && total > 0) {
      byShipment.set(shipment.shipmentId, (byShipment.get(shipment.shipmentId) ?? 0) + charge.freightMinor)
    } else {
      unallocated += charge.freightMinor
    }
  }
  for (const [shipmentId, charged] of byShipment) {
    const units = shipments.get(shipmentId)!
    const total = Object.values(units).reduce((sum, count) => sum + count, 0)
    for (const [sku, count] of Object.entries(units)) {
      freight.set(sku, (freight.get(sku) ?? 0) + (charged * count) / total)
      shipped.set(sku, (shipped.get(sku) ?? 0) + count)
    }
  }
  const perUnit = new Map<string, number>()
  for (const [sku, amount] of freight) {
    const count = shipped.get(sku) ?? 0
    if (count > 0 && amount !== 0) {
      perUnit.set(sku, amount / count)
    }
  }
  return { perUnit, unallocatedMinor: unallocated }
}
