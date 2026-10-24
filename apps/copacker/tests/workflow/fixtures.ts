import { randomUUID } from "node:crypto"
import { type Address, orderInputSchema } from "@repo/copacker-orders"
import { buildAwdRequest, packingSchema } from "@repo/copacker-shipments"
import { defaultShipmentRoute, type ShipmentRoute } from "@repo/copacker-shipments/route"
import { and, eq } from "drizzle-orm"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { afterEach, beforeEach, vi } from "vitest"
import * as tables from "../../src/db/schema"
import { importProposalSchema } from "../../src/lib/import-proposal"
import { acceptForwarderInvitation } from "../../src/server/forwarders"
import { POST as postAction } from "../../src/server/http/api/action"
import { POST as postDocument } from "../../src/server/http/api/documents"
import { POST as postCarrierLabelsHandler } from "../../src/server/http/api/shipments/$id/carrier-labels"
import { prepareAmazonShipment, submitPacking } from "../../src/server/orders"
import { hash } from "../../src/server/security"
import { orderWorkflow } from "../../src/server/workflow"
import type { Session } from "../../src/server/workspace-session"
import { provider } from "../mocks/providers"
import { served } from "../served"
import { database, setUpTestDatabase } from "../test-db"
import { signedIn, testSession } from "../test-session"

// The routes as Start serves them, through the HTTP boundary that answers their failures.
const action = served(postAction)
const upload = served(postDocument)
const postCarrierLabels = served(postCarrierLabelsHandler)

// What the workflow tests share: the workspaces and PO each test starts from, and builders for the shipments, imports,
// uploads and labels they work with. The mocked modules they use are in tests/mocks/providers.ts.
export const buyerId = randomUUID(),
  supplierId = randomUUID(),
  otherId = randomUUID(),
  supplierLinkId = randomUUID(),
  orderId = randomUUID(),
  itemId = randomUUID()
// A week from now: finishing packing needs a ready date of today or later.
export const readyDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
export const orderData = orderInputSchema.parse({
  supplierId: supplierLinkId,
  reference: "PO-TEST",
  currency: "USD",
  dueDate: "2026-10-20",
  items: [
    {
      id: itemId,
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      name: "Foil body cord",
      variant: "Two-pack",
      buyerSku: "foil-2",
      supplierSku: "B-2",
      asin: "B000000001",
      fnsku: "X000000001",
      pieces: 160,
      piecesPerSet: 2,
      unitPrice: 210,
      receiver: "awd_us"
    }
  ]
})
// A PO's lines sent to the buyer's own location instead.
export const warehouseLines = <T extends { receiver: string }>(items: T[]) =>
  items.map((item) => ({ ...item, receiver: "warehouse" as const }))
export const actor = (kind: Session["org"]["kind"], id: string) => testSession({ orgId: id, kind, name: "Test org" })
export const buyer = actor("buyer", buyerId),
  supplier = actor("supplier", supplierId)

// The database, mocks and workspaces every workflow test starts from: a buyer with a sent PO to its supplier, and an
// unrelated buyer. Call it once per file.
export function setUpWorkflowTests() {
  setUpTestDatabase({ truncate: [tables.organizations, tables.jobs, tables.profiles] })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    vi.resetAllMocks()
    signedIn.actor = buyer
    provider.amazonFor.mockResolvedValue(provider.api)
    provider.api.metafieldValues.mockResolvedValue([])
    provider.api.salesMarketplaces.mockResolvedValue(["ATVPDKIKX0DER"])
    provider.api.fbaShipmentUnits.mockResolvedValue(null)
    provider.api.awdShipmentUnits.mockResolvedValue(null)
    // Amazon's record of how the test SKUs are prepared: cords need none, and gloves are bagged and labeled by the same
    // party, the supplier.
    provider.api.prepDetails.mockResolvedValue(
      new Map([
        ["foil-2", { prepCategory: "NONE", prepOwnerConstraint: "NONE_ONLY", labelOwnerConstraint: "SELLER_ONLY" }],
        [
          "glove-6",
          {
            prepCategory: "FC_PROVIDED",
            prepOwnerConstraint: "SELLER_ONLY",
            labelOwnerConstraint: "SELLER_ONLY",
            allOwnersConstraint: "MUST_MATCH"
          }
        ]
      ])
    )
    await database.insert(tables.organizations).values([
      { id: buyerId, name: "Buyer", kind: "buyer" },
      { id: supplierId, name: "Supplier", kind: "supplier" },
      { id: otherId, name: "Unrelated", kind: "buyer" }
    ])
    await database.insert(tables.suppliers).values({
      id: supplierLinkId,
      buyerOrgId: buyerId,
      supplierOrgId: supplierId,
      name: "Supplier",
      email: "supplier@example.com"
    })
    await database.insert(tables.orders).values({
      id: orderId,
      buyerOrgId: buyerId,
      supplierId: supplierLinkId,
      shopifyDomain: "test.myshopify.com",
      amazonSellerId: "A123456789",
      status: "submitted",
      data: orderData
    })
    await database
      .insert(tables.orderRevisions)
      .values({ orderId, revision: 1, data: orderData, actor: buyer.user.id, reason: "created" })
  })
}

