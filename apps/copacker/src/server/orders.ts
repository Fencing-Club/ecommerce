import { randomUUID } from "node:crypto"
import type { OrderInput } from "@repo/aisle"
import type { Packing } from "@repo/aisle"
import {
  amazonNetworkNames,
  approveChanges,
  commercialChanges,
  orderInputSchema,
  packingDraftSchema,
  splitByNetwork
} from "@repo/aisle"
import { bundleSupplierComponents, piecesPerUnit } from "@repo/aisle/shopify"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import type { Transaction } from "@/db"
import { db } from "@/db"
import {
  orders,
  orderProposals,
  orderRevisions,
  suppliers,
  shipments,
  documents,
  events,
  jobs,
  connections,
  contacts,
  landedCosts,
  poImports,
  type ShipmentState
} from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { can } from "@/lib/access"
import { bundleQuote } from "@/lib/bundle-quote"
import { quantityProblem } from "@/lib/catalog-pricing"
import type { TimelineEvent } from "@/lib/timeline-events"
import { eventMessage } from "@/lib/timeline-events"
import { withJobWake } from "@/server/job-delivery"
import { accessibleOrder } from "./access"
import { requireBuyer } from "./authorization"
import { customerProducts } from "./catalogs"
import { shopifyFor, amazonFor, connection } from "./connections"
import { copyDocument, generatePo } from "./documents"
import { forwarderAddress } from "./forwarders"
import { discardFile } from "./product-barcodes"
import { withVariantFields } from "./product-fields"
import { finishedStates, reservedPieces, packingReadiness } from "./readiness"
import { forwarderLeg } from "./shipment-legs"
import { describeError } from "./stock"
import { matchSupplierCatalog } from "./supplier-catalog-match"
import { checkSupplierStock, returnSupplierStock, takeSupplierStock } from "./supplier-stock"
import { pricingText, serverText } from "./text"
import type { Session } from "./workspace-session"

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
    throw new LocalizedError("selectWorkspaceSupplier")
  }
  const shop = await connection(s.org.id, "shopify"),
    amazon = await amazonAccount(s.org.id)
  const catalog = await withVariantFields(
    s.org.id,
    shop.externalId,
    await (await shopifyFor(s.org.id, shop.externalId)).variants(input.items.map((i) => i.variantId))
  )
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
  const products = await customerProducts(db(), supplier, supplierSkus)
  input.items = input.items.map((item) => {
    const source = catalog.find((v) => v?.id === item.variantId)
    if (!source?.sku) {
      throw new LocalizedError("itemsNeedShopifySku")
    }
    const identity = identities?.get(source.sku)
    if (source.asin?.value && identity?.asin && source.asin.value !== identity.asin) {
      throw new LocalizedError("asinMismatch", { sku: source.sku })
    }
    // A multipack is a Shopify bundle, so its pieces per unit come from the bundle, not from the PO.
    const piecesPerSet = piecesPerUnit(source)
    const components = source.requiresComponents ? bundleSupplierComponents(source) : undefined
    const supplierSku = source.requiresComponents ? "" : (source.supplierSku?.value ?? "")
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
      throw new LocalizedError("bundleMultiple", { sku: source.sku, count: piecesPerSet })
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
// Checks a prepared PO against the workspace inside the saving transaction: the same merchant accounts, one of its
// suppliers, and one of its addresses.
// A supplier's own proposed changes skip its stock limit: the supplier chose those quantities.
export async function checkOrder(
  tx: Transaction,
  s: Session,
  prepared: Awaited<ReturnType<typeof prepareOrder>>,
  { stock = true } = {}
) {
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
    throw new LocalizedError("merchantChangedOrder")
  }
  const [supplier] = await tx
    .select({ id: suppliers.id, supplierOrgId: suppliers.supplierOrgId })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
    .for("share")
  if (!supplier) {
    throw new LocalizedError("selectWorkspaceSupplier")
  }
  if (stock) {
    await checkSupplierStock(tx, supplier.supplierOrgId, input)
  }
  if (input.destination === "warehouse") {
    const [delivery] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, input.deliveryId!), eq(contacts.orgId, s.org.id), eq(contacts.kind, "delivery")))
      .for("share")
    if (!delivery) {
      throw new LocalizedError("chooseDeliveryAddress")
    }
  }
  if (input.via && !(await forwarderAddress(s.org.id, input.via.forwarderId, input.via.addressId, tx))) {
    throw new LocalizedError("chooseForwarderStop")
  }
}
export async function persistOrder(tx: Transaction, s: Session, prepared: Awaited<ReturnType<typeof prepareOrder>>) {
  await checkOrder(tx, s, prepared)
  const { input, shopifyDomain, amazonSellerId } = prepared
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
    .values({ orderId: order!.id, revision: 1, data: input, actor: s.user.id, reason: "created" })
  return order!
}
// Saves changes to a draft PO as its next revision. A sent PO changes through its shipments instead.
export async function updateDraftOrder(s: Session, id: string, raw: unknown, expectedRevision: number) {
  requireBuyer(s)
  const prepared = await prepareOrder(s, raw)
  await db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, id, tx, true)
    if (order.status !== "draft") {
      throw new LocalizedError("onlyDraftEditable")
    }
    if (order.revision !== expectedRevision) {
      throw new LocalizedError("orderChangedSave")
    }
    if (order.shopifyDomain !== prepared.shopifyDomain) {
      throw new LocalizedError("shopifyStoreChanged")
    }
    await checkOrder(tx, s, prepared)
    const revision = order.revision + 1
    await tx
      .update(orders)
      .set({
        supplierId: prepared.input.supplierId,
        amazonSellerId: prepared.amazonSellerId,
        data: prepared.input,
        revision,
        updatedAt: new Date()
      })
      .where(eq(orders.id, id))
    await tx
      .insert(orderRevisions)
      .values({ orderId: id, revision, data: prepared.input, actor: s.user.id, reason: "edited" })
  })
}
export async function createOrder(s: Session, raw: unknown) {
  const prepared = await prepareOrder(s, raw)
  const order = await db().transaction((tx) => persistOrder(tx, s, prepared))
  return order
}
// Amazon shipments need every item's ASIN and FNSKU. A PO saved before Amazon was connected gets them here, before the
// supplier packs against it.
async function missingAmazonIdentities(s: Session, id: string) {
  const { order } = await accessibleOrder(s, id)
  const missing = order.data.items.filter((item) => !item.asin || !item.fnsku)
  if (!missing.length || order.data.destination !== "amazon") {
    return null
  }
  const amazon = await amazonAccount(s.org.id)
  if (!amazon) {
    throw new LocalizedError("connectAmazonBeforeSending")
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
    throw new LocalizedError("amazonNoListing", { skus: unlisted.map((item) => item.buyerSku).join(", ") })
  }
  return { sellerId: amazon.externalId, identities, revision: order.revision }
}
// Refuses a PO whose lines break the quantity rules the supplier set for this buyer: a minimum, a maximum or an
// increment. Bundles are left out, since their components are ordered in the bundle's own steps.
async function checkQuantityRules(
  tx: Transaction,
  supplier: { supplierOrgId: string | null; catalogId: string | null },
  data: OrderInput
) {
  const lines = data.items.filter((item) => !item.components?.length && item.supplierSku)
  const products = await customerProducts(
    tx,
    supplier,
    lines.map((item) => item.supplierSku)
  )
  const t = await pricingText()
  const problems = lines.flatMap((item) => {
    const { rules } = matchSupplierCatalog(
      { supplierOrgId: supplier.supplierOrgId, supplierSku: item.supplierSku, currency: data.currency },
      products
    )
    const problem = rules && quantityProblem(rules, item.pieces, "piece", t)
    return problem ? [`${item.buyerSku}: ${problem.toLowerCase()}`] : []
  })
  if (problems.length) {
    throw new LocalizedError("quantityRulesBroken", { problems: problems.join(". ") })
  }
}
export async function submitOrder(s: Session, id: string, expectedRevision: number) {
  requireBuyer(s)
  const completed = await missingAmazonIdentities(s, id)
  const submitted = await withJobWake(
    db().transaction(async (tx) => {
      const { order, supplier } = await accessibleOrder(s, id, tx, true)
      if (
        order.status !== "draft" ||
        order.revision !== expectedRevision ||
        (completed && completed.revision !== order.revision)
      ) {
        throw new LocalizedError("orderChangedSubmit")
      }
      if (supplier.removedAt) {
        throw new LocalizedError("supplierRemovedChooseAnother")
      }
      await checkSupplierStock(tx, supplier.supplierOrgId, order.data, id)
      await checkQuantityRules(tx, supplier, order.data)
      if (completed) {
        if (order.amazonSellerId && order.amazonSellerId !== completed.sellerId) {
          throw new LocalizedError("amazonAccountChanged")
        }
        order.data = orderInputSchema.parse({
          ...order.data,
          items: order.data.items.map((item) => {
            const identity = completed.identities.get(item.buyerSku)
            return item.asin && item.fnsku
              ? item
              : { ...item, asin: identity?.asin ?? "", fnsku: identity?.fnsku ?? "" }
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
      // A supplier that joined Copacker is emailed the PO and provides its documents there. For one that hasn't, the
      // buyer downloads the documents and shares them, and enters the supplier's side itself.
      if (supplier.supplierOrgId && supplier.email) {
        await tx
          .insert(jobs)
          .values({
            key: `po:${id}:${order.revision}`,
            kind: "email",
            payload: { type: "po", orderId: id, revision: order.revision, to: supplier.email, orgName: s.org.name }
          })
          .onConflictDoNothing()
      }
      const networks =
        order.data.destination === "amazon" ? [...new Set(order.data.items.map((item) => item.amazonNetwork))] : [null]
      const [shipment] = await tx
        .insert(shipments)
        .values(
          networks.map((amazonNetwork) => ({
            orderId: id,
            orderRevision: order.revision,
            snapshot: order.data,
            amazonNetwork
          }))
        )
        .returning()
      await tx.insert(events).values({
        orderId: id,
        actor: s.user.id,
        ...eventMessage({ key: supplier.supplierOrgId ? "submittedToSupplier" : "sent", values: null })
      })
      return { shipmentId: shipment!.id }
    })
  )
  // The PO's document is kept with it from the start, for a supplier that isn't on Copacker as much as one that is. A
  // storage failure doesn't undo sending: the document is made again when it's emailed or downloaded.
  try {
    await generatePo(id)
  } catch (error) {
    console.error(JSON.stringify({ event: "po_document_failed", orderId: id, error: describeError(error) }))
  }
  return submitted
}
// Packing waits while the supplier's changes to the PO are with the buyer, so cartons match the PO it approves.
async function refusePendingChanges(tx: Transaction, orderId: string) {
  const [pending] = await tx
    .select({ id: orderProposals.id })
    .from(orderProposals)
    .where(and(eq(orderProposals.orderId, orderId), eq(orderProposals.status, "pending")))
  if (pending) {
    throw new LocalizedError("changesAwaitingApproval")
  }
}
export async function newShipment(s: Session, orderId: string) {
  return db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, orderId, tx, true)
    if (order.status !== "submitted") {
      throw new LocalizedError("submitBeforeShipment")
    }
    await refusePendingChanges(tx, orderId)
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
      throw new LocalizedError("allQuantitiesAssigned")
    }
    const [shipment] = await tx
      .insert(shipments)
      .values({ orderId, orderRevision: order.revision, snapshot: order.data })
      .returning()
    return shipment!
  })
}
// A packer who doesn't see prices can't change them: each invoice line keeps the purchase order's price, whatever the
// form sent, so only supplier SKUs can change.
function keepOrderPrices(s: Session, data: OrderInput, raw: unknown) {
  if (can(s, "prices")) {
    return raw
  }
  const parsed = z.looseObject({ changes: z.array(z.looseObject({ itemId: z.string() })) }).safeParse(raw)
  if (!parsed.success) {
    return raw
  }
  const price = (itemId: string) => data.items.find((item) => item.id === itemId)?.unitPrice
  return {
    ...parsed.data,
    changes: parsed.data.changes.map((change) => ({ ...change, unitPrice: price(change.itemId) }))
  }
}

export async function submitPacking(s: Session, shipmentId: string, raw: unknown, expectedRevision: number) {
  const submitted = await withJobWake(
    db().transaction(async (tx) => {
      const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
      if (!initial) {
        throw new LocalizedError("shipmentNotFound")
      }
      const { order, supplier } = await accessibleOrder(s, initial.orderId, tx, true)
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
      if (!shipment || !["packing", "correction"].includes(shipment.status) || shipment.revision !== expectedRevision) {
        throw new LocalizedError("shipmentChangedSubmit")
      }
      await refusePendingChanges(tx, order.id)
      if (shipment.amazonOrderId || shipment.operation !== "none") {
        throw new LocalizedError("resolveAmazonShipment")
      }
      const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
      const others = await tx.select().from(shipments).where(eq(shipments.orderId, order.id))
      const assessed = packingReadiness(
        order.data,
        shipment,
        keepOrderPrices(s, order.data, raw ?? shipment.packingDraft),
        docs,
        reservedPieces(others, shipmentId),
        order.revision,
        await serverText()
      )
      if (!assessed.packing || assessed.issues.length) {
        throw new Error(
          assessed.issues.map((issue) => `${issue.cartonId ? `${issue.cartonId}: ` : ""}${issue.message}`).join("\n")
        )
      }
      const packing = assessed.packing
      const approval = commercialChanges(order.data, packing).length > 0
      const amazon = order.data.destination === "amazon"
      let status: ShipmentState = "ready"
      let event: TimelineEvent = { key: "packingReady", values: null }
      if (approval) {
        status = "approval"
        event = { key: s.org.kind === "buyer" ? "invoiceEntered" : "invoiceChangesSubmitted", values: null }
      } else if (amazon) {
        status = "queued"
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
      if (!approval && amazon) {
        event = await queueAmazon(tx, shipment, packing, order.data, order.revision, supplier.supplierOrgId)
      } else if (!approval) {
        await takeSupplierStock(tx, shipmentId, supplier.supplierOrgId, order.data, packing)
      }
      await tx.insert(events).values({ orderId: order.id, actor: s.user.id, ...eventMessage(event) })
      return { approval, revision: shipment.revision }
    })
  )
  // The buyer entering a supplier's invoice itself, for a supplier that isn't on Copacker, doesn't approve its own
  // changes: they're applied straight away.
  if (submitted.approval && s.org.kind === "buyer") {
    await approveInvoice(s, shipmentId, submitted.revision, false)
    return { approval: false }
  }
  return { approval: submitted.approval }
}
// Queues a shipment's cartons for Amazon, one shipment per Amazon network they go to: the shipment keeps the first
// network's cartons, and each other network's become a new shipment with its own copy of the commercial invoice. Each
// gets its own Amazon job and takes its own pieces from the supplier's stock. Returns the timeline event.
async function queueAmazon(
  tx: Transaction,
  shipment: { id: string; orderId: string; revision: number },
  packing: Packing,
  data: OrderInput,
  orderRevision: number,
  supplierOrgId: string | null
): Promise<TimelineEvent> {
  const [first, ...rest] = splitByNetwork(data, packing)
  await tx
    .update(shipments)
    .set({
      packing: first!.packing,
      amazonNetwork: first!.network,
      snapshot: data,
      orderRevision,
      status: "queued",
      updatedAt: new Date()
    })
    .where(eq(shipments.id, shipment.id))
  await takeSupplierStock(tx, shipment.id, supplierOrgId, data, first!.packing)
  const queued = [{ shipmentId: shipment.id, revision: shipment.revision }]
  for (const part of rest) {
    const invoiceDocumentId = randomUUID()
    const [added] = await tx
      .insert(shipments)
      .values({
        orderId: shipment.orderId,
        orderRevision,
        snapshot: data,
        packing: { ...part.packing, invoiceDocumentId },
        amazonNetwork: part.network,
        status: "queued"
      })
      .returning({ id: shipments.id, revision: shipments.revision })
    await copyDocument(tx, part.packing.invoiceDocumentId, {
      id: invoiceDocumentId,
      shipmentId: added!.id,
      shipmentRevision: added!.revision
    })
    await takeSupplierStock(tx, added!.id, supplierOrgId, data, part.packing)
    queued.push({ shipmentId: added!.id, revision: added!.revision })
  }
  await tx
    .insert(jobs)
    .values(
      queued.map((payload) => ({
        key: `amazon:${payload.shipmentId}:${payload.revision}`,
        kind: "amazon" as const,
        payload
      }))
    )
    .onConflictDoNothing()
  const names = [first!, ...rest].map((part) => amazonNetworkNames[part.network])
  return rest.length
    ? { key: "packingSplit", values: { networks: names } }
    : { key: "packingQueued", values: { network: names[0]! } }
}

export async function approveInvoice(s: Session, shipmentId: string, expectedRevision: number, updateCost: boolean) {
  requireBuyer(s)
  return withJobWake(
    db().transaction(async (tx) => {
      const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
      if (!initial) {
        throw new LocalizedError("shipmentNotFound")
      }
      const { order, supplier } = await accessibleOrder(s, initial.orderId, tx, true)
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
      if (
        !shipment?.packing ||
        shipment.status !== "approval" ||
        shipment.revision !== expectedRevision ||
        shipment.orderRevision !== order.revision
      ) {
        throw new LocalizedError("invoiceChanged")
      }
      const data = approveChanges(order.data, shipment.packing),
        revision = order.revision + 1
      await tx
        .insert(orderRevisions)
        .values({ orderId: order.id, revision, data, actor: s.user.id, reason: "approvedCommercialChanges" })
      await tx.update(orders).set({ data, revision, updatedAt: new Date() }).where(eq(orders.id, order.id))
      if (order.data.destination === "amazon") {
        await queueAmazon(tx, shipment, shipment.packing, data, revision, supplier.supplierOrgId)
      } else {
        await tx
          .update(shipments)
          .set({ snapshot: data, orderRevision: revision, status: "ready", updatedAt: new Date() })
          .where(eq(shipments.id, shipmentId))
        await takeSupplierStock(tx, shipmentId, supplier.supplierOrgId, data, shipment.packing)
      }
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
          // Only a supplier that joined Copacker is emailed the revised PO.
          ...(supplier.supplierOrgId && supplier.email
            ? [
                {
                  key: `po:${order.id}:${revision}`,
                  kind: "email" as const,
                  payload: { type: "po", orderId: order.id, revision, to: supplier.email }
                }
              ]
            : [])
        ])
        .onConflictDoNothing()
      await tx.insert(events).values({
        orderId: order.id,
        actor: s.user.id,
        ...eventMessage({ key: "invoiceChangesApproved", values: { revision } })
      })
    })
  )
}
export async function correctShipment(s: Session, shipmentId: string, reason: string) {
  z.string().trim().min(3).max(2000).parse(reason)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new LocalizedError("shipmentNotFound")
    }
    await accessibleOrder(s, initial.orderId, tx, true)
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || shipment.status === "creating" || finishedStates.includes(shipment.status)) {
      throw new LocalizedError("shipmentNotEditable")
    }
    if (shipment.operation === "sending" && !shipment.amazonOrderId) {
      throw new LocalizedError("reconcileBeforeCorrection")
    }
    await returnSupplierStock(tx, shipment)
    await tx
      .update(shipments)
      .set({
        status: "correction",
        issue: reason,
        packingDraft: shipment.packingDraft ?? shipment.packing,
        revision: shipment.revision + 1,
        ...(shipment.linkedAmazonShipmentId ? { amazonOrderId: null, amazonShipmentId: null, operation: "none" } : {}),
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
    await tx.insert(events).values({
      orderId: shipment.orderId,
      actor: s.user.id,
      ...eventMessage({ key: "correctionRequested", values: { reason } })
    })
  })
}

