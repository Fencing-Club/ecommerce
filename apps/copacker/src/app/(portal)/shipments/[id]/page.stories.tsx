import { type Address, type OrderInput, type OrderItem } from "@repo/copacker-orders"
import { type AmazonNetwork, orderDestination } from "@repo/copacker-packing-rules"
import { shippingSettingsKey } from "@repo/copacker-shipments/shipping-model"
import { packingListSnapshot } from "@repo/copacker-shipments/shipping-snapshot"
import { canEditPacking, canReopenPacking, releasedStates } from "@repo/copacker-shipments/states"
import { http, HttpResponse } from "msw/http"
import { PDFDocument } from "pdf-lib"
import { expect, mocked, screen, spyOn, userEvent, waitFor, within } from "storybook/test"
import invariant from "tiny-invariant"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import type { PartnerAddress } from "@/components/partner-address"
import { startingAddress } from "@/components/shipment-packing-details"
import type { ShipmentPlaces } from "@/hooks/use-shipment-route"
import { can, type Permissions } from "@/lib/access"
import { printableLabels } from "@/lib/printable-labels"
import { releasedLabelKinds } from "@/lib/shipment-states"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import { unpricedDraft, unpricedOrder } from "@/server/prices"
import { knownPackingGroups } from "@/server/readiness"
import { type ActionRequest, recordActions } from "@/stories/actions"
import {
  buyerContacts,
  documentRow,
  type DocumentRow,
  orderRecords,
  packingFor,
  partnerAddresses,
  shipmentId,
  shipmentRow,
  type ShipmentRow,
  supplierRecordId
} from "@/stories/fixtures/logistics"
import { daysAgo } from "@/stories/fixtures/orders"
import { bagOrder, bagPacking, towelOrder, towelPacking, towelPackingDraft } from "@/stories/fixtures/packing"
import { northwindFactory, baylineWarehouse } from "@/stories/fixtures/parties"
import { closeMenu, shownDialog } from "@/stories/play"
import { portalPage, serverStory } from "@/stories/server"
import { member, owner } from "@/stories/workspace"
import { shipmentDestinations, shipmentNetwork } from "../destination"
import ShipmentPageView from "./page"

// The shipment's step as orderWorkflow reports it: what happens next, what its packet lacks, and its packet once the
// labels are with the supplier.
type Step = {
  next: { step: string; message: string }
  issues: Array<{ code: string; message: string }>
  packetUrl: string | null
}

type Args = {
  kind: "buyer" | "supplier"
  permissions: Permissions
  shipment: ShipmentRow
  order: { id: string; data: OrderInput; revision: number }
  // The supplier, and its workspace once it has joined Copacker.
  supplier: { id: string; name: string; supplierOrgId: string | null }
  step: Step
  // Its place among the purchase order's shipments, oldest first.
  number: number
  // Pieces of each line other shipments already hold.
  reserved: Record<string, number>
  // The purchase order's other shipments, whose packing groups an FBA draft is checked against (knownPackingGroups).
  others?: ShipmentRow[]
  docs: DocumentRow[]
  // The supplier's pickup addresses.
  addresses: PartnerAddress[]
  // Whether the supplier's changes to the purchase order are waiting on the buyer.
  awaitingChanges: boolean
  // Each packed line's SKU and FNSKU labels, as lineLabels reads them; by default every barcode label its packing
  // details ask for is made from the standard template.
  lineLabels?: Array<{
    itemId: string
    type: "sku" | "fnsku"
    state: "uploaded" | "standard" | "missing"
    problem?: string
  }>
}

// The Amazon warehouses the stories' Amazon shipments go to, as Amazon gives their addresses: FBA's ONT8, where the
// carton labels send the cartons, and an AWD warehouse.
const amazonWarehouses: Record<AmazonNetwork, Address> = {
  fba: {
    name: "Amazon ONT8",
    phoneNumber: "",
    email: "",
    addressLine1: "100 Warehouse Road",
    addressLine2: "",
    city: "Moreno Valley",
    stateOrRegion: "CA",
    postalCode: "92551",
    countryCode: "US"
  },
  awd_us: {
    name: "Amazon IUSP",
    phoneNumber: "",
    email: "",
    addressLine1: "200 Distribution Road",
    addressLine2: "",
    city: "Hesperia",
    stateOrRegion: "CA",
    postalCode: "92344",
    countryCode: "US"
  }
}

// Where the shipment ends up, as shipmentPlaces reads it: the buyer's warehouse, or the Amazon warehouse once Amazon has
// the shipment. Amazon gives an FBA shipment's warehouse only once its inbound plan's shipments are confirmed.
function finalAddresses(data: OrderInput, shipment: ShipmentRow): Address[] {
  if (orderDestination(data) === "warehouse") {
    const places = buyerContacts.filter((contact) => contact.id === data.deliveryId)
    return places.map((place) => ({ ...place.address, name: place.name }))
  }
  const network = shipment.amazonNetwork
  const booked = shipment.amazonShipmentId ?? shipment.linkedAmazonShipmentId
  return booked && (network === "awd_us" || (network === "fba" && shipment.amazonOrderId))
    ? [amazonWarehouses[network]]
    : []
}

// Where the shipment's goods stop, as shipmentPlaces reads them: the pickup address, Bayline Freight's Ningbo warehouse
// when the PO goes by way of it, AGL when it books the transport, and where the goods end up.
function places(
  order: OrderInput,
  shipment: ShipmentRow,
  supplier: string,
  addresses: PartnerAddress[]
): ShipmentPlaces {
  const data = shipment.snapshot ?? order
  const origin = (shipment.packing ?? shipment.packingDraft)?.origin
  const start = startingAddress(addresses, origin)
  const warehouse = orderDestination(data) === "warehouse"
  return {
    supplier,
    pickup: start ? { name: start.name, address: start.address } : origin && { address: origin },
    forwarder: data.via
      ? { company: "Bayline Freight", place: { name: "Ningbo warehouse", address: baylineWarehouse } }
      : undefined,
    agl: shipment.transport?.service === "agl",
    destination: {
      company: warehouse ? "Harbor Goods" : "Amazon",
      receiver: warehouse ? "warehouse" : shipmentNetwork(data, shipment.amazonNetwork),
      addresses: finalAddresses(data, shipment)
    }
  }
}