// A supplier product row with a product of its own, as imports and the product page make them.
export async function withGroup<T extends Omit<typeof tables.supplierProducts.$inferInsert, "groupId">>(values: T) {
  const [group] = await database
    .insert(tables.supplierProductGroups)
    .values({ supplierOrgId: values.supplierOrgId, title: values.title })
    .returning()
  return { ...values, groupId: group!.id }
}

// Routes as Save route keeps them: AGL from the supplier into Amazon, or a carrier the buyer books from the supplier,
// which puts a label on each carton.
export const routes = {
  agl: { stops: [{ kind: "supplier" }, { kind: "agl" }, { kind: "receiver" }], legs: [null, null] },
  parcel: { stops: [{ kind: "supplier" }, { kind: "receiver" }], legs: ["senderArranges"] }
} satisfies Record<string, ShipmentRoute>

// Saves a shipment's route as its stops, in place of any it had.
export async function saveStops(shipmentId: string, route: ShipmentRoute) {
  await database.delete(tables.shipmentStops).where(eq(tables.shipmentStops.shipmentId, shipmentId))
  await database.insert(tables.shipmentStops).values(
    route.stops.map((stop, position) => ({
      shipmentId,
      position,
      kind: stop.kind,
      forwarderId: stop.kind === "forwarder" ? stop.forwarderId : null,
      addressId: stop.kind === "forwarder" ? stop.addressId : null,
      leg: route.legs[position] ?? null
    }))
  )
}

// A shipment's stops, as kinds and legs.
export async function savedStops(shipmentId: string) {
  return database
    .select({ kind: tables.shipmentStops.kind, leg: tables.shipmentStops.leg })
    .from(tables.shipmentStops)
    .where(eq(tables.shipmentStops.shipmentId, shipmentId))
    .orderBy(tables.shipmentStops.position)
}

// Save route's input for a shipment that follows its PO's route: the buyer books a carrier for each leg.
export async function bookedRoute(shipmentId: string) {
  const [row] = await database
    .select({ snapshot: tables.shipments.snapshot })
    .from(tables.shipments)
    .where(eq(tables.shipments.id, shipmentId))
  const expected = defaultShipmentRoute(row!.snapshot!)
  return { expected, route: { ...expected, legs: expected.legs.map(() => "senderArranges" as const) } }
}

