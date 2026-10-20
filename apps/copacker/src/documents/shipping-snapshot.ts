import { palletLabels, validatePacking, type OrderInput, type Packing } from "@repo/aisle"
import type { CartonLabel } from "@repo/aisle/labels"
import { packingTasks } from "@repo/aisle/packing-requirements"
import { shipmentLabelRequirements, type ShipmentTransport } from "@repo/aisle/transport"
import { documentIssues, type DocumentParty, type ShippingDocumentData } from "./shipping-model"

// An adapter from an accepted PO and its physical cartons. Addresses and label assignments must be supplied
// by their owning integrations; templates never infer them from a company name or carton sequence.
export function shippingDocumentSnapshot(input: {
  order: OrderInput
  packing: Packing
  labels: CartonLabel[]
  carrierLabels?: { cartonId: string; labelNumber: string }[]
  transport: ShipmentTransport
  company: string
  supplier: string
  destination: DocumentParty
  revision: number
  shipmentId: string
  generatedDate: string
}): ShippingDocumentData {
  const { order, packing, transport, labels } = input
  const validation = validatePacking(order, packing)
  if (!validation.valid) {
    throw new Error(`Invalid packing: ${validation.issues.map((issue) => issue.code).join(", ")}`)
  }
  if (order.via) {
    throw new Error("Prepare the supplier and forwarder legs separately before exporting")
  }
  if (transport.handoff !== "supplier" || transport.service === "freight") {
    throw new Error("Confirm the forwarder or freight handoff details before exporting")
  }
  const included = new Set(packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  const items = order.items.filter((item) => included.has(item.id))
  const networks = new Set(items.map((item) => item.amazonNetwork))
  if (order.destination === "amazon" && networks.size !== 1) {
    throw new Error("Export one Amazon network at a time")
  }
  const requirements = shipmentLabelRequirements(order.destination, transport)
  for (const [name, assignments, required] of [
    ["Amazon", labels, requirements.amazonCartonLabels],
    ["Carrier", input.carrierLabels ?? [], requirements.carrierLabels]
  ] as const) {
    if (
      required &&
      (assignments.length !== packing.cartons.length ||
        new Set(assignments.map((label) => label.cartonId)).size !== assignments.length ||
        assignments.some((label) => !packing.cartons.some((carton) => carton.cartonId === label.cartonId)))
    ) {
      throw new Error(`${name} labels must match every carton exactly once`)
    }
  }
  const origin = packing.origin
  const placed = palletLabels(packing.pallets ?? [], labels)
  let network: ShippingDocumentData["network"] = "warehouse"
  if (order.destination === "amazon") {
    network = items[0]?.amazonNetwork === "awd_us" ? "awd" : "fba"
  }
  const data: ShippingDocumentData = {
    company: input.company,
    order: order.reference,
    revision: input.revision,
    generatedDate: input.generatedDate,
    shipment: input.shipmentId,
    recipient: { name: input.supplier, address: [] },
    origin: {
      name: input.supplier,
      address: [
        origin.addressLine1,
        origin.addressLine2,
        `${origin.city}, ${origin.stateOrRegion} ${origin.postalCode}`,
        origin.countryCode,
        [origin.name, origin.phoneNumber].filter(Boolean).join(", "),
        origin.email
      ].filter(Boolean)
    },
    destination: input.destination,
    network,
    transport: {
      service: transport.service,
      collection: transport.collection,
      carrierLabels: requirements.carrierLabels,
      palletized: Boolean(packing.palletized)
    },
    // Each pallet's label, once Amazon has labelled its cartons: its Amazon shipment and its number there, as Amazon
    // prints it, such as FBA18ABCD123 1/2.
    ...(packing.palletized && {
      pallets: (packing.pallets ?? []).map((pallet) => {
        const label = placed.find((row) => row.palletId === pallet.palletId)
        return {
          id: pallet.palletId,
          cartons: pallet.cartonIds,
          dimensions: [pallet.length, pallet.width, pallet.height] as [number, number, number],
          weight: pallet.weight,
          ...(label && { label: `${label.amazonShipmentId} ${label.number}/${label.count}` })
        }
      })
    }),
    products: items.map((item) => {
      if (!item.packingRequirements) {
        throw new Error(`Confirm packing requirements for ${item.supplierSku || item.name}`)
      }
      return {
        id: item.id,
        supplierSku: item.supplierSku,
        description: item.name,
        variant: item.variant === "Default Title" ? undefined : item.variant,
        piecesPerPack: item.piecesPerSet,
        tasks: packingTasks(item.packingRequirements),
        countryCode: item.packingRequirements.countryCode || undefined
      }
    }),
    cartons: packing.cartons.map((carton) => ({
      id: carton.cartonId,
      dimensions: [carton.length, carton.width, carton.height],
      weight: carton.weight,
      contents: carton.items.map((content) => ({
        productId: content.itemId,
        packs: content.pieces / items.find((item) => item.id === content.itemId)!.piecesPerSet
      })),
      amazonLabel: labels.find((label) => label.cartonId === carton.cartonId)?.labelNumber,
      carrierLabel: input.carrierLabels?.find((label) => label.cartonId === carton.cartonId)?.labelNumber
    })),
    instructions: [
      order.notes,
      transport.instructions,
      ...items.flatMap((item) =>
        item.packingRequirements?.instructions ? [`${item.supplierSku}:\n${item.packingRequirements.instructions}`] : []
      )
    ]
      .filter(Boolean)
      .join("\n\n")
  }
  const issues = documentIssues(data)
  if (issues.length) {
    throw new Error(`Incomplete document: ${issues.map((issue) => `${issue.code}: ${issue.carton}`).join(", ")}`)
  }
  return data
}
