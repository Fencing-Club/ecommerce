import { money } from "@repo/aisle"
import { destinationRequirements, itemRequirements, sharedPrep } from "@repo/aisle/requirements"
import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import { translateStory } from "#.storybook/intl"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import type { events, orderProposals, orderRevisions, orders, shipments, suppliers } from "@/db/schema"
import { can, type Permissions } from "@/lib/access"
import { storedEvent } from "@/lib/timeline-events"
import { forwarderPage } from "@/server/forwarder-page"
import { landedCostKinds, landedMarkup, type orderLandedCosts } from "@/server/landed-costs"
import type { proposalChanges } from "@/server/order-proposals"
import { unpricedChanges, unpricedOrder } from "@/server/prices"
import type { LineLabel } from "@/server/product-barcodes"
import { requirementTranslator } from "@/server/requirements"
import { forwarderLeg } from "@/server/shipment-legs"
import type { orderWorkflow } from "@/server/workflow"
import { deliveryId } from "@/stories/fixtures/orders"
import {
  actionHandler,
  documentRecord,
  forwarderId,
  forwarderWarehouse,
  history,
  landedCosts,
  order as orderData,
  orderId,
  orderRecord,
  packed,
  revisions,
  shipmentRecord,
  stopId,
  supplierRecord,
  warehouse
} from "@/stories/fixtures/purchase-orders"
import { pageStory } from "@/stories/server"
import { member, owner, person, workspaces } from "@/stories/workspace"
import OrderPageView from "./page"

type Workflow = Awaited<ReturnType<typeof orderWorkflow>>

type Args = {
  kind: "buyer" | "supplier" | "forwarder"
  permissions: Permissions
  // What the page's queries return: the purchase order and its supplier, its shipments oldest first, its events and
  // revisions newest first, and the buyer's name for a supplier.
  order: typeof orders.$inferSelect
  supplier: typeof suppliers.$inferSelect
  shipments: Array<typeof shipments.$inferSelect>
  history: Array<typeof events.$inferSelect>
  revisions: Array<typeof orderRevisions.$inferSelect>
  buyerName?: string
  // orderWorkflow's lines, shipments and documents, and proposalState.
  workflow: {
    items: Array<Pick<Workflow["items"][number], "itemId" | "remainingPieces">>
    shipments: Array<Pick<Workflow["shipments"][number], "editable">>
    documents: Workflow["documents"]
  }
  proposals: { latest: typeof orderProposals.$inferSelect | null; changeable: boolean }
  // What proposalChanges makes of the latest proposal, as this person may see it.
  changes: ReturnType<typeof proposalChanges> | null
  landed: Awaited<ReturnType<typeof orderLandedCosts>>
  freight: Array<{ reference: string; freightMinor: number }>
  labels: LineLabel[]
  // The forwarder on the way, and the route's addresses.
  leg?: { name: string; forwarderOrgId: string | null }
  places: Array<{ id: string; name: string }>
}