// A shipment's page (page.tsx) with what the database and the workflow would return.
async function ShipmentPage({
  kind,
  permissions: s,
  shipment,
  order,
  supplier,
  step,
  number,
  reserved,
  others = [],
  docs,
  addresses,
  awaitingChanges,
  lineLabels
}: Args) {
  const t = await translateStory("shipments.detail")
  const editsShipments = can(s, "shipments", "edit")
  const seesOrder = can(s, "orders")
  const prices = can(s, "prices")
  const id = shipment.id
  const packingOrder = shipment.amazonNetwork
    ? { ...order.data, items: order.data.items.filter((item) => item.receiver === shipment.amazonNetwork) }
    : order.data
  const packingGroups =
    orderDestination(order.data) === "amazon" && packingOrder.items.some((item) => item.receiver === "fba")
      ? (knownPackingGroups([...others, shipment], shipment) ?? null)
      : undefined
  const snapshot = shipment.snapshot ?? order.data
  const editable = editsShipments && canEditPacking(shipment) && !awaitingChanges
  const canReopen = editsShipments && canReopenPacking(shipment)
  const isBuyer = kind === "buyer"
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) =>
      (isBuyer || releasedStates.includes(shipment.status) || !releasedLabelKinds.includes(d.kind)) &&
      !["invoice", "packing_list", "checklist"].includes(d.kind)
  )
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const fba = shipment.amazonNetwork === "fba"
  const enteringFor = isBuyer && !supplier.supplierOrgId ? supplier.name : undefined
  const amazon = orderDestination(order.data) === "amazon"
  const title = t("title", { number })
  const destination = await shipmentDestinations([order.data])
  const nextStep = isBuyer && step.next.step === "cancellation" ? step.next.message : undefined
  return (
    <ShipmentPageView
      page={{
        id,
        lineLabels: packingOrder.items.map((item) => {
          const given = lineLabels?.filter((row) => row.itemId === item.id) ?? []
          return {
            itemId: item.id,
            labels: printableLabels(
              item,
              given.length
                ? given
                : (item.packingRequirements?.labels ?? [item.fnsku ? "fnsku" : "sku"]).flatMap((type) =>
                    type === "sku" || type === "fnsku" ? [{ type, state: "standard" as const }] : []
                  )
            )
          }
        }),
        route: places(order.data, shipment, supplier.name, addresses),
        buyer: "Harbor Goods",
        destinationName: destination(order.data, shipment.amazonNetwork),
        editsShipments,
        seesOrder,
        prices,
        editsPartners: can(s, "partners", "edit"),
        order: { id: order.id, revision: order.revision, data: prices ? order.data : unpricedOrder(order.data) },
        packingOrder: prices ? packingOrder : unpricedOrder(packingOrder),
        supplier: { id: supplier.id, name: supplier.name },
        shipment: {
          amazonNetwork: shipment.amazonNetwork,
          transport: shipment.transport,
          operation: shipment.operation,
          linkedAmazonShipmentId: shipment.linkedAmazonShipmentId,
          status: shipment.status,
          revision: shipment.revision,
          issue: shipment.issue,
          packing: shipment.packing
            ? {
                ...shipment.packing,
                changes: shipment.packing.changes.map((change) => ({
                  ...change,
                  unitPrice: prices ? change.unitPrice : 0
                }))
              }
            : null,
          packingDraft: prices ? shipment.packingDraft : unpricedDraft(shipment.packingDraft),
          labels: shipment.labels.map((label) => ({ cartonId: label.cartonId, labelNumber: label.labelNumber }))
        },
        step: { next: step.next, issues: step.issues, packetUrl: step.packetUrl },
        carrierLabels: isBuyer
          ? docs.flatMap((doc) =>
              doc.kind === "shipping_label" && doc.cartonId
                ? [
                    {
                      cartonId: doc.cartonId,
                      documentId: doc.id,
                      trackingNumber: doc.trackingNumber,
                      sourceName: doc.sourceName,
                      sourcePage: doc.sourcePage
                    }
                  ]
                : []
            )
          : [],
        reserved,
        packingGroups,
        snapshot: prices ? snapshot : unpricedOrder(snapshot),
        addresses: addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address })),
        awaitingChanges,
        editable,
        canReopenPacking: canReopen,
        isBuyer,
        amazonLinks,
        visibleDocs: visibleDocs.map((doc) => ({ id: doc.id, name: doc.name, kind: doc.kind, cartonId: doc.cartonId })),
        changes: changes
          .filter(({ item, change }) => prices || change.supplierSku !== item.supplierSku)
          .map(({ item, change }) => ({
            item: {
              name: item.name,
              variant: item.variant,
              supplierSku: item.supplierSku,
              unitPrice: prices ? item.unitPrice : 0
            },
            change: { itemId: change.itemId, supplierSku: change.supplierSku, unitPrice: prices ? change.unitPrice : 0 }
          })),
        fba,
        enteringFor,
        amazon,
        title,
        amazonIds,
        nextStep
      }}
    />
  )
}

function step(next: string, message: string, changes: Partial<Step> = {}): Step {
  return { next: { step: next, message }, issues: [], packetUrl: null, ...changes }
}

const warehouse = orderRecords.warehouse
const amazonOrder = orderRecords.amazon
// The same purchase order sent to Amazon AWD US.
const awdOrder = {
  ...amazonOrder,
  data: {
    ...amazonOrder.data,
    items: amazonOrder.data.items.map((item) => ({ ...item, receiver: "awd_us" as const }))
  }
}
const [firstLine, secondLine] = warehouse.data.items
const packet = `/shipments/${shipmentId}/packet`
const invoice = documentRow("invoice", "Lotus invoice 2291.pdf")
const packingList = documentRow("packing_list", "Packing list.pdf")
const shippingLabel = documentRow("shipping_label", "Carrier label - C1.pdf", {
  cartonId: "C1",
  trackingNumber: "1Z4F7E210393821041",
  sourceName: "ups-labels.pdf",
  sourcePage: 1
})
const cartonLabel = documentRow("carton_label", "Carton label.pdf", { cartonId: "C1" })
const palletLabel = documentRow("pallet_label", "Pallet labels.pdf")
// The FBA inbound plan and the Amazon shipment its cartons travel in, with a label for each carton.
const fbaPlanId = "wf0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d"
const labels = [
  { cartonId: "C1", labelNumber: "FBA18ABCD123U000001", destinationCode: "ONT8", amazonShipmentId: "FBA18ABCD123" },
  { cartonId: "C2", labelNumber: "FBA18ABCD123U000002", destinationCode: "ONT8", amazonShipmentId: "FBA18ABCD123" }
]
// An AWD order's carton labels, as Amazon numbers them.
const awdLabels = [
  { cartonId: "C1", labelNumber: "201952611540373988", destinationCode: "IUSP", amazonShipmentId: "STAR-8KQ2M7-1" },
  { cartonId: "C2", labelNumber: "201952611540373989", destinationCode: "IUSP", amazonShipmentId: "STAR-8KQ2M7-1" }
]

