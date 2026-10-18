import { type OrderInput } from "@repo/aisle"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import type { PartnerAddress } from "@/components/partner-address"
import { can, type Permissions } from "@/lib/access"
import { amazonShipmentLinks } from "@/server/amazon-shipments"
import { unpricedDraft, unpricedOrder } from "@/server/prices"
import { releasedStates } from "@/server/readiness"
import {
  type ActionRequest,
  buyerContacts,
  documentRow,
  type DocumentRow,
  orderRecords,
  packingFor,
  partnerAddresses,
  recordActions,
  shipmentId,
  shipmentRow,
  type ShipmentRow,
  supplierRecordId
} from "@/stories/fixtures/logistics"
import { portalPage, serverStory } from "@/stories/server"
import { member, owner } from "@/stories/workspace"
import { shipmentDestinations } from "../destination"
import ShipmentPageView from "./page"

// The shipment's step as orderWorkflow reports it: what happens next, what its packet lacks, and whether its labels
// can be released.
type Step = {
  next: { step: string; message: string }
  issues: Array<{ message: string }>
  canRelease: boolean
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
  docs: DocumentRow[]
  // The supplier's pickup addresses.
  addresses: PartnerAddress[]
  // Whether the supplier's changes to the purchase order are waiting on the buyer.
  awaitingChanges: boolean
  productLabels?: boolean
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
  docs,
  addresses,
  awaitingChanges,
  productLabels = true
}: Args) {
  const t = await translateStory("shipments.detail")
  const editsShipments = can(s, "shipments", "edit")
  const seesOrder = can(s, "orders")
  const prices = can(s, "prices")
  const id = shipment.id
  const packingOrder = shipment.amazonNetwork
    ? { ...order.data, items: order.data.items.filter((item) => item.amazonNetwork === shipment.amazonNetwork) }
    : order.data
  const snapshot = shipment.snapshot ?? order.data
  const editable =
    editsShipments &&
    ["packing", "correction"].includes(shipment.status) &&
    !shipment.amazonOrderId &&
    shipment.operation === "none" &&
    !awaitingChanges
  const isBuyer = kind === "buyer"
  const amazonLinks = isBuyer ? amazonShipmentLinks(shipment) : []
  const amazonIds = amazonLinks.length ? [] : (shipment.amazonShipmentId?.split(", ") ?? [])
  const visibleDocs = docs.filter(
    (d) =>
      (isBuyer || releasedStates.includes(shipment.status) || !["shipping_label", "carton_label"].includes(d.kind)) &&
      !["invoice", "packing_list", "checklist"].includes(d.kind)
  )
  const changes = (shipment.packing?.changes ?? []).flatMap((change) => {
    const item = snapshot.items.find((i) => i.id === change.itemId)!
    return item.supplierSku === change.supplierSku && item.unitPrice === change.unitPrice ? [] : [{ item, change }]
  })
  const origin = shipment.packing?.origin
  const fba = shipment.amazonNetwork === "fba"
  const enteringFor = isBuyer && !supplier.supplierOrgId ? supplier.name : undefined
  const amazon = order.data.destination === "amazon"
  const title = t("title", { number })
  const cartonCount = shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0
  const destination = await shipmentDestinations([order.data])
  const summary = [
    destination(order.data, shipment.amazonNetwork),
    cartonCount && t("cartonCount", { count: cartonCount }),
    ...amazonIds
  ]
    .filter(Boolean)
    .join(", ")
  const nextStep =
    step.next.step === "forward" || (isBuyer && step.next.step === "cancellation") ? step.next.message : undefined
  return (
    <ShipmentPageView
      page={{
        id,
        hasProductLabels: productLabels,
        delivery: { addresses: [], pending: amazon },
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
        step: { next: step.next, issues: step.issues, packetUrl: step.packetUrl, canRelease: step.canRelease },
        reserved,
        snapshot: prices ? snapshot : unpricedOrder(snapshot),
        addresses: addresses.map((contact) => ({ id: contact.id, name: contact.name, address: contact.address })),
        awaitingChanges,
        editable,
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
        origin,
        fba,
        enteringFor,
        amazon,
        title,
        summary,
        nextStep
      }}
    />
  )
}

function step(next: string, message: string, changes: Partial<Step> = {}): Step {
  return { next: { step: next, message }, issues: [], canRelease: false, packetUrl: null, ...changes }
}

