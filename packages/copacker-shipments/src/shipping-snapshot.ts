import { type OrderInput } from "@repo/copacker-orders"
import { packingTasks, type ProductTask } from "@repo/copacker-orders/packing-requirements"
import { validatePacking } from "@repo/copacker-packing-rules"
import { addressLines } from "./documents"
import { palletLabels, type Packing, type Pallet, orderDestination } from "./index"
import type { CartonLabel } from "./labels"
import {
  documentIssues,
  packingRecordIssues,
  type DocumentParty,
  type ShippingCarton,
  type ShippingDocumentData,
  type ShippingProduct
} from "./shipping-model"
import { shipmentLabelRequirements, type ShipmentTransport } from "./transport"

type Item = OrderInput["items"][number]

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
  // The supplier hands its cartons to the carrier itself, by parcel, AGL or freight. A forwarder's handoff is the
  // forwarder's own leg, with its own packet.
  if (transport.handoff !== "supplier") {
    throw new Error("Prepare the forwarder's handoff separately before exporting")
  }
  const items = packedItems(order, packing)
  const networks = new Set(items.map((item) => item.receiver))
  if (orderDestination(order) === "amazon" && networks.size !== 1) {
    throw new Error("Export one Amazon network at a time")
  }
  const requirements = shipmentLabelRequirements(orderDestination(order), transport)
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
  const network = packedNetwork(order, items)
  // Amazon labels pallets for FBA only; AWD takes its cartons as cases.
  const placed = network === "fba" ? palletLabels(packing.pallets ?? [], labels) : []
  const data: ShippingDocumentData = {
    company: input.company,
    order: order.reference,
    revision: input.revision,
    generatedDate: input.generatedDate,
    shipment: input.shipmentId,
    recipient: { name: input.supplier, address: [] },
    origin: originParty(input.supplier, packing.origin),
    destination: input.destination,
    network,
    transport: {
      service: transport.service,
      collection: transport.collection,
      carrierLabels: requirements.carrierLabels,
      palletized: Boolean(packing.palletized)
    },
    // Each FBA pallet's label, once Amazon has labelled its cartons: its Amazon shipment and its number there, as Amazon
    // prints it, such as FBA18ABCD123 1/2.
    ...(packing.palletized && {
      pallets: (packing.pallets ?? []).map((pallet) => {
        const label = placed.find((row) => row.palletId === pallet.palletId)
        return {
          ...documentPallet(pallet),
          ...(label && { label: `${label.amazonShipmentId} ${label.number}/${label.count}` })
        }
      })
    }),
    products: items.map((item) => {
      if (!item.packingRequirements) {
        throw new Error(`Confirm packing requirements for ${item.supplierSku || item.name}`)
      }
      return documentProduct(item, packingTasks(item.packingRequirements), item.supplierSku)
    }),
    cartons: documentCartons(packing, items).map((carton) => ({
      ...carton,
      amazonLabel: labels.find((label) => label.cartonId === carton.id)?.labelNumber,
      carrierLabel: input.carrierLabels?.find((label) => label.cartonId === carton.id)?.labelNumber
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

// The packing list alone, from finished packing before the packet exists: the cartons as packed, and their pallets,
// without the label assignments, destination address and handoff only the packet needs. A line without a supplier SKU
// of its own is listed by the buyer's, as the packing page shows it.
export function packingListSnapshot(input: {
  order: OrderInput
  packing: Packing
  transport: ShipmentTransport | null
  company: string
  supplier: string
  destination: string
  revision: number
  shipmentId: string
  generatedDate: string
}): ShippingDocumentData {
  const { order, packing, transport } = input
  const items = packedItems(order, packing)
  const data: ShippingDocumentData = {
    company: input.company,
    order: order.reference,
    revision: input.revision,
    generatedDate: input.generatedDate,
    shipment: input.shipmentId,
    recipient: { name: input.supplier, address: [] },
    origin: originParty(input.supplier, packing.origin),
    destination: { name: input.destination, address: [] },
    network: packedNetwork(order, items),
    transport: {
      service: transport?.service ?? "supplier",
      collection: transport?.collection ?? "delivery",
      carrierLabels: shipmentLabelRequirements(orderDestination(order), transport).carrierLabels,
      palletized: Boolean(packing.palletized)
    },
    ...(packing.palletized && { pallets: (packing.pallets ?? []).map(documentPallet) }),
    products: items.map((item) =>
      documentProduct(
        item,
        item.packingRequirements ? packingTasks(item.packingRequirements) : [],
        item.supplierSku || item.buyerSku
      )
    ),
    cartons: documentCartons(packing, items),
    instructions: ""
  }
  const issues = packingRecordIssues(data)
  if (issues.length) {
    throw new IncompletePackingList(issues.map((issue) => `${issue.code}: ${issue.carton}`))
  }
  return data
}

// Packing that can't make a packing list yet, as opposed to a failure in building one.
export class IncompletePackingList extends Error {
  constructor(readonly codes: string[]) {
    super(`Incomplete packing list: ${codes.join(", ")}`)
  }
}

// The PO's lines that some carton holds.
function packedItems(order: OrderInput, packing: Packing) {
  const included = new Set(packing.cartons.flatMap((carton) => carton.items.map((item) => item.itemId)))
  return order.items.filter((item) => included.has(item.id))
}

// A pallet as the documents list it: its cartons, dimensions, gross weight and whether it stacks.
function documentPallet(pallet: Pallet) {
  return {
    id: pallet.palletId,
    cartons: pallet.cartonIds,
    dimensions: [pallet.length, pallet.width, pallet.height] as [number, number, number],
    weight: pallet.weight,
    stackable: pallet.stackable
  }
}

function packedNetwork(order: OrderInput, items: Item[]): ShippingDocumentData["network"] {
  if (orderDestination(order) !== "amazon") {
    return "warehouse"
  }
  return items[0]?.receiver === "awd_us" ? "awd" : "fba"
}

function originParty(supplier: string, origin: Packing["origin"]): DocumentParty {
  return {
    name: supplier,
    address: [
      ...addressLines(origin),
      [origin.name, origin.phoneNumber].filter(Boolean).join(", "),
      origin.email
    ].filter(Boolean)
  }
}

function documentProduct(item: Item, tasks: ProductTask[], supplierSku: string): ShippingProduct {
  return {
    id: item.id,
    supplierSku,
    description: item.name,
    variant: item.variant === "Default Title" ? undefined : item.variant,
    piecesPerPack: item.piecesPerSet,
    tasks,
    countryCode: item.packingRequirements?.countryCode || undefined
  }
}

function documentCartons(packing: Packing, items: Item[]): ShippingCarton[] {
  return packing.cartons.map((carton) => ({
    id: carton.cartonId,
    dimensions: [carton.length, carton.width, carton.height],
    weight: carton.weight,
    contents: carton.items.map((content) => ({
      productId: content.itemId,
      packs: content.pieces / items.find((item) => item.id === content.itemId)!.piecesPerSet
    }))
  }))
}