const sent: ActionRequest[] = []
const buyer = portalPage("/shipments")
const supplier = portalPage("/shipments", "supplier")
// Someone who packs and follows shipments without prices, and can't open purchase orders.
const packer: Permissions = { role: "member", access: { shipments: "edit" } }

const meta = preview.meta({
  title: "Pages/Shipments/Detail",
  ...serverStory(ShipmentPage),
  args: {
    kind: "buyer",
    permissions: owner,
    shipment: shipmentRow({ status: "ready", packing: packingFor(warehouse.data) }),
    order: warehouse,
    supplier: { id: supplierRecordId, name: "Lotus Manufacturing", supplierOrgId: "org_supplier" },
    step: step("ship", "Print the packet, pack the cartons, and mark them shipped", { packetUrl: packet }),
    number: 2,
    reserved: {},
    docs: [invoice, packingList, cartonLabel],
    addresses: [partnerAddresses.factory],
    awaitingChanges: false
  } satisfies Args,
  parameters: { db: { contacts: buyerContacts.map(({ id, name }) => ({ id, name })) } },
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent))
  }
})

// The supplier packs: the packing form, since nothing is packed yet.
export const PackingSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    shipment: shipmentRow({ status: "packing" }),
    step: step("packing", "Complete the packing list"),
    number: 1,
    docs: []
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Shipment 1/ })).toBeVisible()
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" })
    await expect(within(breadcrumb).getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByText(/^Portland warehouse, /)).toBeVisible()
    await expect(canvas.getAllByText("Packing").length).toBeGreaterThan(0)
    // The packing form replaces the cartons and documents.
    await expect(canvas.queryByText("No documents yet")).toBeNull()
  }
})

