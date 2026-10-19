import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { forwarderPage } from "@/server/forwarder-page"
import {
  actionHandler,
  amazonOrder,
  documentRecord,
  forwarderId,
  forwarderWarehouse,
  order,
  orderRecord,
  packed,
  shipmentRecord,
  shownDialog,
  stopId,
  supplierRecord,
  warehouse
} from "@/stories/fixtures/purchase-orders"
import { serverStory } from "@/stories/server"
import { workspaces } from "@/stories/workspace"
import { ForwarderView } from "./forwarder-view"

type Props = { row: Parameters<typeof forwarderPage>[0]; editable: boolean }

const actions = fn()
const via = { forwarderId, addressId: stopId }
const forwarder = { id: forwarderId, name: "Bayline Freight", buyerOrgId: workspaces.buyer.id }

// Shipment 1 reached the forwarder; shipment 2 is still being packed, so its carton labels aren't released.
const shipped = shipmentRecord({ status: "shipped", packing: packed(2), createdAt: new Date(Date.now() - 9e8) })
const packing = shipmentRecord({ status: "packing", packingDraft: packed(1) })
const forwarded = shipmentRecord({
  status: "forwarded",
  packing: packed(3),
  forwarderCarrier: "Maersk",
  forwarderReference: "MAEU 204113"
})

const meta = preview.meta({
  title: "Pages/Purchase orders/Forwarder view",
  ...serverStory(async (props: Props) => <ForwarderView page={await forwarderPage(props.row, props.editable)} />),
  args: {
    row: { order: orderRecord({ data: { ...order, via } }), supplier: supplierRecord(), forwarder },
    editable: true
  },
  parameters: {
    db: {
      contacts: [warehouse, forwarderWarehouse],
      shipments: [shipped, packing],
      documents: [
        documentRecord({ kind: "invoice", name: "Commercial invoice PO-1042.pdf", shipmentId: shipped.id }),
        documentRecord({ kind: "packing_list", name: "Packing list.pdf", shipmentId: shipped.id }),
        documentRecord({
          kind: "carton_label",
          name: "Carton labels.pdf",
          cartonId: "C1",
          shipmentId: shipped.id,
          shipmentRevision: 1
        }),
        documentRecord({
          kind: "carton_label",
          name: "Carton labels 2.pdf",
          cartonId: "C1",
          shipmentId: packing.id,
          shipmentRevision: 1
        })
      ]
    }
  },
  beforeEach: ({ msw }) => {
    msw.use(actionHandler(actions))
  }
})

// Goods stopping at the forwarder on their way to the buyer's warehouse, which the forwarder ships them on to.
export const ToWarehouse = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "PO-1042" })).toBeVisible()
    await expect(canvas.getByText("Bayline Freight, Ningbo warehouse")).toBeVisible()
    await expect(canvas.getByText("Oakland warehouse")).toBeVisible()
    // Where to ship on to.
    await expect(canvas.getByText(/1200 Harbor Way/)).toBeVisible()
    // No prices, only what's coming.
    await expect(canvas.queryByText(/\$/)).toBeNull()
    await expect(canvas.getByRole("cell", { name: /Canvas tote bag/ })).toHaveTextContent(order.items[0]!.buyerSku)
    await expect(canvas.getByText("240")).toBeVisible()

    // Shipment 1 in the list, and over its documents.
    await expect(canvas.getAllByText("Shipment 1")).toHaveLength(2)
    await expect(canvas.getByText("2 cartons")).toBeVisible()
    // Carton labels show once the buyer releases the shipment.
    const documents = within(canvas.getByText("Documents").closest("[data-slot=card]")!)
    await expect(documents.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "Download Commercial invoice",
      "Download Packing list",
      "Download Carton label C1"
    ])
  }
})

// The forwarder ships the goods on, with the freight cost, carrier and tracking.
export const MarkShipped = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    const dialog = await shownDialog("Mark shipped")
    await userEvent.click(dialog.getByRole("button", { name: "Mark shipped" }))
    await expect(await dialog.findByText("Enter the carrier")).toBeVisible()
    await expect(dialog.getByText("Enter the tracking or booking number")).toBeVisible()

    await userEvent.type(dialog.getByRole("textbox", { name: "Freight cost" }), "250")
    await userEvent.type(dialog.getByRole("textbox", { name: "Carrier" }), "Maersk")
    await userEvent.type(dialog.getByRole("textbox", { name: "Tracking or booking number" }), "MAEU 204113")
    await userEvent.click(dialog.getByRole("button", { name: "Mark shipped" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(actions).toHaveBeenCalledWith({
      action: "shipment.forward",
      data: {
        id: shipped.id,
        carrier: "Maersk",
        reference: "MAEU 204113",
        freight: { amountMinor: 25_000, currency: "USD" }
      }
    })
  }
})

// Straight on to Amazon: each line names its network, and a shipment shipped on shows its carrier and tracking.
export const ToAmazon = meta.story({
  args: {
    row: { order: orderRecord({ data: { ...amazonOrder, via } }), supplier: supplierRecord(), forwarder }
  },
  parameters: {
    db: {
      contacts: [forwarderWarehouse],
      shipments: [{ ...forwarded, amazonNetwork: "fba" }],
      documents: []
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Amazon")).toBeVisible()
    await expect(canvas.getByText(`${amazonOrder.items[0]!.buyerSku}, to Amazon FBA`)).toBeVisible()
    await expect(canvas.getByText("Shipment 1 to Amazon FBA")).toBeVisible()
    await expect(canvas.getByText("3 cartons, Maersk MAEU 204113")).toBeVisible()
    await expect(canvas.getByText("Shipped onward")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark shipped" })).toBeNull()
    await expect(canvas.queryByText("Documents")).toBeNull()
  }
})

export const NoShipments = meta.story({
  parameters: { db: { contacts: [warehouse, forwarderWarehouse], shipments: [], documents: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No shipments yet")).toBeVisible()
    await expect(canvas.queryByText("Documents")).toBeNull()
  }
})

// Someone who only views purchase orders can't move shipments on.
export const ViewOnly = meta.story({
  args: { editable: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shipped")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark shipped" })).toBeNull()
  }
})