const warehouse = orderRecords.warehouse
const amazonOrder = orderRecords.amazon
const [firstLine, secondLine] = warehouse.data.items
const packet = `/shipments/${shipmentId}/packet`
const invoice = documentRow("invoice", "Lotus invoice 2291.pdf")
const packingList = documentRow("packing_list", "Packing list.pdf")
const shippingLabel = documentRow("shipping_label", "AGL labels.pdf")
const cartonLabel = documentRow("carton_label", "Carton label.pdf", { cartonId: "C1" })
const labels = [
  { cartonId: "C1", labelNumber: "FBA18ABCD123U000001", destinationCode: "ONT8", amazonShipmentId: "FBA18ABCD123" },
  { cartonId: "C2", labelNumber: "FBA18ABCD123U000002", destinationCode: "ONT8", amazonShipmentId: "FBA18ABCD123" }
]

const sent: ActionRequest[] = []
const buyer = portalPage("/shipments")
const supplier = portalPage("/shipments", "supplier")
// Someone who packs and follows shipments without prices, and can't open purchase orders.
const packer: Permissions = { role: "member", access: { shipments: "edit" } }

const meta = preview.meta({
  title: "Pages/Shared/Shipments/Detail",
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
    sent.length = 0
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
    await expect(canvas.getByText("Portland warehouse")).toBeVisible()
    await expect(canvas.getAllByText("Packing").length).toBeGreaterThan(0)
    // The packing form replaces the cartons and documents.
    await expect(canvas.queryByText("No documents yet")).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
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
    await expect(canvas.getByText("No documents yet")).toBeVisible()
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
    // Packed products are shown in the shared read-only carton editor.
    await expect(canvas.getByRole("region", { name: "Cartons" })).toHaveTextContent("TOTE-016")
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
    await expect(canvas.getByText(/Supplier SKU/)).toBeVisible()
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
    await expect(canvas.getByText("Amazon FBA, 2 cartons")).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Cartons" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
  }
})

const waitingLabels = shipmentRow({
  status: "waiting_labels",
  packing: packingFor(amazonOrder.data),
  amazonNetwork: "awd_us",
  amazonOrderId: "STAR-8KQ2M7",
  amazonShipmentId: "STAR-8KQ2M7-1"
})

// The buyer books AGL transport and uploads its labels; what's missing is listed.
export const WaitingForLabels = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: waitingLabels,
    step: step("labels", "Book shipping and add the missing documents below", {
      issues: [{ message: "Upload the shipping label for carton C2" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Labels")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Save transport" })).toBeVisible()
    await expect(canvas.getByText("Upload the shipping label for carton C2")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Release labels to supplier" })).toBeNull()
    // The buyer's Amazon shipment opens in Seller Central.
    await expect(canvas.getByRole("link", { name: /STAR-8KQ2M7-1/ })).toHaveAttribute(
      "href",
      "https://sellercentral.amazon.com/awd/inbound-shipment/STAR-8KQ2M7-1"
    )
  }
})

export const Release = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: { ...waitingLabels, amazonNetwork: "fba" },
    step: step("release", "Enter the booking reference and release the supplier packet", { canRelease: true })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Labels", { exact: true })).toBeVisible()
    await userEvent.type(canvas.getByRole("textbox", { name: "Amazon transport booking reference" }), "AGL-778812")
    await userEvent.click(canvas.getByRole("button", { name: "Release labels to supplier" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "shipment.release", data: { id: shipmentId, revision: 3, bookingReference: "AGL-778812" } }
      ])
    )
  }
})

// The supplier waits for the labels, and reads Amazon's shipment ID rather than a link to Seller Central.
export const WaitingForLabelsSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    order: amazonOrder,
    shipment: waitingLabels,
    step: step("labels", "Book shipping and add the missing documents below"),
    docs: [invoice, shippingLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for labels")).toBeVisible()
    await expect(canvas.getByText("Amazon AWD US, 2 cartons, STAR-8KQ2M7-1")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /STAR-8KQ2M7-1/ })).toBeNull()
    // Labels reach the supplier once they're released.
    await expect(canvas.queryByText("AGL labels.pdf")).toBeNull()
    await expect(canvas.queryByText("Lotus invoice 2291.pdf")).toBeNull()
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
      amazonShipmentId: "FBA18ABCD123",
      labels
    }),
    docs: [invoice, cartonLabel, shippingLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Supplier packet ready")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Download supplier packet" })).toHaveAttribute("href", packet)
    await expect(canvas.getByText(/C2: FBA18ABCD123U000002/)).toBeVisible()
    await expect(canvas.getByText("AGL labels.pdf")).toBeVisible()
    await expect(canvas.getByText("Mei Chen")).toBeVisible()
    await expect(canvas.getByRole("link", { name: /\+86/ })).toHaveAttribute("href", "tel:+8657985551234")
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.ship", data: { id: shipmentId } }]))
    // Until it ships, a correction can still be asked for.
    await expect(canvas.getByRole("button", { name: "Request a correction" })).toBeVisible()
  }
})