// Board 06.05: the supplier's draft of an AWD shipment by way of a forwarder, with one carton group still missing its
// weight and 36 units left to pack.
export const DraftPacking = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: { id: orderRecords.amazon.id, data: towelOrder, revision: 1 },
    supplier: { id: supplierRecordId, name: "Northwind Textiles", supplierOrgId: "org_supplier" },
    shipment: shipmentRow({
      status: "packing",
      amazonNetwork: "awd_us",
      packingDraft: towelPackingDraft(),
      transport: { service: "agl", handoff: "forwarder", collection: "pickup", carrierLabels: "none", instructions: "" }
    }),
    step: step("packing", "Complete the packing list"),
    number: 1,
    docs: [],
    addresses: [
      { id: partnerAddresses.factory.id, name: "Northwind Textiles / Main factory", address: northwindFactory }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Shipment 1" })).toBeVisible()
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" })
    await expect(within(breadcrumb).getByText("Shipment 1")).toBeVisible()
    // The actions sit beside the title; nothing sticks to the bottom of the page.
    await expect(canvas.getByRole("button", { name: "Save draft" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /View order/ })).toBeNull()
    await expect(canvas.queryByText("18 cartons, 504 units")).toBeNull()
    // The route, then how the cartons travel, inside the shipment card.
    await expect(canvas.getAllByText("Bayline Freight").length).toBeGreaterThan(0)
    await expect(canvas.getByText("Amazon AWD US")).toBeVisible()
    await expect(canvas.getByText("Supplier ships to Bayline Freight.")).toBeVisible()
    await expect(canvas.getByText("Amazon pickup from Bayline Freight.")).toBeVisible()
    await expect(canvas.queryByRole("heading", { name: "Transport" })).toBeNull()
    // The sidebar sums up the cartons.
    const summary = canvas.getByRole("region", { name: "Shipment details" })
    await expect(within(summary).getByText("Oct 20, 2026")).toBeVisible()
    await expect(within(summary).getByText("18")).toBeVisible()
    await expect(within(summary).getAllByText("—")).toHaveLength(2)
    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await expect(within(cartons).getByText("504 of 540 units")).toBeVisible()
    await expect(within(cartons).getByRole("button", { name: "Add carton" })).toHaveTextContent("Add carton")
    // Complete rows stay closed; B1–B6, still to be weighed, opens with its error under the row.
    await expect(canvas.getByRole("button", { name: "Products in A1–A10" })).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.getByRole("button", { name: "Products in B1–B6" })).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByRole("button", { name: "Add products to cartons B1–B6" })).toBeVisible()
    await expect(canvas.getByText("Enter the weight of each carton.")).toBeVisible()
    await expect(canvas.getByRole("spinbutton", { name: "Carton B1: Weight (kg)" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )

    // The documents beside the cartons start with the label types the packing details ask for.
    const documents = canvas.getByRole("region", { name: "Documents" })
    const summaryTop = summary.offsetTop
    await userEvent.click(within(documents).getByRole("button", { name: "Product labels" }))
    const menu = within(await screen.findByRole("menu"))
    // Opening the menu leaves the shipment details where they were.
    await expect(summary.offsetTop).toBe(summaryTop)
    await expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "SKU labels",
      "FNSKU labels",
      "Suffocation warning labels",
      "Download all product labels"
    ])
    await expect(menu.getByRole("menuitem", { name: "SKU labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?kind=sku`
    )
    await expect(menu.getByRole("menuitem", { name: "FNSKU labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?kind=fnsku`
    )
    await expect(menu.getByRole("menuitem", { name: "Suffocation warning labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?kind=suffocation`
    )
    await expect(menu.getByRole("menuitem", { name: "Download all product labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels`
    )
    await closeMenu()

    // Each product's row prints just its own labels.
    const [towel, , teaTowel] = towelOrder.items
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    // The products show the supplier's SKU, not the buyer's, and what's left to pack.
    const products = within(await canvas.findByRole("table"))
    await expect(products.getByText("NT-WB-2214")).toBeVisible()
    await expect(products.queryByText("WB-2214")).toBeNull()
    await expect(products.getByText("144 of 180")).toBeVisible()
    await expect(products.getByText("36 left")).toBeVisible()
    await userEvent.click(await canvas.findByRole("button", { name: "Labels for NT-WB-2210" }))
    const towelMenu = within(await screen.findByRole("menu"))
    await expect(towelMenu.getByRole("menuitem", { name: "FNSKU labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?item=${towel!.id}&kind=fnsku`
    )
    await expect(towelMenu.queryByRole("menuitem", { name: "SKU labels" })).toBeNull()
    await expect(towelMenu.getByRole("menuitem", { name: "Download all product labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?item=${towel!.id}`
    )
    await closeMenu()
    // Copacker doesn't make choking hazard labels, so the buyer provides them.
    await userEvent.click(canvas.getByRole("button", { name: "Labels for NT-CT-3100" }))
    const teaTowelMenu = within(await screen.findByRole("menu"))
    await expect(teaTowelMenu.getByRole("menuitem", { name: "SKU labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?item=${teaTowel!.id}&kind=sku`
    )
    await expect(teaTowelMenu.getByRole("menuitem", { name: /Choking hazard labels/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    // The menu shows from the frame after it opens.
    await waitFor(() => expect(teaTowelMenu.getByText("Label not provided")).toBeVisible())
    await closeMenu()
  }
})

// Board 06.06: the same draft on a phone. The route's stops sit one under another, the carton actions keep only their
// icons, and the cartons and units sit above the Save draft button, with the documents and details below.
export const DraftPackingOnAPhone = meta.story({
  ...supplier,
  args: DraftPacking.input.args,
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    const stops = [
      canvas.getByRole("combobox", { name: "Ship from" }),
      canvas.getByText("Bayline Freight"),
      canvas.getByText("Amazon AWD US")
    ].map((stop) => stop.getBoundingClientRect())
    await expect(stops.map((stop) => stop.left)).toEqual(Array(3).fill(stops[0]!.left))
    await expect(stops[1]!.top).toBeGreaterThan(stops[0]!.bottom)
    await expect(stops[2]!.top).toBeGreaterThan(stops[1]!.bottom)

    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await expect(within(cartons).queryByText("504 of 540 units")).not.toBeVisible()
    const add = within(cartons).getByRole("button", { name: "Add carton" })
    await expect(add.getBoundingClientRect().width).toBe(add.getBoundingClientRect().height)
    await expect(within(cartons).getByRole("button", { name: "Import cartons" })).toBeVisible()

    // One Save draft, below the cartons, with the counts above it.
    const save = canvas.getByRole("button", { name: "Save draft" })
    const count = canvas.getByText("18 cartons")
    await expect(count).toBeVisible()
    await expect(count.getBoundingClientRect().bottom).toBeLessThanOrEqual(save.getBoundingClientRect().top)
    await expect(cartons.getBoundingClientRect().bottom).toBeLessThan(count.getBoundingClientRect().top)
    const documents = canvas.getByRole("region", { name: "Documents" })
    await expect(documents.getBoundingClientRect().top).toBeGreaterThan(save.getBoundingClientRect().bottom)
  }
})

// Board 06.07: every unit is packed and every carton weighed, so the supplier can finish packing.
export const ReadyToFinishPacking = meta.story({
  ...supplier,
  args: {
    ...DraftPacking.input.args,
    shipment: shipmentRow({
      status: "packing",
      amazonNetwork: "awd_us",
      packingDraft: towelPacking(),
      transport: { service: "agl", handoff: "forwarder", collection: "pickup", carrierLabels: "none", instructions: "" }
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await expect(within(cartons).getByText("540 of 540 units")).toBeVisible()
    const summary = canvas.getByRole("region", { name: "Shipment details" })
    await expect(within(summary).getByText("230.8 kg")).toBeVisible()
    await expect(within(summary).getByText("1.79 m³")).toBeVisible()
  }
})

// Board 06.08: the supplier finished packing, and the buyer prepares the Amazon shipment next.
export const Packed = meta.story({
  ...supplier,
  args: {
    ...DraftPacking.input.args,
    shipment: shipmentRow({
      status: "packed",
      amazonNetwork: "awd_us",
      packing: towelPacking(),
      transport: { service: "agl", handoff: "forwarder", collection: "pickup", carrierLabels: "none", instructions: "" }
    }),
    step: step(
      "prepareAmazon",
      "Packing is complete. The buyer can now prepare the Amazon shipment and retrieve its labels."
    )
  },
  beforeEach: ({ msw }) => {
    // The packing list as the server sends it for these cartons; the browser renders and saves the PDF.
    msw.use(
      http.get(`/api/shipments/${shipmentId}/packing-list`, () =>
        HttpResponse.json({
          data: packingListSnapshot({
            order: towelOrder,
            packing: towelPacking(),
            transport: {
              service: "agl",
              handoff: "forwarder",
              collection: "pickup",
              carrierLabels: "none",
              instructions: ""
            },
            company: "Harbor Goods",
            supplier: "Northwind Textiles",
            destination: "Amazon AWD US",
            revision: 3,
            shipmentId: "Shipment 1",
            generatedDate: "2026-10-20"
          })
        })
      )
    )
    localStorage.removeItem(shippingSettingsKey)
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    return () => click.mockRestore()
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Shipment 1" })).toBeVisible()
    await expect(within(canvas.getByRole("navigation", { name: "Breadcrumb" })).getByText("Shipment 1")).toBeVisible()
    await expect(canvas.getAllByText("Packed").length).toBeGreaterThan(0)
    // The packed shipment reads like the packing page: the route, closed to its stops, then the cartons as packed, with
    // the documents and totals beside them. Opened, the route shows where the cartons leave from and how they travel.
    const route = canvas.getByRole("list", { name: "Route" })
    await expect([...route.querySelectorAll("li")].map((stop) => stop.textContent)).toEqual([
      "Northwind Textiles",
      "Bayline Freight",
      "Amazon Global Logistics (AGL)",
      "Amazon AWD US"
    ])
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await expect(await canvas.findByText("Supplier ships to Bayline Freight.")).toBeVisible()
    await expect(canvas.getByText(/^Northwind Textiles \/ Main factory, 88 Harbour Road/)).toBeVisible()
    await expect(canvas.getByRole("link", { name: "+86 574 5555 0100" })).toHaveAttribute("href", "tel:+8657455550100")
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await expect(within(cartons).getByText("540 of 540 units")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Products" })).toBeVisible()
    const summary = canvas.getByRole("region", { name: "Shipment details" })
    await expect(within(summary).getByText("230.8 kg")).toBeVisible()
    await expect(canvas.queryByText(/Packing is complete/)).toBeNull()

    // The documents: the product labels menu, then the packing list, which prints before Amazon's labels exist.
    const documents = canvas.getByRole("region", { name: "Documents" })
    const productLabels = within(documents).getByRole("button", { name: "Product labels" })
    const packingList = within(documents).getByRole("button", { name: "Download packing list" })
    await expect(productLabels).toBeVisible()
    await expect(packingList).toHaveTextContent("Packing list")
    // Below the menu, eight pixels apart, as on the board.
    await expect(packingList.getBoundingClientRect().top - productLabels.getBoundingClientRect().bottom).toBe(8)

    // Edit packing reopens it.
    await userEvent.click(canvas.getByRole("button", { name: "Edit packing" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "shipment.reopenPacking", data: { id: shipmentId, revision: 3 } }])
    )
  }
})

// Board 06.09: an FBA shipment of individual units, where each carton mixes products and every unit is packed.
export const FbaMixedCartons = meta.story({
  ...supplier,
  args: {
    ...DraftPacking.input.args,
    order: { id: orderRecords.amazon.id, data: bagOrder, revision: 1 },
    shipment: shipmentRow({
      status: "packing",
      amazonNetwork: "fba",
      packingDraft: bagPacking(),
      transport: { service: "agl", handoff: "forwarder", collection: "pickup", carrierLabels: "none", instructions: "" }
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon FBA US")).toBeVisible()
    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await expect(within(cartons).getByText("180 of 180 units")).toBeVisible()
    // One carton holds a bag in each color and a tea towel; a bag without a supplier SKU shows a dash.
    const second = canvas.getByRole("region", { name: "Carton B1" })
    await userEvent.click(within(second).getByRole("button", { name: "Products in B1" }))
    await expect(within(second).getAllByText("Cotton drawstring bag")).toHaveLength(2)
    await expect(within(second).getByText("NT-CT-3100")).toBeVisible()
    await expect(within(second).getAllByText("—")).toHaveLength(2)
    await expect(canvas.queryByText(/one SKU/i)).toBeNull()
    // No shipment of the PO has been planned, so Amazon hasn't set the packing groups to check yet.
    await expect(within(cartons).getByRole("note")).toHaveTextContent(
      "Products that can share a carton aren’t checked yet"
    )
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeEnabled()
    // The one label type FBA asks for downloads straight from Documents, and every carton is weighed.
    await expect(canvas.getByRole("link", { name: "Download FNSKU labels" })).toBeVisible()
    const summary = canvas.getByRole("region", { name: "Shipment details" })
    await expect(within(summary).getByText("3")).toBeVisible()
    await expect(within(summary).getByText("37.2 kg")).toBeVisible()
    await expect(within(summary).getByText("0.29 m³")).toBeVisible()
  }
})

// Board 06.15 (Additional validation states): packed again after Amazon refused the PO's earlier shipment, whose plan put
// the bags and the tea towel in different packing groups, each mixed carton shows the groups it holds, so packing
// can't finish until they're apart.
export const FbaPackingGroups = meta.story({
  ...supplier,
  args: {
    ...FbaMixedCartons.input.args,
    others: [
      shipmentRow({
        id: "c0ffee00-1234-4abc-9def-000000000021",
        status: "cancelled",
        amazonNetwork: "fba",
        packingGroups: { "DB-2030": "pg-bags", "DB-2031": "pg-bags", "CT-3100": "pg-towels" },
        createdAt: daysAgo(3)
      })
    ]
  },
  play: async ({ canvas }) => {
    // The errors name each product by the supplier SKU the carton lists, or, for a bag without one, by its name.
    const error =
      "Products: FBA can’t take Cotton drawstring bag and NT-CT-3100 in one carton. Amazon handles them differently, for example for dangerous goods, prep or labels, and may send them to different warehouses. Move one of them to another carton."
    for (const carton of ["A1", "B1", "C1"]) {
      await expect(within(canvas.getByRole("region", { name: `Carton ${carton}` })).getByText(error)).toBeVisible()
    }
    await expect(canvas.queryByText("Products that can share a carton aren’t checked yet")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeDisabled()
  }
})

// Downloading the packing list renders the real PDF, so test runs leave this story out (vitest.config.ts).
export const PackedPackingListDownload = meta.story({
  ...supplier,
  args: Packed.input.args,
  beforeEach: Packed.input.beforeEach,
  tags: ["documents"],
  play: async ({ canvas }) => {
    const documents = canvas.getByRole("region", { name: "Documents" })
    const packingList = within(documents).getByRole("button", { name: "Download packing list" })
    await userEvent.click(packingList)
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce(), { timeout: 20000 })
    const [link] = mocked(HTMLAnchorElement.prototype.click).mock.contexts
    invariant(link instanceof HTMLAnchorElement)
    await expect(link.download).toBe("Packing-list-PO38-Shipment 1-r3-en-A4-ltr.pdf")
    const pdf = await PDFDocument.load(await (await fetch(link.href)).arrayBuffer())
    await expect(pdf.getPageCount()).toBe(1)
    const { width, height } = pdf.getPage(0).getSize()
    await expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
    await expect(packingList).toBeEnabled()
  }
})

// The buyer's view of the packed shipment lists the packing list too. When packing was reopened since the page loaded,
// the failure says why there's no packing list.
export const PackedPackingListRefused = meta.story({
  ...buyer,
  args: { ...Packed.input.args, kind: "buyer" },
  beforeEach: ({ msw }) => {
    msw.use(
      http.get(`/api/shipments/${shipmentId}/packing-list`, () =>
        HttpResponse.json({ error: "The packing list is available once packing is finished" }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    const documents = canvas.getByRole("region", { name: "Documents" })
    await userEvent.click(within(documents).getByRole("button", { name: "Download packing list" }))
    await expect(await screen.findByText("Couldn’t download the packing list")).toBeVisible()
    await expect(screen.getByText("The packing list is available once packing is finished")).toBeVisible()
  }
})

// A line whose barcode label can't be made yet says why. Its warning labels still print, and with one label left there's
// nothing to download all at once.
export const DraftPackingMissingLabel = meta.story({
  ...supplier,
  args: {
    ...DraftPacking.input.args,
    lineLabels: [
      {
        itemId: towelOrder.items[0]!.id,
        type: "fnsku",
        state: "missing",
        problem: "Its FNSKU is looked up when the purchase order is sent"
      }
    ]
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Products" }))
    await userEvent.click(await canvas.findByRole("button", { name: "Labels for NT-WB-2210" }))
    const menu = within(await screen.findByRole("menu"))
    await expect(menu.getByRole("menuitem", { name: /FNSKU labels/ })).toHaveAttribute("aria-disabled", "true")
    // The menu shows from the frame after it opens.
    await waitFor(() => expect(menu.getByText("Its FNSKU is looked up when the purchase order is sent")).toBeVisible())
    await expect(menu.getByRole("menuitem", { name: "Suffocation warning labels" })).toHaveAttribute(
      "href",
      `/api/shipments/${shipmentId}/labels?item=${towelOrder.items[0]!.id}&kind=suffocation`
    )
    await expect(menu.queryByRole("menuitem", { name: "Download all product labels" })).toBeNull()
    await closeMenu()
  }
})

// A supplier that isn't on Copacker sends its details by email, and the buyer packs for it.
export const PackingForSupplier = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "packing" }),
    supplier: { id: supplierRecordId, name: "Lotus Manufacturing", supplierOrgId: null },
    step: step("packing", "Complete the packing list"),
    number: 1,
    docs: []
  },
  play: async ({ canvas }) => {
    const breadcrumb = canvas.getByRole("navigation", { name: "Breadcrumb" })
    await expect(within(breadcrumb).getByRole("link", { name: "Purchase orders" })).toHaveAttribute("href", "/orders")
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toHaveAttribute(
      "href",
      `/orders/${orderRecords.warehouse.id}`
    )
    await expect(canvas.getByRole("button", { name: "Add carton" })).toBeVisible()
    await expect(canvas.queryByRole("textbox", { name: /Supplier SKU/ })).toBeNull()
    // The buyer's Transport card follows the page header, outside the packing form, so saving the packing leaves it
    // usable.
    const heading = canvas.getByRole("heading", { level: 1 })
    const transport = canvas.getByText("Transport", { selector: "[data-slot=card-title]" })
    await expect(transport.getBoundingClientRect().top).toBeGreaterThan(heading.getBoundingClientRect().bottom)
    await expect(transport.closest("fieldset")).toBeNull()
  }
})

// Packing waits while the supplier's changes to the purchase order are with the buyer.
export const ChangesWaiting = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "packing" }),
    step: step("packing", "Complete the packing list"),
    number: 1,
    docs: [],
    awaitingChanges: true
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Changes waiting for approval")).toBeVisible()
    await expect(
      canvas.getByText("Packing opens once you answer the proposed changes on the purchase order.")
    ).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View purchase order" })).toHaveAttribute(
      "href",
      `/orders/${orderRecords.warehouse.id}`
    )
    // Nothing is uploaded yet; the product labels the packing details ask for still print.
    const documents = canvas.getByRole("region", { name: "Documents" })
    await expect(within(documents).getByRole("button", { name: "Product labels" })).toBeVisible()
  }
})

export const ChangesWaitingSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    shipment: shipmentRow({ status: "packing" }),
    step: step("packing", "Complete the packing list"),
    docs: [],
    awaitingChanges: true
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Packing opens once the customer answers the proposed changes on the order.")
    ).toBeVisible()
    await expect(canvas.getByRole("button", { name: "View order" })).toBeVisible()
  }
})

const approval = shipmentRow({
  status: "approval",
  packing: packingFor(warehouse.data, {
    changes: [
      { itemId: firstLine!.id, supplierSku: firstLine!.supplierSku, unitPrice: 450 },
      { itemId: secondLine!.id, supplierSku: "LM-APRON-CH", unitPrice: secondLine!.unitPrice }
    ]
  })
})

// The supplier's invoice changed prices and SKUs, which the buyer approves.
export const Approval = meta.story({
  ...buyer,
  args: {
    shipment: approval,
    step: step("approval", "Review the supplier’s proposed prices and supplier SKUs")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Invoice changes")).toBeVisible()
    await expect(canvas.getByText("Canvas tote bag / Natural")).toBeVisible()
    // Packed products are shown in the shared read-only carton table, under each row.
    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await userEvent.click(within(cartons).getByRole("button", { name: "Products in C1" }))
    await expect(cartons).toHaveTextContent("TOTE-016")
    await expect(canvas.getByText(/Price per unit \$4\.25/)).toHaveTextContent("$4.50")
    await expect(canvas.getByText(/Supplier SKU LM-TOTE/)).toHaveTextContent("LM-APRON-CH")
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() =>
      expect(sent).toEqual([{ action: "shipment.approve", data: { id: shipmentId, revision: 3, updateCost: false } }])
    )
  }
})

export const ApprovalSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    shipment: approval,
    step: step("approval", "Review the supplier’s proposed prices and supplier SKUs")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for the buyer’s approval")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Approve changes" })).toBeNull()
  }
})

