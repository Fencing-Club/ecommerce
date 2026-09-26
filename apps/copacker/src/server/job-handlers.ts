import { buildAwdRequest } from "@repo/aisle"
import { downloadAmazonLabels } from "@repo/aisle/amazon"
import { matchLabels, splitPdfPages, unpackLabels } from "@repo/aisle/labels"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index"
import { shipments, orders, orderRevisions } from "../db/schema"
import { amazonFor, shopifyFor } from "./connections"
import { generatePo, generateShipmentDocuments, storeDocument } from "./documents"
import { appUrl } from "./security"

export class PollAgain extends Error {}
export async function amazonJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  await assertOwned()
  const { shipmentId, revision } = z.object({ shipmentId: z.uuid(), revision: z.number() }).parse(payload)
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, shipmentId))
  if (!shipment || shipment.revision !== revision || !["queued", "creating"].includes(shipment.status)) {
    return
  }
  if (!shipment.packing || !shipment.snapshot) {
    throw new Error("Shipment data is missing")
  }
  const claimed = await db()
    .update(shipments)
    .set({ status: "creating" })
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.revision, revision),
        inArray(shipments.status, ["queued", "creating"])
      )
    )
    .returning({ id: shipments.id })
  if (claimed.length !== 1) {
    return
  }
  const [order] = await db().select().from(orders).where(eq(orders.id, shipment.orderId))
  if (!order) {
    throw new Error("PO is missing")
  }
  const api = await amazonFor(order.buyerOrgId, order.amazonSellerId),
    request = buildAwdRequest(shipment.snapshot, shipment.packing, `copacker-${shipment.id}-${revision}`)
  let orderId = shipment.amazonOrderId
  if (!orderId) {
    if (shipment.operation === "sending") {
      throw new Error("Amazon create outcome is unknown. Reconcile the existing order before retrying")
    }
    await api.eligibility(request.packagesToInbound)
    await assertOwned()
    const dispatch = await db()
      .update(shipments)
      .set({ status: "creating", operation: "sending" })
      .where(
        and(
          eq(shipments.id, shipmentId),
          eq(shipments.revision, revision),
          eq(shipments.status, "creating"),
          eq(shipments.operation, "none"),
          isNull(shipments.amazonOrderId)
        )
      )
      .returning({ id: shipments.id })
    if (dispatch.length !== 1) {
      throw new Error("Amazon creation is already in progress. Reconcile before retrying")
    }
    const result = await api.create(request)
    orderId = result.orderId
    await db()
      .update(shipments)
      .set({ amazonOrderId: orderId, operation: "created" })
      .where(eq(shipments.id, shipmentId))
  }
  await assertOwned()
  const remote = await api.order(orderId)
  if (remote.externalReferenceId !== request.externalReferenceId) {
    throw new Error("Amazon order reference does not match this shipment")
  }
  const signature = (packages: typeof request.packagesToInbound | typeof remote.packagesToInbound) =>
    JSON.stringify(
      packages
        .map((p) => [
          p.count,
          p.distributionPackage.contents.products.map((i) => [i.sku, i.quantity]),
          p.distributionPackage.measurements
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    )
  if (signature(request.packagesToInbound) !== signature(remote.packagesToInbound)) {
    throw new Error("Amazon carton contents do not match the approved packing list")
  }
  for (const [key, value] of Object.entries(request.originAddress)) {
    if (value && remote.originAddress[key] !== value) {
      throw new Error("Amazon origin does not match the shipment")
    }
  }
  if (remote.orderStatus === "VALIDATING") {
    throw new PollAgain("Amazon is validating cartons")
  }
  if (remote.orderStatus === "DRAFT") {
    await assertOwned()
    await api.confirm(orderId)
    throw new PollAgain("Amazon shipment confirmation is processing")
  }
  if (remote.orderStatus !== "CONFIRMED" || !remote.destinationDetails?.shipmentId) {
    throw new Error(`Amazon order requires review: ${remote.orderStatus}`)
  }
  const amazonShipmentId = remote.destinationDetails.shipmentId
  await db().update(shipments).set({ amazonShipmentId, operation: "confirmed" }).where(eq(shipments.id, shipmentId))
  const labelResponse = await api.labels(amazonShipmentId)
  if (labelResponse.labelStatus === "GENERATION_FAILED") {
    throw new Error("Amazon could not generate carton labels")
  }
  if (labelResponse.labelStatus !== "GENERATED" || !labelResponse.labelDownloadURL) {
    throw new PollAgain("Amazon carton labels are generating")
  }
  await assertOwned()
  const files = await unpackLabels(await downloadAmazonLabels(labelResponse.labelDownloadURL))
  const labels = await matchLabels(files, shipment.snapshot, shipment.packing)
  for (const file of files) {
    const pages = await splitPdfPages(file.data)
    for (const label of labels.filter((l) => l.file === file.name)) {
      const bytes = pages.find((p) => p.page === label.page)!.data
      await assertOwned()
      await storeDocument(
        {
          orderId: shipment.orderId,
          shipmentId,
          kind: "carton_label",
          cartonId: label.cartonId,
          name: `Carton ${label.cartonId} - ${label.sscc}.pdf`,
          orderRevision: shipment.orderRevision,
          shipmentRevision: revision,
          uploadedBy: "amazon"
        },
        bytes
      )
    }
  }
  await db()
    .update(shipments)
    .set({ labels, operation: "complete", issue: null, updatedAt: new Date() })
    .where(eq(shipments.id, shipmentId))
  await assertOwned()
  await generateShipmentDocuments(shipmentId)
  await assertOwned()
  await db().update(shipments).set({ status: "waiting_labels" }).where(eq(shipments.id, shipmentId))
}

export async function emailJob(payload: Record<string, unknown>, key: string, assertOwned: () => Promise<void>) {
  if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Email sender is not configured")
  }
  const input = z
    .object({
      type: z.enum(["invite", "team", "po", "ready", "data_request"]),
      to: z.email(),
      orderId: z.uuid().optional(),
      revision: z.number().int().positive().optional(),
      shipmentId: z.uuid().optional(),
      invitation: z.string().optional(),
      name: z.string().optional(),
      shop: z.string().optional(),
      requestId: z.number().int().optional(),
      orders: z.array(z.string()).max(1000).optional()
    })
    .parse(payload)
  const attachments: Array<{ filename: string; content: string }> = []
  let subject: string, text: string
  if (input.type === "invite" || input.type === "team") {
    subject = `${input.name ?? "A buyer"} invited you to Copacker`
    text = `Sign in with ${input.to}, then accept this invitation to manage purchase orders and shipments: ${appUrl()}/invite?token=${input.invitation}&kind=${input.type}`
  } else if (input.type === "po") {
    const po = await generatePo(input.orderId!, input.revision)
    subject = `New purchase order: ${po.doc.name.replace(/\.pdf$/, "")}`
    text = `Your purchase order is attached. Upload your official commercial invoice and enter the carton details and pickup readiness date at ${appUrl()}/orders/${input.orderId}`
    attachments.push({ filename: po.doc.name, content: Buffer.from(po.bytes).toString("base64") })
  } else if (input.type === "data_request") {
    subject = `Customer data request for ${input.shop}`
    const held = input.orders?.length
      ? `For the orders in the request, Copacker stores only the order details it uses to plan restocks:\n\n${input.orders.join("\n")}`
      : "Copacker doesn't hold any of the orders in the request."
    text = [
      `Shopify sent Copacker a customer data request (request ${input.requestId}) for ${input.shop}.`,
      "Copacker doesn't store customers' names, email addresses, phone numbers, or mailing addresses.",
      held,
      "Include this information in your response to the customer."
    ].join("\n\n")
  } else {
    subject = "Your shipment labels are ready"
    text = `Open your shipment to print the labels and Packing Checklist: ${appUrl()}/shipments/${input.shipmentId}`
  }
  await assertOwned()
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
      "content-type": "application/json",
      "Idempotency-Key": key
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject, text, attachments }),
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new Error(`Email provider rejected delivery (${response.status})`)
  }
}
export async function shopifyJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  await assertOwned()
  const input = z
    .object({
      orgId: z.uuid(),
      orderId: z.uuid(),
      revision: z.number(),
      changes: z.array(z.object({ itemId: z.uuid(), supplierSku: z.string(), unitPrice: z.number() })),
      updateCost: z.boolean()
    })
    .parse(payload)
  const [record] = await db()
    .select()
    .from(orderRevisions)
    .where(and(eq(orderRevisions.orderId, input.orderId), eq(orderRevisions.revision, input.revision)))
  if (!record) {
    throw new Error("Approved PO revision is unavailable")
  }
  const [currentOrder] = await db().select().from(orders).where(eq(orders.id, input.orderId))
  if (!currentOrder || currentOrder.buyerOrgId !== input.orgId) {
    throw new Error("PO account mismatch")
  }
  if (currentOrder.revision !== input.revision) {
    return
  }
  const api = await shopifyFor(input.orgId, currentOrder.shopifyDomain)
  const catalog = await api.variants(record.data.items.map((i) => i.variantId))
  for (const change of input.changes) {
    const item = record.data.items.find((i) => i.id === change.itemId)!
    const product = catalog.find((p) => p?.id === item.variantId)
    if (!product || product.sku !== item.buyerSku) {
      throw new Error("Shopify product identity has changed")
    }
    if (input.updateCost && product.inventoryItem.unitCost?.currencyCode !== record.data.currency) {
      throw new Error("Shopify unit cost currency differs from the PO. No currency conversion is applied")
    }
  }
  for (const change of input.changes) {
    const item = record.data.items.find((i) => i.id === change.itemId)!
    await assertOwned()
    await api.supplierSku(item.variantId, change.supplierSku)
    if (input.updateCost) {
      await assertOwned()
      await api.unitCost(item.inventoryItemId, change.unitPrice * item.piecesPerSet)
    }
  }
}
