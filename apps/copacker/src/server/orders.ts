import {
  amazonDestinations,
  approveChanges,
  commercialChanges,
  orderInputSchema,
  packingDraftSchema
} from "@repo/aisle"
import { bundleSupplierComponents, piecesPerUnit } from "@repo/aisle/shopify"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import {
  orders,
  orderRevisions,
  suppliers,
  shipments,
  documents,
  events,
  jobs,
  connections,
  contacts,
  supplierProducts,
  type ShipmentState
} from "@/db/schema"
import { bundleQuote } from "@/lib/bundle-quote"
import { accessibleOrder } from "./access"
import { requireBuyer, type Session } from "./auth"
import { shopifyFor, amazonFor, connection } from "./connections"
import { finishedStates, reservedPieces, packingReadiness } from "./readiness"
import { matchSupplierCatalog } from "./supplier-catalog-match"

// Amazon is optional until a PO ships to Amazon; without it, ASINs and FNSKUs are looked up when the PO is sent.
async function amazonAccount(orgId: string) {
  const [row] = await db()
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "amazon")))
  return row ? connection(orgId, "amazon") : null
}
async function amazonIdentities(orgId: string, sellerId: string, skus: string[]) {
  return (await amazonFor(orgId, sellerId)).listings(sellerId, skus)
}
export async function prepareOrder(s: Session, raw: unknown) {
  requireBuyer(s)
  const input = orderInputSchema.parse(raw)
  const [supplier] = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
  if (!supplier) {
    throw new Error("Select a supplier in this workspace")
  }
  const shop = await connection(s.org.id, "shopify"),
    amazon = await amazonAccount(s.org.id)
  const catalog = await (await shopifyFor(s.org.id, shop.externalId)).variants(input.items.map((i) => i.variantId))
  const identities = amazon
    ? await amazonIdentities(
        s.org.id,
        amazon.externalId,
        catalog.flatMap((item) => (item?.sku ? [item.sku] : []))
      )
    : null
  const supplierSkus = catalog.flatMap((source) => {
    if (source?.requiresComponents) {
      return bundleSupplierComponents(source).flatMap((component) =>
        component.supplierSku ? [component.supplierSku.trim()] : []
      )
    }
    return source?.supplierSku?.value ? [source.supplierSku.value.trim()] : []
  })
  const supplierCatalog =
    supplier.supplierOrgId && supplierSkus.length
      ? await db()
          .select()
          .from(supplierProducts)
          .where(
            and(
              eq(supplierProducts.supplierOrgId, supplier.supplierOrgId),
              inArray(supplierProducts.supplierSku, supplierSkus)
            )
          )
      : []
  input.items = input.items.map((item) => {
    const source = catalog.find((v) => v?.id === item.variantId)
    if (!source?.sku) {
      throw new Error("Every PO item must have a Shopify SKU")
    }
    const identity = identities?.get(source.sku)
    if (source.asin?.value && identity?.asin && source.asin.value !== identity.asin) {
      throw new Error(`Shopify and Amazon ASINs disagree for SKU ${source.sku}`)
    }
    // A multipack is a Shopify bundle, so its pieces per unit come from the bundle, not from the PO.
    const piecesPerSet = piecesPerUnit(source)
    const components = source.requiresComponents ? bundleSupplierComponents(source) : undefined
    const supplierSku = source.requiresComponents ? "" : (source.supplierSku?.value ?? "")
    const products = supplierCatalog.map((product) => ({ ...product, active: product.active === 1 }))
    const matched = matchSupplierCatalog(
      { supplierOrgId: supplier.supplierOrgId, supplierSku, currency: input.currency },
      products
    )
    const componentMatches = components?.map((component) =>
      matchSupplierCatalog(
        { supplierOrgId: supplier.supplierOrgId, supplierSku: component.supplierSku, currency: input.currency },
        products
      )
    )
    const componentQuote = components?.length && componentMatches ? bundleQuote(components, componentMatches) : null
    const componentsWithCatalog = components?.map((component, index) => {
      const product = componentMatches?.[index]?.product
      return {
        ...component,
        supplierCatalog: product?.active
          ? {
              productId: product.id,
              revision: product.revision,
              supplierSku: product.supplierSku,
              title: product.title,
              notes: product.notes,
              currency: product.currency,
              priceMinor: product.priceMinor,
              priceBasis: product.priceBasis,
              piecesPerSellablePack: product.piecesPerSellablePack,
              sellablePacksPerCase: product.sellablePacksPerCase
            }
          : undefined
      }
    })
    if (item.pieces % piecesPerSet !== 0) {
      throw new Error(`${source.sku} is a bundle of ${piecesPerSet}. Order a multiple of ${piecesPerSet} pieces`)
    }
    return {
      ...item,
      name: source.product.title,
      variant: source.title,
      buyerSku: source.sku,
      inventoryItemId: source.inventoryItem.id,
      supplierSku,
      components: componentsWithCatalog,
      supplierCatalogStatus: componentQuote?.status ?? matched.status,
      supplierCatalog: matched.product?.active
        ? {
            productId: matched.product.id,
            revision: matched.product.revision,
            supplierSku: matched.product.supplierSku,
            title: matched.product.title,
            notes: matched.product.notes,
            currency: matched.product.currency,
            priceMinor: matched.product.priceMinor,
            priceBasis: matched.product.priceBasis,
            piecesPerSellablePack: matched.product.piecesPerSellablePack,
            sellablePacksPerCase: matched.product.sellablePacksPerCase
          }
        : undefined,
      asin: identity?.asin ?? source.asin?.value ?? "",
      fnsku: identity?.fnsku ?? "",
      piecesPerSet
    }
  })
  orderInputSchema.parse(input)
  return { input, shopifyDomain: shop.externalId, amazonSellerId: amazon?.externalId ?? null }
}
export async function persistOrder(tx: Transaction, s: Session, prepared: Awaited<ReturnType<typeof prepareOrder>>) {
  const { input, shopifyDomain, amazonSellerId } = prepared
  requireBuyer(s)
  // Keep the selected accounts stable through the commit, including after slow catalog reads.
  const accounts = await tx
    .select({ provider: connections.provider, externalId: connections.externalId })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
    .orderBy(connections.provider)
    .for("share")
  if (
    !accounts.some((account) => account.provider === "shopify" && account.externalId === shopifyDomain) ||
    (amazonSellerId !== null &&
      !accounts.some((account) => account.provider === "amazon" && account.externalId === amazonSellerId))
  ) {
    throw new Error("The connected merchant account changed. Refresh before saving this PO")
  }
  const [supplier] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
    .for("share")
  if (!supplier) {
    throw new Error("Select a supplier in this workspace")
  }
  if (input.destination === "warehouse") {
    const [delivery] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, input.deliveryId!), eq(contacts.orgId, s.org.id), eq(contacts.kind, "delivery")))
      .for("share")
    if (!delivery) {
      throw new Error("Choose one of your delivery addresses")
    }
  }
  if (input.destination === "forwarder") {
    const [forwarder] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, input.forwarderId!), eq(contacts.orgId, s.org.id), eq(contacts.kind, "forwarder")))
      .for("share")
    if (!forwarder) {
      throw new Error("Choose a freight forwarder in this workspace")
    }
  }
  const [order] = await tx
    .insert(orders)
    .values({
      buyerOrgId: s.org.id,
      supplierId: input.supplierId,
      shopifyDomain,
      amazonSellerId,
      data: input
    })
    .returning()
  await tx
    .insert(orderRevisions)
    .values({ orderId: order!.id, revision: 1, data: input, actor: s.user.id, reason: "PO created" })
  return order!
}
export async function createOrder(s: Session, raw: unknown) {
  const prepared = await prepareOrder(s, raw)
  return db().transaction((tx) => persistOrder(tx, s, prepared))
}
// Amazon shipments need every item's ASIN and FNSKU. A PO saved before Amazon was connected gets them here, before the
// supplier packs against it.
async function missingAmazonIdentities(s: Session, id: string) {
  const { order } = await accessibleOrder(s, id)
  const missing = order.data.items.filter((item) => !item.asin || !item.fnsku)
  if (!missing.length || order.data.destination !== "awd_us") {
    return null
  }
  const amazon = await amazonAccount(s.org.id)
  if (!amazon) {
    throw new Error("Connect Amazon in Settings before sending this PO. Amazon needs each item's ASIN and FNSKU.")
  }
  const identities = await amazonIdentities(
    s.org.id,
    amazon.externalId,
    missing.map((item) => item.buyerSku)
  )
  const unlisted = missing.filter((item) => {
    const identity = identities.get(item.buyerSku)
    return !identity?.asin || !identity.fnsku || (item.asin && item.asin !== identity.asin)
  })
  if (unlisted.length) {
    throw new Error(
      `Amazon has no matching FBA listing for ${unlisted.map((item) => item.buyerSku).join(", ")}. Check the SKUs on Amazon, then send the PO.`
    )
  }
  return { sellerId: amazon.externalId, identities, revision: order.revision }
}
export async function submitOrder(s: Session, id: string, expectedRevision: number) {
  requireBuyer(s)
  const completed = await missingAmazonIdentities(s, id)
  return db().transaction(async (tx) => {
    const { order, supplier } = await accessibleOrder(s, id, tx, true)
    if (
      order.status !== "draft" ||
      order.revision !== expectedRevision ||
      (completed && completed.revision !== order.revision)
    ) {
      throw new Error("This PO has changed. Refresh before submitting")
    }
    if (order.data.destination !== "awd_us" && order.data.destination !== "warehouse") {
      throw new Error("POs can go to AWD USA or your own locations for now. Save other destinations as drafts")
    }
    if (supplier.removedAt) {
      throw new Error("This supplier was removed. Choose another supplier or add them again")
    }
    if (completed) {
      if (order.amazonSellerId && order.amazonSellerId !== completed.sellerId) {
        throw new Error("The connected Amazon account changed. Refresh before submitting")
      }
      order.data = orderInputSchema.parse({
        ...order.data,
        items: order.data.items.map((item) => {
          const identity = completed.identities.get(item.buyerSku)
          return item.asin && item.fnsku ? item : { ...item, asin: identity?.asin ?? "", fnsku: identity?.fnsku ?? "" }
        })
      })
      order.amazonSellerId = completed.sellerId
      await tx
        .update(orderRevisions)
        .set({ data: order.data })
        .where(and(eq(orderRevisions.orderId, id), eq(orderRevisions.revision, order.revision)))
    }
    await tx
      .update(orders)
      .set({ status: "submitted", data: order.data, amazonSellerId: order.amazonSellerId, updatedAt: new Date() })
      .where(eq(orders.id, id))
    await tx
      .insert(jobs)
      .values({
        key: `po:${id}:${order.revision}`,
        kind: "email",
        payload: { type: "po", orderId: id, revision: order.revision, to: supplier.email, orgName: s.org.name }
      })
      .onConflictDoNothing()
    const [shipment] = await tx
      .insert(shipments)
      .values({ orderId: id, orderRevision: order.revision, snapshot: order.data })
      .returning()
    await tx.insert(events).values({ orderId: id, actor: s.user.id, message: "PO submitted to supplier" })
    return { shipmentId: shipment!.id }
  })
}
export async function newShipment(s: Session, orderId: string) {
  return db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, orderId, tx, true)
    if (order.status !== "submitted") {
      throw new Error("Submit the PO before creating a shipment")
    }
    const existing = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .orderBy(shipments.createdAt)
    const editable = existing.find(
      (row) => ["packing", "correction"].includes(row.status) && row.operation === "none" && !row.amazonOrderId
    )
    if (editable) {
      return editable
    }
    const reserved = reservedPieces(existing)
    if (order.data.items.every((item) => (reserved[item.id] ?? 0) >= item.pieces)) {
      throw new Error("All PO quantities are already assigned to shipments")
    }
    const [shipment] = await tx
      .insert(shipments)
      .values({ orderId, orderRevision: order.revision, snapshot: order.data })
      .returning()
    return shipment!
  })
}
export async function submitPacking(s: Session, shipmentId: string, raw: unknown, expectedRevision: number) {
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order } = await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || !["packing", "correction"].includes(shipment.status) || shipment.revision !== expectedRevision) {
      throw new Error("This shipment has changed. Refresh before submitting")
    }
    if (shipment.amazonOrderId || shipment.operation !== "none") {
      throw new Error("Resolve the existing Amazon shipment before submitting replacement cartons")
    }
    const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
    const others = await tx.select().from(shipments).where(eq(shipments.orderId, order.id))
    const assessed = packingReadiness(
      order.data,
      shipment,
      raw ?? shipment.packingDraft,
      docs,
      reservedPieces(others, shipmentId),
      order.revision
    )
    if (!assessed.packing || assessed.issues.length) {
      throw new Error(
        assessed.issues.map((issue) => `${issue.cartonId ? `${issue.cartonId}: ` : ""}${issue.message}`).join("\n")
      )
    }
    const packing = assessed.packing
    const approval = commercialChanges(order.data, packing).length > 0
    const amazon = amazonDestinations.includes(order.data.destination)
    let status: ShipmentState = "ready"
    let message = "Packing submitted; ready to ship"
    if (approval) {
      status = "approval"
      message = "Supplier submitted invoice changes for approval"
    } else if (amazon) {
      status = "queued"
      message = "Packing submitted; Amazon creation queued"
    }
    await tx
      .update(shipments)
      .set({
        packing,
        packingDraft: null,
        snapshot: order.data,
        orderRevision: order.revision,
        status,
        updatedAt: new Date()
      })
      .where(eq(shipments.id, shipmentId))
    await tx.insert(events).values({ orderId: order.id, actor: s.user.id, message })
    if (!approval && amazon) {
      await tx
        .insert(jobs)
        .values({
          key: `amazon:${shipmentId}:${shipment.revision}`,
          kind: "amazon",
          payload: { shipmentId, revision: shipment.revision }
        })
        .onConflictDoNothing()
    }
    return { approval }
  })
}
export async function approveInvoice(s: Session, shipmentId: string, expectedRevision: number, updateCost: boolean) {
  requireBuyer(s)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order, supplier } = await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (
      !shipment?.packing ||
      shipment.status !== "approval" ||
      shipment.revision !== expectedRevision ||
      shipment.orderRevision !== order.revision
    ) {
      throw new Error("The PO or invoice has changed. Ask the supplier to resubmit against the latest PO")
    }
    const data = approveChanges(order.data, shipment.packing),
      revision = order.revision + 1
    await tx
      .insert(orderRevisions)
      .values({ orderId: order.id, revision, data, actor: s.user.id, reason: "Approved supplier commercial changes" })
    await tx.update(orders).set({ data, revision, updatedAt: new Date() }).where(eq(orders.id, order.id))
    const amazon = amazonDestinations.includes(order.data.destination)
    const amazonJobs: (typeof jobs.$inferInsert)[] = amazon
      ? [
          {
            key: `amazon:${shipmentId}:${shipment.revision}`,
            kind: "amazon",
            payload: { shipmentId, revision: shipment.revision }
          }
        ]
      : []
    await tx
      .update(shipments)
      .set({ snapshot: data, orderRevision: revision, status: amazon ? "queued" : "ready", updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId))
    await tx
      .update(documents)
      .set({ outdated: 1 })
      .where(and(eq(documents.orderId, order.id), eq(documents.kind, "purchase_order")))
    await tx
      .insert(jobs)
      .values([
        {
          key: `shopify:${shipmentId}:${shipment.revision}`,
          kind: "shopify",
          payload: {
            orgId: s.org.id,
            orderId: order.id,
            revision,
            changes: commercialChanges(order.data, shipment.packing),
            updateCost
          }
        },
        ...amazonJobs,
        {
          key: `po:${order.id}:${revision}`,
          kind: "email",
          payload: { type: "po", orderId: order.id, revision, to: supplier.email }
        }
      ])
      .onConflictDoNothing()
    await tx.insert(events).values({
      orderId: order.id,
      actor: s.user.id,
      message: `Invoice changes approved; PO revision ${revision} published`
    })
  })
}
export async function correctShipment(s: Session, shipmentId: string, reason: string) {
  z.string().trim().min(3).max(2000).parse(reason)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || shipment.status === "creating" || finishedStates.includes(shipment.status)) {
      throw new Error("Shipment cannot be edited in its current state")
    }
    if (shipment.operation === "sending" && !shipment.amazonOrderId) {
      throw new Error("Reconcile the uncertain Amazon creation before requesting a correction")
    }
    await tx
      .update(shipments)
      .set({
        status: "correction",
        issue: reason,
        packingDraft: shipment.packingDraft ?? shipment.packing,
        revision: shipment.revision + 1,
        updatedAt: new Date()
      })
      .where(eq(shipments.id, shipmentId))
    await tx.update(documents).set({ outdated: 1 }).where(eq(documents.shipmentId, shipmentId))
    await tx
      .update(jobs)
      .set({ status: "cancelled" })
      .where(
        and(eq(jobs.key, `amazon:${shipmentId}:${shipment.revision}`), inArray(jobs.status, ["pending", "failed"]))
      )
    await tx
      .insert(events)
      .values({ orderId: shipment.orderId, actor: s.user.id, message: `Correction requested: ${reason}` })
  })
}