// Without prices, only SKU changes show, nothing is approved, and the invoice isn't listed.
export const ApprovalWithoutPrices = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: packer },
  args: {
    permissions: packer,
    shipment: approval,
    step: step("approval", "Review the supplier’s proposed prices and supplier SKUs")
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/Price per unit/)).toBeNull()
    await expect(canvas.getByText(/Supplier SKU LM-TOTE/)).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Approve changes" })).toBeNull()
    await expect(canvas.queryByText("Lotus invoice 2291.pdf")).toBeNull()
    // Purchase orders aren't linked for someone who can't open them.
    await expect(canvas.queryByRole("link", { name: "PO-1045" })).toBeNull()
  }
})

// Amazon is creating the shipment; the page refreshes until it's done.
export const Creating = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({ status: "creating", packing: packingFor(amazonOrder.data), amazonNetwork: "fba" }),
    step: step("processing", "Amazon is processing the shipment and carton labels")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Creating the Amazon shipment")).toBeVisible()
    await expect(canvas.getByText("Amazon FBA US")).toBeVisible()
    // Amazon picks the warehouse as it creates the shipment.
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await expect(
      await canvas.findByText("Amazon picks the fulfillment centers when the shipment is created")
    ).toBeVisible()
    await expect(within(canvas.getByRole("region", { name: "Shipment details" })).getByText("2")).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Cartons" })).toBeVisible()
  }
})