// The purchase order page (page.tsx) with what its queries would return.
async function OrderPage(args: Args) {
  const { kind, permissions: s } = args
  const t = await translateStory("orders")
  const id = args.order.id
  if (kind === "forwarder") {
    const forwarder = { id: forwarderId, name: args.leg?.name ?? "", buyerOrgId: args.order.buyerOrgId }
    return (
      <OrderPageView
        page={{
          view: "forwarder",
          data: await forwarderPage({ order: args.order, supplier: args.supplier, forwarder }, can(s, "orders", "edit"))
        }}
      />
    )
  }
  const editsOrder = can(s, "orders", "edit")
  const seesShipments = can(s, "shipments")
  const editsShipments = can(s, "shipments", "edit")
  const prices = can(s, "prices")
  const { order, supplier, shipments: shipmentRows, workflow, proposals, landed, labels } = args
  const status =
    kind === "supplier" && order.status !== "closed" ? (shipmentRows.at(-1)?.status ?? order.status) : order.status
  const proposal =
    proposals.latest &&
    (proposals.latest.status === "pending" || (proposals.latest.status === "declined" && kind === "supplier"))
      ? proposals.latest
      : null
  const editable = workflow.shipments.some((row) => row.editable)
  const remaining = workflow.items.some((item) => item.remainingPieces > 0)
  const { currency } = order.data
  const buyer = kind === "buyer"
  const freight = buyer ? args.freight : []
  const landedTotal =
    landed.reduce((sum, cost) => sum + cost.amountMinor, 0) + freight.reduce((sum, row) => sum + row.freightMinor, 0)
  const markup = landedMarkup(order.data, landedTotal)
  const timeline = [
    ...args.history.map((event) => ({
      key: event.id,
      at: event.createdAt,
      content: (event.kind === "event" && storedEvent(event)) || (event.message ?? ""),
      comment: event.kind === "comment",
      author: event.author,
      authorOrg: event.authorOrg,
      revision: null,
      revisionNumber: null
    })),
    ...args.revisions.map((r) => ({
      key: r.id,
      at: r.createdAt,
      content: storedEvent({ messageKey: r.reason, messageValues: null }) ?? r.reason,
      comment: false,
      author: null,
      authorOrg: null,
      revision: r.data,
      revisionNumber: r.revision
    }))
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime())
  const documentOrder = ["purchase_order", "invoice", "packing_list", "checklist", "carton_label", "shipping_label"]
  const documentGroups = [
    { key: "order", title: null, shipmentId: null },
    ...(seesShipments ? shipmentRows : []).map((shipment, index) => ({
      key: shipment.id,
      title: t("detail.shipment", { number: index + 1 }),
      shipmentId: shipment.id
    }))
  ].flatMap((group) => {
    const documents = workflow.documents
      .filter((doc) => doc.downloadUrl && doc.shipmentId === group.shipmentId && documentOrder.includes(doc.kind))
      .toSorted(
        (a, b) =>
          documentOrder.indexOf(a.kind) - documentOrder.indexOf(b.kind) ||
          (a.cartonId ?? a.name).localeCompare(b.cartonId ?? b.name, undefined, { numeric: true })
      )
      .filter((doc) => prices || !["purchase_order", "invoice"].includes(doc.kind))
    return documents.length ? [{ ...group, documents }] : []
  })
  const prep = sharedPrep(order.data)
  const leg = forwarderLeg(order.data) ? args.leg : undefined
  const text = await requirementTranslator()
  const instructions = [...(prep ? [{ code: "prep" as const, prep }] : []), ...destinationRequirements(order.data)].map(
    text.requirement
  )
  const units = order.data.items.reduce((n, item) => n + item.pieces, 0)
  const subtotal = order.data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0)
  const place = (addressId: string | undefined) => args.places.find((candidate) => candidate.id === addressId)?.name
  const stop = order.data.via && [leg?.name, place(order.data.via.addressId)].filter(Boolean).join(", ")
  let noteLabel = t("detail.noteToSupplier")
  if (kind === "supplier") {
    noteLabel = args.buyerName ? t("detail.noteFrom", { buyer: args.buyerName }) : t("detail.buyersNote")
  }

  return (
    <OrderPageView
      page={{
        view: "order" as const,
        data: {
          s: { org: { kind, name: workspaces[kind].name }, user: { name: person.name, email: person.email } },
          id,
          editsOrder,
          seesShipments,
          editsShipments,
          prices,
          order: {
            id: order.id,
            status: order.status,
            revision: order.revision,
            data: prices ? order.data : unpricedOrder(order.data)
          },
          supplier: { id: supplier.id, name: supplier.name, supplierOrgId: supplier.supplierOrgId },
          status,
          changeable: proposals.changeable,
          proposal:
            proposal && args.changes
              ? {
                  id: proposal.id,
                  status: proposal.status,
                  note: proposal.data.note,
                  reason: proposal.reason,
                  changes: prices ? args.changes : unpricedChanges(args.changes)
                }
              : null,
          remainingItems: workflow.items.map((row) => ({ itemId: row.itemId, remainingPieces: row.remainingPieces })),
          editable,
          remaining,
          currency,
          landedTotal: prices ? landedTotal : 0,
          markup: prices ? markup : 0,
          buyer,
          labels: labels.map((label) =>
            label.state === "uploaded" ? { itemId: label.itemId, state: label.state, name: label.name } : label
          ),
          timeline: timeline.map((entry) => ({
            ...entry,
            visibility: "shared" as const,
            revision: entry.revision && !prices ? unpricedOrder(entry.revision) : entry.revision
          })),
          documentGroups: documentGroups.map((group) => ({
            ...group,
            documents: group.documents.map((doc) => ({
              id: doc.id,
              name: doc.name,
              kind: doc.kind,
              cartonId: doc.cartonId
            }))
          })),
          leg,
          instructions,
          units,
          subtotal: prices ? subtotal : 0,
          places: args.places,
          stop,
          noteLabel,
          timeZone: "America/Los_Angeles",
          instructionsByItem: Object.fromEntries(
            order.data.items.map((item) => [
              item.id,
              itemRequirements(item, order.data.destination, prep)
                .filter((requirement) => requirement.code !== "packFor")
                .map(text.requirement)
            ])
          ),
          shipmentRows: shipmentRows.map((row) => ({
            id: row.id,
            status: row.status,
            amazonNetwork: row.amazonNetwork,
            amazonShipmentId: row.amazonShipmentId,
            cartonCount: row.packingDraft?.cartons?.length ?? row.packing?.cartons.length ?? 0
          })),
          freight: prices ? freight.map((row) => ({ reference: row.reference, amount: row.freightMinor })) : [],
          landed: prices
            ? landed.map((cost) => ({
                id: cost.id,
                kind: landedCostKinds[cost.kind],
                description: cost.description,
                amount: cost.amountMinor
              }))
            : []
        }
      }}
    />
  )
}