// A shipment being packed, whose buyer books a carrier from the supplier.
export async function preparation(pieces = 160) {
  const id = randomUUID(),
    invoiceId = randomUUID()
  await database.insert(tables.shipments).values({ id, orderId, orderRevision: 1, snapshot: orderData })
  await saveStops(id, routes.parcel)
  await database.insert(tables.documents).values({
    id: invoiceId,
    orderId,
    shipmentId: id,
    kind: "invoice",
    objectKey: `test/${invoiceId}`,
    name: "Invoice.pdf",
    bytes: 10,
    orderRevision: 1,
    shipmentRevision: 1,
    uploadedBy: supplier.user.id
  })
  const packing = packingSchema.parse({
    readyDate,
    origin: {
      name: "Supplier",
      addressLine1: "Road 1",
      city: "Shenzhen",
      stateOrRegion: "Guangdong",
      postalCode: "518000",
      countryCode: "CN",
      phoneNumber: "+86123456789",
      email: "supplier@example.com"
    },
    cartons: [{ cartonId: "A6", length: 50, width: 40, height: 30, weight: 15, items: [{ itemId, pieces }] }]
  })
  return { id, packing, invoiceId }
}
export async function reviewedImport() {
  const id = randomUUID()
  const proposal = importProposalSchema.parse({
    reference: "PO36",
    currency: "USD",
    documentTotal: "665.60",
    warnings: [],
    adjustments: [{ description: "Packing", amount: "12.80", sourcePage: 1 }],
    items: [
      {
        description: "Foil cord",
        sourceSku: "supplier-1",
        sourcePage: 1,
        sourceQuantity: 160,
        sourceUnit: "pieces",
        sourceUnitPrice: "4.08",
        sourceLineTotal: "652.80",
        selectedVariantId: orderData.items[0]!.variantId,
        candidateVariantIds: [],
        pieces: 160,
        piecesPerSet: 2,
        pricePerPiece: "4.08",
        reason: "Matched SKU",
        warnings: []
      }
    ]
  })
  await database.insert(tables.poImports).values({
    id,
    orgId: buyerId,
    createdBy: buyer.user.id,
    objectKey: `imports/${id}`,
    filename: "invoice.pdf",
    shopifyDomain: "test.myshopify.com",
    amazonSellerId: "A123456789",
    status: "review",
    proposal
  })
  provider.connection.mockImplementation(async (_orgId: string, kind: string) => ({
    externalId: kind === "shopify" ? "test.myshopify.com" : "A123456789"
  }))
  provider.shopifyFor.mockResolvedValue({
    variants: async () => [
      {
        id: orderData.items[0]!.variantId,
        sku: "foil-2",
        title: "Two-pack",
        product: { id: "gid://shopify/Product/1", title: "Verified foil cord" },
        inventoryItem: { id: orderData.items[0]!.inventoryItemId },
        supplierSku: { value: "B-2" },
        asin: { value: "B000000001" },
        // A two-pack is a Shopify bundle of two cords.
        requiresComponents: true,
        productVariantComponents: {
          nodes: [
            {
              quantity: 2,
              productVariant: { id: "gid://shopify/ProductVariant/99", sku: "foil", supplierSku: { value: "B-2" } }
            }
          ],
          pageInfo: { hasNextPage: false }
        }
      }
    ]
  })
  provider.api.listings.mockResolvedValue(new Map([["foil-2", { asin: "B000000001", fnsku: "X000000001" }]]))
  return {
    id,
    proposal,
    input: {
      revision: 1,
      reviewed: true,
      supplierId: supplierLinkId,
      destination: "amazon",
      reference: "PO36",
      dueDate: "2026-10-20"
    }
  }
}
export async function orderConnections() {
  await database.insert(tables.connections).values([
    { orgId: buyerId, provider: "shopify", externalId: "test.myshopify.com", encryptedToken: "test-only" },
    { orgId: buyerId, provider: "amazon", externalId: "A123456789", encryptedToken: "test-only" }
  ])
}

export async function queuedShipment() {
  const prepared = await preparation()
  await submitPacking(supplier, prepared.id, prepared.packing, 1)
  await prepareAmazonShipment(buyer, prepared.id, 1)
  const remote = {
    ...buildAwdRequest(orderData, prepared.packing, `copacker-${prepared.id}-1`),
    orderId: "STAR-EXAMPLE",
    orderStatus: "DRAFT"
  }
  provider.api.create.mockResolvedValue({ orderId: remote.orderId })
  provider.api.order.mockResolvedValue(remote)
  return { ...prepared, remote }
}
export async function retryDue() {
  await database.update(tables.jobs).set({ runAt: new Date(0) })
}
// Runs an action as the current actor.
export async function post(name: string, data: Record<string, unknown>) {
  return action(
    new Request("http://localhost:3000/api/action", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: name, data })
    })
  )
}

export async function orderConnectionsAmazonOnly() {
  await database
    .insert(tables.connections)
    .values({ orgId: buyerId, provider: "amazon", externalId: "A123456789", encryptedToken: "test-only" })
}