// Amazon has made the AWD order's carton labels. AGL books the transport, so no carrier labels are needed.
const waitingLabels = shipmentRow({
  status: "waiting_labels",
  packing: packingFor(awdOrder.data),
  amazonNetwork: "awd_us",
  amazonOrderId: "STAR-8KQ2M7",
  amazonShipmentId: "STAR-8KQ2M7-1",
  labels: awdLabels,
  transport: { service: "agl", handoff: "supplier", collection: "pickup", carrierLabels: "none", instructions: "" }
})

// The labels go to the supplier by themselves, so the page only lists what still holds them back.
export const WaitingForLabels = meta.story({
  ...buyer,
  args: {
    order: awdOrder,
    shipment: waitingLabels,
    step: step("labels", "Book shipping and add the missing documents below", {
      issues: [{ code: "missing_product_label", message: "Add a product label for Linen apron / Charcoal" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Before the labels go to the supplier")).toBeVisible()
    await expect(canvas.getByText("Add a product label for Linen apron / Charcoal")).toBeVisible()
    // Nothing to release, and no carrier labels to add for AGL.
    await expect(canvas.queryByRole("button", { name: /Release/ })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Upload labels" })).toBeNull()
    // The buyer's Amazon shipment opens in Seller Central.
    await expect(canvas.getByRole("link", { name: /STAR-8KQ2M7-1/ })).toHaveAttribute(
      "href",
      "https://sellercentral.amazon.com/awd/inbound-shipment/STAR-8KQ2M7-1"
    )
    // The cartons go to the AWD warehouse Amazon chose, each with Amazon's label.
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await expect(await canvas.findByText("Amazon IUSP, 200 Distribution Road, Hesperia, CA 92344, US")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Products" })).toBeVisible()
    await expect(canvas.queryByText(/201952611540373988/)).toBeNull()
  }
})

// 10.05: an FBA parcel shipment booked with the buyer's own carrier. Upload labels is the page's one action, and the
// dialog opens with the labels saved so far; the page shows no other label status.
export const WaitingForCarrierLabels = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "waiting_labels",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "fba",
      amazonOrderId: fbaPlanId,
      amazonShipmentId: "FBA18ABCD123",
      labels
    }),
    step: step("labels", "Book shipping and add the missing documents below", {
      issues: [{ code: "missing_shipping_label", message: "Add a carrier label for carton C2" }]
    }),
    docs: [invoice, cartonLabel, shippingLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Needs shipping labels")).toBeVisible()
    // The dialog holds the labels' progress, so the page doesn't list it.
    await expect(canvas.queryByText("Before the labels go to the supplier")).toBeNull()
    await expect(canvas.queryByText("Add a carrier label for carton C2")).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Upload labels" }))
    const dialog = await shownDialog("Upload carrier labels")
    await expect(dialog.getByText("1Z4F7E210393821041")).toBeVisible()
    await expect(dialog.getByText("ups-labels.pdf, page 1")).toBeVisible()
    await expect(dialog.getAllByText("Drag a label here")).toHaveLength(1)
    await expect(dialog.getByText("1 of 2 have a label")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// The supplier waits for the labels, and reads Amazon's shipment ID rather than a link to Seller Central.
export const WaitingForLabelsSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: awdOrder,
    shipment: waitingLabels,
    step: step("labels", "Book shipping and add the missing documents below"),
    docs: [invoice, cartonLabel, shippingLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Needs shipping labels")).toBeVisible()
    // The supplier reads Amazon's shipment ID beside the title, since it can't open Seller Central.
    await expect(canvas.getByText("STAR-8KQ2M7-1")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /STAR-8KQ2M7-1/ })).toBeNull()
    // Labels reach the supplier once they're sent.
    await expect(canvas.queryByRole("link", { name: /Download Carton labels/ })).toBeNull()
    await expect(canvas.queryByRole("link", { name: "Download Carrier labels" })).toBeNull()
    await expect(canvas.queryByText("Lotus invoice 2291.pdf")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Upload labels" })).toBeNull()
  }
})

// Packed on pallets for FBA: Amazon's pallet labels come with the carton labels, as one file.
export const ReadyOnPalletsSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: amazonOrder,
    shipment: shipmentRow({
      status: "ready",
      packing: packingFor(amazonOrder.data, {
        palletized: true,
        pallets: [
          { palletId: "1", length: 120, width: 100, height: 120, weight: 62, stackable: true, cartonIds: ["C1", "C2"] }
        ]
      }),
      amazonNetwork: "fba",
      amazonOrderId: fbaPlanId,
      amazonShipmentId: "FBA18ABCD123",
      labels
    }),
    docs: [invoice, cartonLabel, palletLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Download shipment packet" })).toHaveAttribute("href", packet)
    const download = canvas.getByRole("link", { name: "Download Pallet labels Pallet labels.pdf" })
    await expect(download).toHaveAttribute("href", `/api/documents/${palletLabel.id}`)
    await expect(canvas.getByRole("link", { name: "Download Carton labels" })).toHaveAttribute(
      "href",
      expect.stringContaining("?bundle=true")
    )
  }
})

// Ready for pickup: the supplier downloads the packet and marks the cartons shipped.
export const ReadySupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: amazonOrder,
    shipment: shipmentRow({
      status: "ready",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "fba",
      amazonOrderId: fbaPlanId,
      amazonShipmentId: "FBA18ABCD123",
      labels
    }),
    docs: [invoice, cartonLabel, shippingLabel]
  },
  play: async ({ canvas }) => {
    // The packet is the first of the documents, with no banner.
    await expect(canvas.queryByText("Supplier packet ready")).toBeNull()
    // The cartons go to the FBA warehouse their labels name.
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await expect(await canvas.findByText("Amazon ONT8, 100 Warehouse Road, Moreno Valley, CA 92551, US")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /\+86/ })).toHaveAttribute("href", "tel:+8657985551234")
    await expect(canvas.getByRole("link", { name: "Download shipment packet" })).toHaveAttribute("href", packet)
    // Each carton's label number is on its label, not in the carton rows.
    await expect(canvas.queryByText(/FBA18ABCD123U000002/)).toBeNull()
    await expect(canvas.getByRole("link", { name: "Download Carrier labels" })).toHaveAttribute(
      "href",
      expect.stringContaining("?bundle=true")
    )
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.ship", data: { id: shipmentId } }]))
    // Until it ships, a correction can still be asked for.
  }
})