const [tote, apron, basket] = orderData.items
const sent = orderRecord({
  data: {
    ...orderData,
    notes: "Please use the recycled polybags.",
    dueDate: "2026-11-15",
    items: [tote!, apron!, { ...basket!, supplierSku: "" }]
  }
})
const packing = shipmentRecord({ status: "packing", packingDraft: packed(2) })
const shipped = shipmentRecord({ status: "shipped", packing: packed(3), amazonShipmentId: "FBA17XK2" })
const remainingAll = orderData.items.map((item) => ({ itemId: item.id, remainingPieces: item.pieces }))
const purchaseOrderDocument = documentRecord({ kind: "purchase_order", name: "PO-1042.pdf" })
const packingList = documentRecord({ kind: "packing_list", name: "Packing list.pdf", shipmentId: packing.id })
const invoice = documentRecord({ kind: "invoice", name: "Lotus invoice 118.pdf", shipmentId: packing.id })
const workflowDocument = (doc: typeof purchaseOrderDocument) => ({
  id: doc.id,
  name: doc.name,
  kind: doc.kind,
  shipmentId: doc.shipmentId,
  cartonId: doc.cartonId,
  itemId: doc.itemId,
  downloadUrl: `/api/documents/${doc.id}`
})

// The supplier's pending changes: more totes at a lower price, the basket dropped, a jute tote added, and new terms.
const proposal: typeof orderProposals.$inferSelect = {
  id: "7a8b9c0d-1e2f-4a3b-8c4d-000000000001",
  orderId,
  baseRevision: 1,
  status: "pending",
  data: {
    lines: [
      { itemId: tote!.id, supplierSku: tote!.supplierSku, title: "Canvas tote bag", pieces: 300, unitPrice: 410 },
      { itemId: apron!.id, supplierSku: apron!.supplierSku, title: "Linen apron", pieces: 120, unitPrice: 890 },
      { supplierSku: "LM-JUTE", title: "Jute tote", pieces: 100, unitPrice: 500 }
    ],
    paymentTerms: "Net 45",
    readyDate: null,
    note: "The basket is discontinued; the jute tote replaces it."
  },
  proposedBy: "user_supplier",
  decidedBy: null,
  decidedAt: null,
  reason: null,
  createdAt: new Date()
}
const changes: ReturnType<typeof proposalChanges> = {
  lines: [
    {
      key: tote!.id,
      name: "Canvas tote bag / Natural",
      supplierSku: tote!.supplierSku,
      change: "changed",
      before: { pieces: 240, unitPrice: 425 },
      after: { pieces: 300, unitPrice: 410 }
    },
    {
      key: apron!.id,
      name: "Linen apron / Charcoal",
      supplierSku: apron!.supplierSku,
      change: "same",
      before: { pieces: 120, unitPrice: 890 },
      after: { pieces: 120, unitPrice: 890 }
    },
    {
      key: "LM-JUTE",
      name: "Jute tote",
      supplierSku: "LM-JUTE",
      change: "added",
      before: null,
      after: { pieces: 100, unitPrice: 500 }
    },
    {
      key: basket!.id,
      name: "Market basket / Large",
      supplierSku: basket!.supplierSku,
      change: "removed",
      before: { pieces: 60, unitPrice: 1450 },
      after: null
    }
  ],
  paymentTerms: { before: "Net 30", after: "Net 45" },
  readyDate: null,
  total: { before: 295_800, after: 279_800 }
}