// The buyer doesn't mark a joined supplier's cartons shipped; the packet waits for a product label.
export const ReadyIncomplete = meta.story({
  ...buyer,
  args: {
    step: step("ship", "Print the packet, pack the cartons, and mark them shipped", {
      issues: [{ message: "Add a product label for Linen apron / Charcoal" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Supplier packet incomplete")).toBeVisible()
    await expect(canvas.getByText("Add a product label for Linen apron / Charcoal")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark shipped" })).toBeNull()
    // A warehouse shipment has no Amazon labels.
    await expect(canvas.queryByRole("columnheader", { name: "Amazon label" })).toBeNull()
    await expect(canvas.getByText("Portland warehouse, 2 cartons")).toBeVisible()
  }
})

export const ReadyIncompleteSupplier = meta.story({
  ...supplier,
  args: {
    kind: "supplier",
    step: step("ship", "Print the packet, pack the cartons, and mark them shipped", {
      issues: [{ message: "Add a product label for Linen apron / Charcoal" }]
    })
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for the buyer’s labels")).toBeVisible()
    await expect(canvas.queryByText("Add a product label for Linen apron / Charcoal")).toBeNull()
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

// Shipped through a forwarder, whose leg comes next.
export const ShippedToForwarder = meta.story({
  ...buyer,
  args: {
    shipment: shipmentRow({ status: "shipped", packing: packingFor(warehouse.data) }),
    step: step("forward", "The forwarder ships the goods on and adds the freight cost, carrier, and tracking", {
      packetUrl: packet
    })
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("The forwarder ships the goods on and adds the freight cost, carrier, and tracking")
    ).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark received" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
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
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
  }
})

// Amazon refused the shipment: the buyer sees why and retries.
export const NeedsAttention = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "needs_attention",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "awd_us",
      issue: "Amazon rejected carton C2: it's over 22.68 kg."
    }),
    step: step("retry", "Resolve the reported problem, then retry the shipment")
  },
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert")
    await expect(alert).toHaveTextContent("Needs attention")
    await expect(alert).toHaveTextContent("Amazon rejected carton C2: it's over 22.68 kg.")
    await userEvent.click(canvas.getByRole("button", { name: "Retry shipment" }))
    await waitFor(() => expect(sent).toEqual([{ action: "shipment.retry", data: { id: shipmentId, revision: 3 } }]))
    await expect(canvas.getByRole("button", { name: "Request a correction" })).toBeVisible()
  }
})

// Copacker lost Amazon's reply: the buyer links the order Amazon made instead of correcting.
export const Reconcile = meta.story({
  ...buyer,
  args: {
    order: amazonOrder,
    shipment: shipmentRow({
      status: "needs_attention",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "awd_us",
      operation: "sending",
      issue: "Amazon didn't answer in time."
    }),
    step: step("reconcile", "Find and link the Amazon order before continuing")
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Existing Amazon AWD order ID" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
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
    await expect(canvas.queryByRole("button", { name: "Request a correction" })).toBeNull()
    await expect(canvas.getByRole("link", { name: "PO-1045" })).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Cartons" })).toHaveTextContent("TOTE-016")
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(screen.queryByRole("dialog")).toBeNull()
  }
})

export const ReadyWithoutProductLabels = meta.story({
  ...supplier,
  args: {
    productLabels: false,
    kind: "supplier",
    order: amazonOrder,
    shipment: shipmentRow({
      status: "ready",
      packing: packingFor(amazonOrder.data),
      amazonNetwork: "awd_us",
      amazonShipmentId: "STAR-EXAMPLE",
      labels
    }),
    docs: [cartonLabel]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Carton labels" })).toHaveAttribute("download")
    await expect(canvas.queryByRole("button", { name: "Product labels" })).not.toBeInTheDocument()
  }
})