// A buyer entering for a supplier that isn't on Copacker marks its cartons shipped.
export const ReadyForSupplierNotOnCopacker = meta.story({
  ...buyer,
  args: {
    supplier: { id: supplierRecordId, name: "Lotus Manufacturing", supplierOrgId: null }
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.ship", data: { id: shipmentId } }]))
  }
})

// Shipped to the PO's forwarder, whose leg to the buyer's warehouse comes next.
export const ShippedToForwarder = meta.story({
  ...buyer,
  args: {
    order: { ...warehouse, data: { ...warehouse.data, via: towelOrder.via } },
    shipment: shipmentRow({
      status: "shipped",
      packing: packingFor(warehouse.data),
      transport: {
        service: "parcel",
        handoff: "forwarder",
        collection: "pickup",
        carrierLabels: "per_carton",
        instructions: ""
      }
    }),
    step: step("forward", "The forwarder ships the goods on and adds the freight cost, carrier, and tracking", {
      packetUrl: packet
    })
  },
  play: async ({ canvas }) => {
    // The forwarder's warehouse is a stop on the route, with no line about the forwarder's step.
    await userEvent.click(canvas.getByRole("button", { name: "Route" }))
    await expect(await canvas.findByText("Supplier ships to Bayline Freight.")).toBeVisible()
    await expect(canvas.queryByText(/The forwarder ships the goods on/)).toBeNull()
    await expect(
      canvas.getByText("Ningbo warehouse, 18 Gangqiao Road, Beilun, Ningbo, Zhejiang 315800, CN")
    ).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
  }
})