// The landed costs recorded on it, as the database keeps them.
const landed: Args["landed"] = [
  { id: landedCosts[0]!.id, kind: "freight", description: landedCosts[0]!.description, amountMinor: 42_000 },
  { id: landedCosts[1]!.id, kind: "duty", description: "", amountMinor: 18_550 }
]

// The page for a workspace of `kind`, for someone with `permissions`.
function page(kind: Args["kind"], permissions: Permissions = owner) {
  const story = pageStory(`/orders/${orderId}`, OrderPage, kind)
  return { loaders: story.loaders, decorators: story.decorators, parameters: { ...story.parameters, permissions } }
}

const actions = fn()
const answered = fn()

const meta = preview.meta({
  title: "Pages/Purchase orders/Detail",
  // Each story shows it in its workspace's portal; the render is the same for all.
  render: pageStory(`/orders/${orderId}`, OrderPage).render,
  args: {
    kind: "buyer",
    permissions: owner,
    order: sent,
    supplier: supplierRecord(),
    shipments: [packing],
    history,
    revisions,
    workflow: {
      items: remainingAll.map((row) => (row.itemId === tote!.id ? { ...row, remainingPieces: 160 } : row)),
      shipments: [{ editable: true }],
      documents: [purchaseOrderDocument, packingList, invoice].map(workflowDocument)
    },
    proposals: { latest: null, changeable: true },
    changes: null,
    landed,
    freight: [{ reference: "FBA17XK2", freightMinor: 31_000 }],
    labels: [
      { itemId: tote!.id, state: "uploaded", name: "tote.pdf", objectKey: "labels/tote.pdf" },
      {
        itemId: apron!.id,
        state: "missing",
        problem: "Its FNSKU is looked up when the purchase order is sent",
        problemKey: "fnskuLookedUpOnSend"
      },
      { itemId: basket!.id, state: "none" }
    ],
    places: [{ id: deliveryId, name: "Oakland warehouse" }]
  } satisfies Args,
  beforeEach: ({ msw }) => {
    msw.use(
      actionHandler(actions),
      http.post("/api/proposals/:id", async ({ params, request }) => {
        answered(params.id, await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

// A sent purchase order being packed, as the buyer's owner sees it.
export const Sent = meta.story({
  ...page("buyer"),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "PO-1042" })).toBeVisible()
    // The lines are the app's shared table, with its header band, as the forwarder's view of them is.
    await expect(canvasElement.querySelector("[data-slot=table-header]")).toHaveTextContent("Products")
    await expect(canvas.getByText("With supplier", { selector: "[data-slot=badge], span" })).toBeVisible()
    await expect(canvas.getByText("Oakland warehouse")).toBeVisible()
    await expect(canvas.getByText("160 to ship")).toBeVisible()
    // A line without a supplier SKU says so.
    await expect(canvas.getByText("Not set")).toBeVisible()
    // The header hides where the lines stack, as they do in a narrow window.
    await expect(canvas.getByRole("columnheader", { name: "Cost", hidden: true })).toBeInTheDocument()
    await expect(canvas.getAllByText("$2,958").length).toBeGreaterThan(0)
    await expect(canvas.getByText("Nov 15, 2026")).toBeVisible()
    await expect(canvas.getByText("Please use the recycled polybags.", { selector: "p" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "About landed costs" })).toBeVisible()
    await expect(canvas.getByRole("heading", { name: "Timeline" })).toBeVisible()
    await expect(canvas.getByText("Purchase order submitted to supplier")).toBeVisible()
    // Shipment 1 opens its page.
    await expect(canvas.getByRole("link", { name: /Shipment 1/ })).toHaveAttribute("href", `/shipments/${packing.id}`)
    await expect(canvas.getByText("Cartons in preparation, 2 cartons")).toBeVisible()
    const documents = within(canvas.getByText("Documents").closest("[data-slot=card]")!)
    await expect(documents.getAllByRole("link")).toHaveLength(3)
    // The apron's label can't be made yet.
    await expect(
      canvas.getByLabelText(
        "No label for Linen apron / Charcoal: Its FNSKU is looked up when the purchase order is sent"
      )
    ).toBeVisible()

    await userEvent.click(canvas.getByRole("button", { name: "Continue packing" }))
    await waitFor(() => expect(actions).toHaveBeenCalledWith({ action: "shipment.create", data: { id: orderId } }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

// A draft: Submit to supplier sends it, and it can be edited or deleted.
export const Draft = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ status: "draft" }),
    shipments: [],
    workflow: { items: remainingAll, shipments: [], documents: [] },
    landed: [],
    freight: []
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shipments start once the purchase order is sent.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit" })).toHaveAttribute("href", `/orders/${orderId}/edit`)
    await expect(canvas.queryByText("Documents")).toBeNull()
    await expect(canvas.getByText("No costs yet")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    await expect(await screen.findByRole("menuitem", { name: "Delete draft" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    await userEvent.click(canvas.getByRole("button", { name: "Submit to supplier" }))
    await waitFor(() =>
      expect(actions).toHaveBeenCalledWith({ action: "order.submit", data: { id: orderId, revision: 1 } })
    )
  }
})

export const AmazonShipmentGroups = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({
      status: "draft",
      data: {
        ...orderData,
        destination: "amazon",
        deliveryId: undefined,
        items: orderData.items.map((item, index) => ({ ...item, amazonNetwork: index === 0 ? "awd_us" : "fba" }))
      }
    }),
    shipments: [],
    workflow: { items: remainingAll, shipments: [], documents: [] }
  },
  play: async ({ canvas }) => {
    const awdToggle = canvas.getByRole("button", { name: /AWD US shipment/ })
    const awd = within(awdToggle.closest("[data-slot=collapsible]")!)
    const fba = within(canvas.getByRole("button", { name: /FBA shipment/ }).closest("[data-slot=collapsible]")!)
    await expect(awd.getByText("Canvas tote bag")).toBeVisible()
    await expect(awdToggle).toHaveTextContent(money(orderData.items[0]!.pieces * orderData.items[0]!.unitPrice, "USD"))
    await expect(awd.queryByText("Linen apron")).toBeNull()
    await expect(fba.getByText("Linen apron")).toBeVisible()
    await expect(fba.getByText("Market basket")).toBeVisible()
    await expect(canvas.queryByText(/^Pack for (FBA|AWD US)/)).toBeNull()
    await userEvent.click(awdToggle)
    await expect(awd.getByText("Canvas tote bag")).not.toBeVisible()
    await userEvent.click(awdToggle)
    await expect(awd.getByText("Canvas tote bag")).toBeVisible()
  }
})

// A draft to a supplier that isn't on Copacker: the buyer sends it and enters the supplier's side.
export const DraftOffCopacker = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ status: "draft" }),
    supplier: supplierRecord({ supplierOrgId: null }),
    shipments: [],
    workflow: { items: remainingAll, shipments: [], documents: [] }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing isn’t on Copacker")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Send purchase order" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Submit to supplier" })).toBeNull()
  }
})