export async function savePacking(
  s: Session,
  shipmentId: string,
  raw: unknown,
  expectedRevision: number,
  expectedOrderRevision: number
) {
  const draft = packingDraftSchema.parse(raw)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order } = await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || shipment.revision !== expectedRevision || order.revision !== expectedOrderRevision) {
      throw new Error("The PO or packing draft has changed. Refresh before saving")
    }
    if (
      !["packing", "correction"].includes(shipment.status) ||
      shipment.operation !== "none" ||
      shipment.amazonOrderId
    ) {
      throw new Error("Request a correction before changing submitted packing")
    }
    const itemIds = new Set(order.data.items.map((item) => item.id))
    if (
      draft.cartons?.some((carton) => carton.items?.some((item) => item.itemId && !itemIds.has(item.itemId))) ||
      draft.changes?.some((change) => !itemIds.has(change.itemId))
    ) {
      throw new Error("Draft contains a product that is not on this PO")
    }
    const revision = shipment.revision + 1
    await tx
      .update(shipments)
      .set({ packingDraft: draft, revision, orderRevision: order.revision, updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId))
    return { revision, savedAt: new Date().toISOString() }
  })
}
export async function checkPacking(s: Session, shipmentId: string, raw?: unknown) {
  return db().transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!shipment) {
      throw new Error("Shipment not found")
    }
    const { order } = await accessibleOrder(s, shipment.orderId, tx)
    const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
    const all = await tx.select().from(shipments).where(eq(shipments.orderId, order.id))
    const reserved = reservedPieces(all, shipment.id)
    const result = packingReadiness(
      order.data,
      shipment,
      raw ?? shipment.packingDraft ?? shipment.packing ?? {},
      docs,
      reserved,
      order.revision
    )
    return {
      revision: shipment.revision,
      orderRevision: order.revision,
      canSubmit: result.issues.length === 0,
      requiresApproval: result.packing ? commercialChanges(order.data, result.packing).length > 0 : false,
      issues: result.issues,
      items: order.data.items.map((item) => ({
        itemId: item.id,
        buyerSku: item.buyerSku,
        orderedPieces: item.pieces,
        reservedPieces: reserved[item.id] ?? 0,
        availablePieces: Math.max(0, item.pieces - (reserved[item.id] ?? 0))
      }))
    }
  })
}