export const Shipped = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "shipped", packing: packingFor(warehouse.data) }),
    step: step("receive", "Mark the goods received when they arrive", { packetUrl: packet })
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark received" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.received", data: { id: shipmentId } }]))
  }
})

export const Received = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "received", packing: packingFor(warehouse.data) }),
    step: step("complete", "The goods have arrived", { packetUrl: packet })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Received").length).toBeGreaterThan(0)
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
  }
})

// Amazon confirmed the AWD order but couldn't make its carton labels: the buyer sees why and retries.
export const NeedsAttention = meta.story({
  ...buyer,
  args: {
    order: awdOrder,
    shipment: shipmentRow({
      status: "needs_attention",
      packing: packingFor(awdOrder.data),
      amazonNetwork: "awd_us",
      amazonOrderId: "STAR-8KQ2M7",
      amazonShipmentId: "STAR-8KQ2M7-1",
      issue: "Amazon could not generate carton labels"
    }),
    step: step("retry", "Resolve the reported problem, then retry the shipment")
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert")
    await expect(alert).toHaveTextContent("Needs attention")
    await expect(alert).toHaveTextContent("Amazon could not generate carton labels")
    await userEvent.click(canvas.getByRole("button", { name: "Retry shipment" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.retry", data: { id: shipmentId, revision: 3 } }]))
  }
})

// Copacker lost Amazon's reply: the buyer links the order Amazon made instead of correcting.
export const Reconcile = meta.story({
  ...buyer,
  args: {
    order: awdOrder,
    shipment: shipmentRow({
      status: "needs_attention",
      packing: packingFor(awdOrder.data),
      amazonNetwork: "awd_us",
      operation: "sending",
      issue: "Amazon didn't answer in time."
    }),
    step: step("reconcile", "Find and link the Amazon order before continuing")
  },
  play: async ({ canvas }) => {
    // The order ID goes in the alert that says what went wrong.
    const alert = canvas.getByRole("alert")
    await expect(within(alert).getByText("Amazon didn't answer in time.")).toBeVisible()
    await expect(within(alert).getByRole("textbox", { name: "Existing Amazon AWD order ID" })).toBeVisible()
    await expect(within(alert).getByRole("button", { name: "Verify and resume" })).toBeDisabled()
    await expect(canvas.queryByRole("button", { name: "Retry shipment" })).toBeNull()
  }
})

// A correction of a shipment Amazon already has starts with cancelling it there.
export const Correction = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "correction",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "fba",
      amazonOrderId: "wf0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
      amazonShipmentId: "FBA18ABCD123"
    }),
    step: step("cancellation", "Cancel the existing Amazon shipment before creating a replacement")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Cancel the existing Amazon shipment before creating a replacement")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Cancel in Amazon" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.cancelAmazon", data: { id: shipmentId } }]))
  }
})

// Someone who only views shipments follows each step without its buttons.
export const ViewOnly = meta.story({
  ...buyer,
  parameters: { ...buyer.parameters, permissions: member },
  args: {
    permissions: member,
    shipment: shipmentRow({ status: "shipped", packing: packingFor(warehouse.data) }),
    step: step("receive", "Mark the goods received when they arrive", { packetUrl: packet })
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toBeVisible()
    const cartons = canvas.getByRole("region", { name: "Cartons" })
    await userEvent.click(within(cartons).getByRole("button", { name: "Products in C1" }))
    await expect(cartons).toHaveTextContent("TOTE-016")
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(screen.queryByRole("dialog")).toBeNull()
  }
})

// Products that carry their own barcodes and need no warning print no product labels, so the documents offer the carton
// labels alone.
const noLabels: OrderItem["packingRequirements"] = {
  preparation: "none",
  labels: [],
  countryCode: "",
  instructions: ""
}
export const ReadyWithoutProductLabels = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: {
      ...awdOrder,
      data: { ...awdOrder.data, items: awdOrder.data.items.map((item) => ({ ...item, packingRequirements: noLabels })) }
    },
    shipment: shipmentRow({
      status: "ready",
      packing: packingFor(awdOrder.data),
      amazonNetwork: "awd_us",
      amazonOrderId: "STAR-8KQ2M7",
      amazonShipmentId: "STAR-8KQ2M7-1",
      labels: awdLabels
    }),
    docs: [cartonLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Download Carton labels" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Product labels" })).not.toBeInTheDocument()
  }
})
