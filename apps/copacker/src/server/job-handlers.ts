import { buildAwdRequest, money, orderTotal } from "@repo/aisle"
import { downloadAmazonLabels } from "@repo/aisle/amazon"
import { matchLabels, splitPdfPages, unpackLabels } from "@repo/aisle/labels"
import type { Email } from "@repo/copacker-emails"
import {
  customerDataRequestEmail,
  invitationEmail,
  labelsReadyEmail,
  purchaseOrderEmail,
  shownLines
} from "@repo/copacker-emails"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index"
import { shipments, orders, orderRevisions, organizations, memberships, profiles } from "../db/schema"
import type { Locale } from "../i18n/locales"
import { defaultLocale, isLocale } from "../i18n/locales"
import { translatorFor } from "../i18n/translator"
import { amazonFor, shopifyFor } from "./connections"
import { filedPo, generateShipmentDocuments, shipmentDestination, storeDocument } from "./documents"
import { sendEmail } from "./email"
import { amazonPacking, amazonReference, createOnce, fbaShipmentJob } from "./fba-shipments"
import { saveSupplierSkus } from "./product-fields"
import { appUrl } from "./security"

// A job that isn't finished and should run again: after `delayMs` (30 seconds unless given), with `payload` replacing
// its payload when given, such as where to resume. A job that got further this run sets `progressed`, so the limit on
// retries counts only runs that made no headway.
export class PollAgain extends Error {
  constructor(
    message: string,
    readonly options: { delayMs?: number; payload?: Record<string, unknown>; progressed?: boolean } = {}
  ) {
    super(message)
  }
}
export async function amazonJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  await assertOwned()
  const input = z
    .object({ shipmentId: z.uuid(), revision: z.number(), operationId: z.string().optional() })
    .parse(payload)
  const { shipmentId, revision } = input
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
    throw new Error("Purchase order is missing")
  }
  const api = await amazonFor(order.buyerOrgId, order.amazonSellerId)
  const packing = await amazonPacking(order.buyerOrgId, shipment.snapshot, shipment.packing)
  if (shipment.amazonNetwork === "fba") {
    await fbaShipmentJob(api, { ...shipment, packing, snapshot: shipment.snapshot }, input, assertOwned)
    return
  }
  const request = buildAwdRequest(
    shipment.snapshot,
    packing,
    amazonReference(shipment.id, revision),
    await api.prepDetails(shipment.snapshot.items.map((item) => item.buyerSku))
  )
  let orderId = shipment.amazonOrderId
  if (!orderId) {
    if (shipment.operation === "sending") {
      throw new Error("Amazon create outcome is unknown. Reconcile the existing order before retrying.")
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
      throw new Error("Amazon creation is already in progress. Reconcile before retrying.")
    }
    const result = await createOnce(shipmentId, () => api.create(request))
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
          name: `Carton ${label.cartonId} - ${label.labelNumber}.pdf`,
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
    .set({
      labels: labels.map(({ cartonId, labelNumber, destinationCode }) => ({
        cartonId,
        labelNumber,
        destinationCode,
        amazonShipmentId
      })),
      operation: "complete",
      issue: null,
      updatedAt: new Date()
    })
    .where(eq(shipments.id, shipmentId))
  await assertOwned()
  await generateShipmentDocuments(shipmentId)
  await assertOwned()
  await db().update(shipments).set({ status: "waiting_labels" }).where(eq(shipments.id, shipmentId))
}

// The language an email is written in: the one its reader chose in Settings, found by their address. A reader with an
// account who follows their computer's language gets English, since the worker can't know it. Someone without an
// account yet, such as an invited supplier, gets the language the email was queued in, such as the inviter's.
async function readerLocale(email: string, queued: string | undefined): Promise<Locale> {
  const accounts = await db()
    .select({ locale: profiles.locale })
    .from(memberships)
    .leftJoin(profiles, eq(profiles.userId, memberships.userId))
    .where(eq(sql`lower(${memberships.email})`, email.toLowerCase()))
  const chosen = accounts.map((account) => account.locale).find(isLocale)
  if (chosen) {
    return chosen
  }
  return !accounts.length && isLocale(queued) ? queued : defaultLocale
}