export async function savePacking(
  s: Session,
  shipmentId: string,
  raw: unknown,
  expectedRevision: number,
  expectedOrderRevision: number
) {
  const input = packingDraftSchema.parse(raw)
  return db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new LocalizedError("shipmentNotFound")
    }
    const { order } = await accessibleOrder(s, initial.orderId, tx, true)
    const draft = packingDraftSchema.parse(keepOrderPrices(s, order.data, input))
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update")
    if (!shipment || shipment.revision !== expectedRevision || order.revision !== expectedOrderRevision) {
      throw new LocalizedError("packingDraftChanged")
    }
    if (
      !["packing", "correction"].includes(shipment.status) ||
      shipment.operation !== "none" ||
      shipment.amazonOrderId
    ) {
      throw new LocalizedError("correctionBeforePackingChange")
    }
    const itemIds = new Set(order.data.items.map((item) => item.id))
    if (
      draft.cartons?.some((carton) => carton.items?.some((item) => item.itemId && !itemIds.has(item.itemId))) ||
      draft.changes?.some((change) => !itemIds.has(change.itemId))
    ) {
      throw new LocalizedError("draftProductNotOnOrder")
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
      throw new LocalizedError("shipmentNotFound")
    }
    const { order } = await accessibleOrder(s, shipment.orderId, tx)
    const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
    const all = await tx.select().from(shipments).where(eq(shipments.orderId, order.id))
    const reserved = reservedPieces(all, shipment.id)
    const result = packingReadiness(
      order.data,
      shipment,
      keepOrderPrices(s, order.data, raw ?? shipment.packingDraft ?? shipment.packing ?? {}),
      docs,
      reserved,
      order.revision,
      await serverText()
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

// A shipment in any of these states is still being prepared, created or on its way, so its PO stays open.
const inProgress = new Set<ShipmentState>([
  "approval",
  "queued",
  "creating",
  "waiting_labels",
  "ready",
  "shipped",
  "forwarded",
  "correction",
  "needs_attention"
])

// Closes a sent PO: nothing more will ship, so it drops out of On order. Shipments the supplier hasn't packed are
// cancelled; shipments still being created or on their way keep the PO open.
// Deletes a draft PO, which the supplier has never seen, with its documents, history and landed costs. A PO import
// saved as this draft goes back to review, so it can be saved again.
export async function deleteDraftOrder(s: Session, id: string) {
  requireBuyer(s)
  const files = await db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, id, tx, true)
    if (order.status !== "draft") {
      throw new LocalizedError("onlyDraftDeletable")
    }
    const [shipment] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.orderId, id))
    if (shipment) {
      throw new LocalizedError("orderHasShipments")
    }
    const removed = await tx
      .delete(documents)
      .where(eq(documents.orderId, id))
      .returning({ objectKey: documents.objectKey })
    await tx.delete(events).where(eq(events.orderId, id))
    await tx.delete(landedCosts).where(eq(landedCosts.orderId, id))
    await tx.delete(orderRevisions).where(eq(orderRevisions.orderId, id))
    await tx
      .update(poImports)
      .set({ status: "review", orderId: null, revision: sql`${poImports.revision} + 1`, updatedAt: new Date() })
      .where(eq(poImports.orderId, id))
    await tx.delete(orders).where(eq(orders.id, id))
    return removed.map((doc) => doc.objectKey)
  })
  for (const objectKey of files) {
    await discardFile(objectKey)
  }
}
export async function closeOrder(s: Session, id: string) {
  requireBuyer(s)
  return db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, id, tx, true)
    if (order.status !== "submitted") {
      throw new LocalizedError(order.status === "closed" ? "orderAlreadyClosed" : "sendBeforeClosing")
    }
    const rows = await tx.select().from(shipments).where(eq(shipments.orderId, id)).for("update")
    const busy = rows.filter(
      (row) => inProgress.has(row.status) || (row.status === "packing" && row.operation !== "none")
    )
    if (busy.length) {
      throw new LocalizedError("shipmentInProgress")
    }
    await tx
      .update(shipments)
      .set({ status: "cancelled", packingDraft: null, updatedAt: new Date() })
      .where(and(eq(shipments.orderId, id), eq(shipments.status, "packing")))
    await tx.update(orders).set({ status: "closed", updatedAt: new Date() }).where(eq(orders.id, id))
    await tx.insert(events).values({ orderId: id, actor: s.user.id, ...eventMessage({ key: "closed", values: null }) })
  })
}

// Records that a shipment's goods arrived where the PO sent them, so they leave On order.
export async function receiveShipment(s: Session, shipmentId: string) {
  requireBuyer(s)
  await db().transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!shipment) {
      throw new LocalizedError("shipmentNotFound")
    }
    const { order } = await accessibleOrder(s, shipment.orderId, tx, true)
    // Goods arrive once the last leg holder has shipped them: the forwarder when they pass through one, or else the
    // supplier.
    const arriving = forwarderLeg(order.data) ? "forwarded" : "shipped"
    if (shipment.status !== arriving) {
      throw new LocalizedError(arriving === "forwarded" ? "forwarderNotShipped" : "supplierNotShipped")
    }
    await tx.update(shipments).set({ status: "received", updatedAt: new Date() }).where(eq(shipments.id, shipmentId))
    await tx.insert(events).values({
      orderId: shipment.orderId,
      actor: s.user.id,
      ...eventMessage({ key: "shipmentReceived", values: null })
    })
  })
}