// A shipment in any of these states is still being prepared, created or collected, so its PO stays open.
const inProgress = new Set<ShipmentState>([
  "approval",
  "queued",
  "creating",
  "waiting_labels",
  "ready",
  "correction",
  "needs_attention"
])

// Closes a sent PO: nothing more will ship, so it drops out of On order. Shipments the supplier hasn't packed are
// cancelled; shipments still being created or collected keep the PO open.
export async function closeOrder(s: Session, id: string) {
  requireBuyer(s)
  return db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, id, tx, true)
    if (order.status !== "submitted") {
      throw new Error(order.status === "closed" ? "This PO is already closed" : "Send the PO before closing it")
    }
    const rows = await tx.select().from(shipments).where(eq(shipments.orderId, id)).for("update")
    const busy = rows.filter(
      (row) => inProgress.has(row.status) || (row.status === "packing" && row.operation !== "none")
    )
    if (busy.length) {
      throw new Error("A shipment for this PO is still in progress. Finish or cancel it before closing the PO")
    }
    await tx
      .update(shipments)
      .set({ status: "cancelled", packingDraft: null, updatedAt: new Date() })
      .where(and(eq(shipments.orderId, id), eq(shipments.status, "packing")))
    await tx.update(orders).set({ status: "closed", updatedAt: new Date() }).where(eq(orders.id, id))
    await tx.insert(events).values({ orderId: id, actor: s.user.id, message: "PO closed" })
  })
}

// Records that a shipment's goods arrived where the PO sent them, so they leave On order.
export async function receiveShipment(s: Session, shipmentId: string) {
  requireBuyer(s)
  await db().transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!shipment) {
      throw new Error("Shipment not found")
    }
    await accessibleOrder(s, shipment.orderId, tx, true)
    if (!["ready", "collected"].includes(shipment.status)) {
      throw new Error("Only released or collected shipments can be marked received")
    }
    await tx.update(shipments).set({ status: "received", updatedAt: new Date() }).where(eq(shipments.id, shipmentId))
    await tx.insert(events).values({ orderId: shipment.orderId, actor: s.user.id, message: "Shipment received" })
  })
}