// The supplier proposed changes: the buyer reviews them before any more packing.
export const ChangesProposed = meta.story({
  ...page("buyer"),
  args: { proposals: { latest: proposal, changeable: true }, changes },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Lotus Manufacturing proposed changes")).toBeVisible()
    await expect(canvas.getByText("The basket is discontinued; the jute tote replaces it.")).toBeVisible()
    await expect(canvas.getByText("Jute tote")).toBeVisible()
    await expect(canvas.getByText("1 unchanged")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Continue packing" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Approve changes" }))
    await waitFor(() => expect(answered).toHaveBeenCalledWith(proposal.id, expect.anything()))
  }
})

// PO-1042 by way of Bayline Freight's Ningbo warehouse, all of it shipped by the supplier.
const forwarded = {
  order: orderRecord({ data: { ...orderData, via: { forwarderId, addressId: stopId } } }),
  shipments: [shipped],
  workflow: {
    items: orderData.items.map((item) => ({ itemId: item.id, remainingPieces: 0 })),
    shipments: [{ editable: false }],
    documents: []
  },
  places: [
    { id: deliveryId, name: "Oakland warehouse" },
    { id: stopId, name: "Ningbo warehouse" }
  ]
} satisfies Partial<Args>

// Shipped through a forwarder that isn't on Copacker, to an address the buyer saved for it: the buyer ships its leg on.
export const ShipOnFromForwarder = meta.story({
  ...page("buyer"),
  args: { ...forwarded, leg: { name: "Bayline Freight", forwarderOrgId: null } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline Freight, Ningbo warehouse")).toBeVisible()
    await expect(canvas.getByText("FBA17XK2, 3 cartons")).toBeVisible()
    // Everything is assigned, so there's no next shipment to prepare.
    await expect(canvas.queryByRole("button", { name: "Prepare next shipment" })).toBeNull()
    await expect(canvas.getAllByText("0 to ship")).toHaveLength(3)
    await userEvent.click(canvas.getByRole("button", { name: "Mark shipped" }))
    await expect(await screen.findByRole("dialog", { name: "Mark shipped" })).toBeInTheDocument()
  }
})