export async function emailJob(payload: Record<string, unknown>, key: string, assertOwned: () => Promise<void>) {
  if (!process.env.EMAIL_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Email sender is not configured")
  }
  const input = z
    .object({
      type: z.enum(["invite", "forwarder", "team", "po", "ready", "data_request"]),
      to: z.email(),
      // The language of the request that queued it, for a reader without an account.
      locale: z.string().optional(),
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
  const lang = await readerLocale(input.to, input.locale)
  const t = await translatorFor(lang)
  const tagline = t("emails.tagline")
  const attachments: Array<{ filename: string; content: string }> = []
  let email: Email
  if (input.type === "invite" || input.type === "team" || input.type === "forwarder") {
    // The link's page signs the person up or in with this email, then sets up what's still missing.
    const kind = input.type === "invite" ? "supplier" : input.type
    const from = input.name ?? (input.type === "team" ? t("emails.invitation.yourTeam") : t("emails.invitation.aBuyer"))
    const subject = t("emails.invitation.subject", { from })
    const lead = t(`emails.invitation.joining.${kind}`)
    const account = t("emails.invitation.steps.account")
    // What comes after accepting.
    const steps = {
      supplier: [
        account,
        t("emails.invitation.steps.supplierWorkspace"),
        t("emails.invitation.steps.supplierPack", { from })
      ],
      team: [account, t("emails.invitation.steps.teamStart", { from })],
      forwarder: [
        account,
        t("emails.invitation.steps.forwarderAddresses"),
        t("emails.invitation.steps.forwarderShipments", { from })
      ]
    }
    email = await invitationEmail({
      appUrl: appUrl(),
      kind,
      token: input.invitation!,
      lang,
      copy: {
        subject,
        eyebrow: t(`emails.invitation.eyebrow.${kind}`),
        heading: subject,
        lead,
        preview: lead,
        action: t("emails.invitation.accept"),
        note: t("emails.invitation.note", { email: input.to }),
        pasteLink: t("emails.pasteLink"),
        reason: t("emails.invitation.reason", { from, email: input.to }),
        tagline,
        steps: steps[kind]
      }
    })
  } else if (input.type === "po") {
    const po = await filedPo(input.orderId!, input.revision)
    // The email says what the attached PDF does: that revision's lines, total, dates and ship-to, and the buyer.
    const [sent] = await db()
      .select({ order: orderRevisions.data, buyer: organizations.name })
      .from(orderRevisions)
      .innerJoin(orders, eq(orders.id, orderRevisions.orderId))
      .innerJoin(organizations, eq(organizations.id, orders.buyerOrgId))
      .where(and(eq(orderRevisions.orderId, input.orderId!), eq(orderRevisions.revision, po.doc.orderRevision)))
    if (!sent) {
      throw new Error("Purchase order revision is unavailable")
    }
    const { order, buyer } = sent
    const { reference } = order
    const revision = po.doc.orderRevision
    const units = order.items.reduce((sum, item) => sum + item.pieces, 0)
    const total = money(orderTotal(order), order.currency)
    const values = { reference, buyer }
    email = await purchaseOrderEmail({
      appUrl: appUrl(),
      orderId: input.orderId!,
      revision,
      dueDate: order.dueDate,
      shipTo: po.shipTo,
      paymentTerms: order.paymentTerms || undefined,
      // The most valuable lines first, named as the PDF names them, without Shopify's "Default Title".
      items: order.items
        .toSorted((a, b) => b.pieces * b.unitPrice - a.pieces * a.unitPrice)
        .map((item) => ({
          quantity: item.pieces,
          name: item.name,
          detail: [item.variant === "Default Title" ? "" : item.variant, item.supplierSku].filter(Boolean).join(", "),
          amount: money(item.pieces * item.unitPrice, order.currency)
        })),
      total,
      lang,
      copy: {
        subject: t("emails.purchaseOrder.subject", values),
        eyebrow: revision > 1 ? t("emails.purchaseOrder.eyebrow.revised") : t("emails.purchaseOrder.eyebrow.new"),
        heading: t("emails.purchaseOrder.heading", values),
        // A later revision replaces the one the supplier had.
        lead:
          revision > 1
            ? t("emails.purchaseOrder.lead.revised", { buyer })
            : t("emails.purchaseOrder.lead.new", { buyer, units, products: order.items.length }),
        preview: order.dueDate
          ? t("emails.purchaseOrder.previewRequiredBy", { units, total, date: day(order.dueDate, lang) })
          : t("emails.purchaseOrder.preview", { units, total }),
        action: t("emails.purchaseOrder.open"),
        note: t("emails.purchaseOrder.note"),
        reason: t("emails.purchaseOrder.reason", { buyer }),
        tagline,
        labels: {
          revision: t("emails.purchaseOrder.labels.revision"),
          requiredBy: t("emails.purchaseOrder.labels.requiredBy"),
          shipTo: t("emails.purchaseOrder.labels.shipTo"),
          paymentTerms: t("emails.purchaseOrder.labels.paymentTerms"),
          total: t("emails.purchaseOrder.labels.total")
        },
        ...(order.items.length > shownLines && {
          more: t("emails.purchaseOrder.more", { count: order.items.length - shownLines })
        })
      }
    })
    attachments.push({ filename: po.doc.name, content: Buffer.from(po.bytes).toString("base64") })
  } else if (input.type === "data_request") {
    const shop = input.shop!
    const subject = t("emails.customerDataRequest.subject", { shop })
    const lead = t("emails.customerDataRequest.lead")
    email = await customerDataRequestEmail({
      appUrl: appUrl(),
      shop,
      requestId: input.requestId!,
      orders: input.orders ?? [],
      lang,
      copy: {
        subject,
        eyebrow: t("emails.customerDataRequest.eyebrow"),
        heading: subject,
        lead,
        preview: lead,
        note: t("emails.customerDataRequest.noContactDetails"),
        reason: t("emails.customerDataRequest.reason", { shop }),
        tagline,
        labels: {
          store: t("emails.customerDataRequest.labels.store"),
          request: t("emails.customerDataRequest.labels.request"),
          ordersHeld: t("emails.customerDataRequest.labels.ordersHeld")
        },
        none: t("emails.customerDataRequest.none"),
        ordersIntro: t("emails.customerDataRequest.ordersIntro")
      }
    })
  } else {
    // A purchase order's shipments are numbered oldest first, as the app numbers them.
    const [[released], numbered] = await Promise.all([
      db()
        .select({ shipment: shipments, order: orders.data, buyer: organizations.name })
        .from(shipments)
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .innerJoin(organizations, eq(organizations.id, orders.buyerOrgId))
        .where(and(eq(shipments.id, input.shipmentId!), eq(shipments.orderId, input.orderId!))),
      db()
        .select({ id: shipments.id })
        .from(shipments)
        .where(eq(shipments.orderId, input.orderId!))
        .orderBy(shipments.createdAt)
    ])
    if (!released) {
      throw new Error("Shipment is missing")
    }
    const { shipment, buyer } = released
    const { reference } = released.order
    const number = numbered.findIndex((row) => row.id === shipment.id) + 1
    const lead = t("emails.labelsReady.lead", { buyer })
    email = await labelsReadyEmail({
      appUrl: appUrl(),
      shipmentId: shipment.id,
      cartons: shipment.packing?.cartons.length,
      destination: await shipmentDestination(shipment),
      readyDate: shipment.packing?.readyDate,
      amazonShipments: shipment.amazonShipmentId?.split(", "),
      lang,
      copy: {
        // Only the purchase order when the shipment's number isn't known.
        subject: number
          ? t("emails.labelsReady.subjectShipment", { reference, shipment: number })
          : t("emails.labelsReady.subject", { reference }),
        eyebrow: t("emails.labelsReady.eyebrow"),
        heading: number
          ? t("emails.labelsReady.headingShipment", { reference, shipment: number })
          : t("emails.labelsReady.heading", { reference }),
        lead,
        preview: lead,
        action: t("emails.labelsReady.open"),
        reason: t("emails.labelsReady.reason", { buyer }),
        tagline,
        labels: {
          cartons: t("emails.labelsReady.labels.cartons"),
          destination: t("emails.labelsReady.labels.destination"),
          readyForPickup: t("emails.labelsReady.labels.readyForPickup"),
          amazonShipment: t("emails.labelsReady.labels.amazonShipment")
        },
        steps: [
          t("emails.labelsReady.steps.print"),
          t("emails.labelsReady.steps.attach"),
          t("emails.labelsReady.steps.handOver")
        ]
      }
    })
  }
  await assertOwned()
  await sendEmail({ to: input.to, ...email, key, attachments })
}

// A date such as "Dec 1, 2026" in the reader's language. It has no time of day, so it's read in UTC to stay the same
// day everywhere.
function day(date: string, locale: Locale) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  })
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
    throw new Error("Approved purchase order revision is unavailable")
  }
  const [currentOrder] = await db().select().from(orders).where(eq(orders.id, input.orderId))
  if (!currentOrder || currentOrder.buyerOrgId !== input.orgId) {
    throw new Error("Purchase order account mismatch")
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
      throw new Error("Shopify unit cost currency differs from the purchase order. No currency conversion is applied")
    }
  }
  // Supplier SKUs are kept in Copacker; unit costs in Shopify.
  await assertOwned()
  await saveSupplierSkus(
    input.orgId,
    currentOrder.shopifyDomain,
    input.changes.map((change) => ({
      variantId: record.data.items.find((i) => i.id === change.itemId)!.variantId,
      supplierSku: change.supplierSku
    }))
  )
  if (input.updateCost) {
    for (const change of input.changes) {
      const item = record.data.items.find((i) => i.id === change.itemId)!
      await assertOwned()
      await api.unitCost(item.inventoryItemId, change.unitPrice * item.piecesPerSet)
    }
  }
}