// A PDF of blank label-sized pages.
export async function blankPdf(pages: number, name = "Labels.pdf") {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    pdf.addPage([288, 432])
  }
  return new File([Buffer.from(await pdf.save())], name, { type: "application/pdf" })
}
export async function uploadPdf(kind: "invoice" | "product_label", pages = 1) {
  const form = new FormData()
  form.set("orderId", orderId)
  form.set("kind", kind)
  form.set("file", await blankPdf(pages))
  if (kind === "product_label") {
    form.set("itemId", itemId)
  }
  return upload(
    new Request("http://localhost:3000/api/documents", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: form
    })
  )
}
// A UPS tracking number as its label prints it, in groups, and as it's stored, without the spaces.
export const printed = (n: number) => `1Z 999 AA1 01 2345 678${n}`
export const trackingNumber = (n: number) => `1Z999AA1012345678${n}`
// Saves a shipment's carrier labels as the Upload carrier labels dialog does: carrier PDFs of the given page counts,
// and each carton's label, either a page of one of them or the label the carton already has.
export async function uploadCarrierLabels(shipmentId: string, labels: unknown[], files: number[] = [], revision = 1) {
  const form = new FormData()
  form.set("revision", String(revision))
  form.set("labels", JSON.stringify(labels))
  for (const [index, pages] of files.entries()) {
    form.append("file", await blankPdf(pages, `Carrier ${index + 1}.pdf`))
  }
  return postCarrierLabels(
    new Request(`http://localhost:3000/api/shipments/${shipmentId}/carrier-labels`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: form
    }),
    { params: { id: shipmentId } }
  )
}
// The current carrier labels of every shipment.
export async function carrierLabels() {
  return database
    .select()
    .from(tables.documents)
    .where(and(eq(tables.documents.kind, "shipping_label"), eq(tables.documents.outdated, false)))
}
// The shipment's status and what its packet still lacks, as the buyer sees them.
export async function shipmentState(id: string) {
  const shipment = (await orderWorkflow(buyer, orderId)).shipments.find((row) => row.id === id)!
  return { status: shipment.status, issues: shipment.issues.map((issue) => issue.code) }
}

// A page of Amazon's AWD carton labels, with its fields in the order the labels API gives them.
export async function amazonCartonLabels(fields: string[][]) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const page of fields) {
    const sheet = pdf.addPage([288, 432])
    page.forEach((text, index) => sheet.drawText(text, { x: 10, y: 400 - index * 20, size: 10, font }))
  }
  return pdf.save()
}

export const gloveId = randomUUID()
// A PO to FBA: the two-pack cords from the other tests, and single gloves.
export const fbaOrder = orderInputSchema.parse({
  ...orderData,
  items: [
    { ...orderData.items[0], receiver: "fba" },
    {
      receiver: "fba",
      id: gloveId,
      variantId: "gid://shopify/ProductVariant/2",
      inventoryItemId: "gid://shopify/InventoryItem/2",
      name: "Glove",
      variant: "6",
      buyerSku: "glove-6",
      supplierSku: "G-6",
      asin: "B000000002",
      fnsku: "X000000002",
      pieces: 10,
      piecesPerSet: 1,
      unitPrice: 900,
      prepCategory: "NO_PREP"
    }
  ]
})

// The forwarder joining Copacker: the test user makes a forwarder workspace, with any addresses it already keeps, and
// accepts the forwarder's invitation into it.
export async function joinForwarder(forwarderId: string, kept: Array<{ name: string; address: Address }> = []) {
  const forwarderOrg = randomUUID()
  await database.insert(tables.organizations).values({ id: forwarderOrg, name: "Yiwu Logistics", kind: "forwarder" })
  await database
    .insert(tables.memberships)
    .values({ orgId: forwarderOrg, userId: buyer.user.id, email: buyer.user.email, role: "owner" })
  if (kept.length) {
    await database
      .insert(tables.contacts)
      .values(kept.map((contact) => ({ ...contact, orgId: forwarderOrg, kind: "delivery" as const })))
  }
  await database
    .update(tables.forwarders)
    .set({
      email: buyer.user.email,
      invitationHash: hash("forwarder-invitation-test-token"),
      expiresAt: new Date(Date.now() + 86400000)
    })
    .where(eq(tables.forwarders.id, forwarderId))
  await acceptForwarderInvitation(buyer.user, forwarderOrg, "forwarder-invitation-test-token")
  return forwarderOrg
}