// Shipped through a forwarder that has joined Copacker, to one of its own addresses: the stop still goes by the
// forwarder's name, and the forwarder ships its leg on itself.
export const JoinedForwarder = meta.story({
  ...page("buyer"),
  args: { ...forwarded, leg: { name: "Bayline Freight", forwarderOrgId: workspaces.forwarder.id } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Bayline Freight, Ningbo warehouse")).toBeVisible()
    await expect(canvas.getByText("Oakland warehouse")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Mark shipped" })).toBeNull()
  }
})

export const Closed = meta.story({
  ...page("buyer"),
  args: {
    order: orderRecord({ status: "closed" }),
    shipments: [{ ...shipped, status: "received" }],
    workflow: {
      items: orderData.items.map((item) => ({ itemId: item.id, remainingPieces: 0 })),
      shipments: [{ editable: false }],
      documents: []
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Closed").length).toBeGreaterThan(0)
    await expect(canvas.getByText("Received")).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Continue packing|Prepare next shipment/ })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "More actions for PO-1042" }))
    await expect(screen.queryByRole("menuitem", { name: "Close purchase order" })).toBeNull()
  }
})

// A member who views purchase orders and shipments without prices: no costs, no buttons, no priced documents.
export const MemberWithoutPrices = meta.story({
  ...page("buyer", member),
  args: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("columnheader", { name: "Cost", hidden: true })).toBeNull()
    await expect(canvas.queryByText("Cost summary")).toBeNull()
    await expect(canvas.queryByText("Landed costs")).toBeNull()
    await expect(canvas.queryByText(/\$/)).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Continue packing" })).toBeNull()
    const documents = within(canvas.getByText("Documents").closest("[data-slot=card]")!)
    await expect(documents.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "Download Packing list Packing list.pdf"
    ])
  }
})

// A member without Shipments sees each shipment without its link or documents.
export const MemberWithoutShipments = meta.story({
  ...page("buyer", { role: "member", access: { orders: "view" } }),
  args: { permissions: { role: "member", access: { orders: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shipment 1")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: /Shipment 1/ })).toBeNull()
    await expect(canvas.queryByText("Documents")).toBeNull()
  }
})

// The supplier's side: where its shipment stands, the buyer's note, and changes it can propose.
export const Supplier = meta.story({
  ...page("supplier"),
  args: { kind: "supplier", buyerName: "Harbor Goods" },
  play: async ({ canvas }) => {
    const breadcrumb = within(canvas.getByRole("navigation", { name: "Breadcrumb" }))
    await expect(breadcrumb.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders")
    // The header shows its latest shipment's status, as the supplier's list does.
    await expect(canvas.getAllByText("Packing")).toHaveLength(2)
    await expect(canvas.getByText("Note from Harbor Goods")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit order" })).toHaveAttribute(
      "href",
      `/orders/${orderId}/revise`
    )
    await expect(canvas.getByRole("button", { name: "Continue packing" })).toBeVisible()
    await expect(canvas.queryByText("Landed costs")).toBeNull()
    await expect(canvas.queryByText(/isn’t on Copacker/)).toBeNull()
  }
})

// The buyer declined the supplier's changes: the supplier sees why, and can propose again.
export const SupplierChangesDeclined = meta.story({
  ...page("supplier"),
  args: {
    kind: "supplier",
    proposals: {
      latest: { ...proposal, status: "declined", reason: "We still need the baskets." },
      changeable: true
    },
    changes
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Your proposed changes")).toBeVisible()
    await expect(canvas.getByText("Declined")).toBeVisible()
    await expect(canvas.getByText("Reason: We still need the baskets.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Edit order" })).toBeVisible()
    // The note is the buyer's, unnamed without its workspace.
    await expect(canvas.getByText("Buyer’s note")).toBeVisible()
  }
})

// A forwarder opens the purchase order its goods pass through.
export const Forwarder = meta.story({
  ...page("forwarder"),
  args: {
    kind: "forwarder",
    order: orderRecord({ data: { ...orderData, via: { forwarderId, addressId: stopId } } }),
    leg: { name: "Bayline Freight", forwarderOrgId: workspaces.forwarder.id }
  },
  parameters: { db: { contacts: [warehouse, forwarderWarehouse], shipments: [shipped], documents: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "PO-1042" })).toBeVisible()
    await expect(canvas.getByText("Bayline Freight, Ningbo warehouse")).toBeVisible()
    await expect(canvas.queryByText(/\$/)).toBeNull()
    await expect(canvas.queryByRole("heading", { name: "Timeline" })).toBeNull()
    await expect(canvas.getByRole("button", { name: "Mark shipped" })).toBeVisible()
  }
})
