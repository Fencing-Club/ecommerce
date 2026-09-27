import {
  amazonNetworkNames,
  approveChanges,
  commercialChanges,
  type OrderInput,
  orderInputSchema,
  type Packing,
  packingDraftSchema,
  splitByNetwork
} from "@repo/aisle"
import { bundleSupplierComponents, piecesPerUnit } from "@repo/aisle/shopify"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
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
  landedCosts,
  poImports,
  type ShipmentState
} from "@/db/schema"
import { bundleQuote } from "@/lib/bundle-quote"
import { quantityProblem } from "@/lib/catalog-pricing"
import { accessibleOrder } from "./access"
import { requireBuyer, type Session } from "./auth"
import { customerProducts } from "./catalogs"
import { shopifyFor, amazonFor, connection } from "./connections"
import { generatePo } from "./documents"
import { forwarderAddress } from "./forwarders"
import { discardFile } from "./product-barcodes"
import { withVariantFields } from "./product-fields"
import { finishedStates, reservedPieces, packingReadiness } from "./readiness"
import { forwarderLeg } from "./shipment-legs"
import { describeError } from "./stock"
import { matchSupplierCatalog } from "./supplier-catalog-match"
import { checkSupplierStock, returnSupplierStock, takeSupplierStock } from "./supplier-stock"

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
    throw new Error("The connected merchant account changed. Refresh before saving this PO")
  }
  const [supplier] = await tx
    .select({ id: suppliers.id, supplierOrgId: suppliers.supplierOrgId })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
    .for("share")
  if (!supplier) {
    throw new Error("Select a supplier in this workspace")
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
      throw new Error("Choose one of your delivery addresses")
    }
  }
  if (
    input.destination === "forwarder" &&
    !(await forwarderAddress(s.org.id, input.forwarderId!, input.deliveryId!, tx))
  ) {
    throw new Error("Choose one of your forwarders' addresses")
  }
  if (input.via && !(await forwarderAddress(s.org.id, input.via.forwarderId, input.via.addressId, tx))) {
    throw new Error("Choose one of your forwarders' addresses for the stop on the way")
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
    .values({ orderId: order!.id, revision: 1, data: input, actor: s.user.id, reason: "PO created" })
  return order!
}
// Saves changes to a draft PO as its next revision. A sent PO changes through its shipments instead.
export async function updateDraftOrder(s: Session, id: string, raw: unknown, expectedRevision: number) {
  requireBuyer(s)
  const prepared = await prepareOrder(s, raw)
  await db().transaction(async (tx) => {
    const { order } = await accessibleOrder(s, id, tx, true)
    if (order.status !== "draft") {
      throw new Error("Only a draft PO can be edited")
    }
    if (order.revision !== expectedRevision) {
      throw new Error("This PO has changed. Refresh before saving")
    }
    if (order.shopifyDomain !== prepared.shopifyDomain) {
      throw new Error("The connected Shopify store changed. Create a new PO instead")
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
      .values({ orderId: id, revision, data: prepared.input, actor: s.user.id, reason: "PO edited" })
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
  const problems = lines.flatMap((item) => {
    const { rules } = matchSupplierCatalog(
      { supplierOrgId: supplier.supplierOrgId, supplierSku: item.supplierSku, currency: data.currency },
      products
    )
    const problem = rules && quantityProblem(rules, item.pieces, "piece")
    return problem ? [`${item.buyerSku}: ${problem.toLowerCase()}`] : []
  })
  if (problems.length) {
    throw new Error(`Change these quantities to meet the supplier’s rules. ${problems.join(". ")}`)
  }
}
export async function submitOrder(s: Session, id: string, expectedRevision: number) {
  requireBuyer(s)
  const completed = await missingAmazonIdentities(s, id)
  const submitted = await db().transaction(async (tx) => {
    const { order, supplier } = await accessibleOrder(s, id, tx, true)
    if (
      order.status !== "draft" ||
      order.revision !== expectedRevision ||
      (completed && completed.revision !== order.revision)
    ) {
      throw new Error("This PO has changed. Refresh before submitting")
    }
    if (order.data.destination !== "amazon" && order.data.destination !== "warehouse") {
      throw new Error("POs can go to Amazon or your own locations for now. Save other destinations as drafts")
    }
    if (supplier.removedAt) {
      throw new Error("This supplier was removed. Choose another supplier or add them again")
    }
    await checkSupplierStock(tx, supplier.supplierOrgId, order.data, id)
    await checkQuantityRules(tx, supplier, order.data)
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
    const [shipment] = await tx
      .insert(shipments)
      .values({ orderId: id, orderRevision: order.revision, snapshot: order.data })
      .returning()
    await tx.insert(events).values({
      orderId: id,
      actor: s.user.id,
      message: supplier.supplierOrgId ? "PO submitted to supplier" : "PO sent; share its documents with the supplier"
    })
    return { shipmentId: shipment!.id }
  })
  // The PO's document is kept with it from the start, for a supplier that isn't on Copacker as much as one that is. A
  // storage failure doesn't undo sending: the document is made again when it's emailed or downloaded.
  try {
    await generatePo(id)
  } catch (error) {
    console.error(JSON.stringify({ event: "po_document_failed", orderId: id, error: describeError(error) }))
  }
  return submitted
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
  const submitted = await db().transaction(async (tx) => {
    const [initial] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId))
    if (!initial) {
      throw new Error("Shipment not found")
    }
    const { order, supplier } = await accessibleOrder(s, initial.orderId, tx, true)
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
    const amazon = order.data.destination === "amazon"
    let status: ShipmentState = "ready"
    let message = "Packing submitted; ready to ship"
    if (approval) {
      status = "approval"
      message =
        s.org.kind === "buyer"
          ? "Invoice entered with changes to the PO"
          : "Supplier submitted invoice changes for approval"
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
    if (!approval && amazon) {
      message = await queueAmazon(tx, shipment, packing, order.data, order.revision, supplier.supplierOrgId)
    } else if (!approval) {
      await takeSupplierStock(tx, shipmentId, supplier.supplierOrgId, order.data, packing)
    }
    await tx.insert(events).values({ orderId: order.id, actor: s.user.id, message })
    return { approval, revision: shipment.revision }
  })
  // The buyer entering a supplier's invoice itself, for a supplier that isn't on Copacker, doesn't approve its own
  // changes: they're applied straight away.
  if (submitted.approval && s.org.kind === "buyer") {
    await approveInvoice(s, shipmentId, submitted.revision, false)
    return { approval: false }
  }
  return { approval: submitted.approval }
}
// Queues a shipment's cartons for Amazon, one shipment per Amazon network they go to: the shipment keeps the first
// network's cartons, and each other network's become a new shipment. Each gets its own Amazon job and takes its own
// pieces from the supplier's stock. Returns the event message.
async function queueAmazon(
  tx: Transaction,
  shipment: { id: string; orderId: string; revision: number },
  packing: Packing,
  data: OrderInput,
  orderRevision: number,
  supplierOrgId: string | null
) {
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
    const [added] = await tx
      .insert(shipments)
      .values({
        orderId: shipment.orderId,
        orderRevision,
        snapshot: data,
        packing: part.packing,
        amazonNetwork: part.network,
        status: "queued"
      })
      .returning({ id: shipments.id, revision: shipments.revision })
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
  const names = [first!, ...rest].map((part) => amazonNetworkNames[part.network]).join(" and ")
  return rest.length
    ? `Packing submitted; split into ${names} shipments and queued for Amazon`
    : `Packing submitted; Amazon ${names} creation queued`
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
    await returnSupplierStock(tx, shipment)
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
      throw new Error("Only draft POs can be deleted. Close a sent PO instead")
    }
    const [shipment] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.orderId, id))
    if (shipment) {
      throw new Error("This PO has shipments, so it can't be deleted")
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
    const { order } = await accessibleOrder(s, shipment.orderId, tx, true)
    // Goods arrive once the last leg holder has shipped them: the forwarder when they pass through one, or else the
    // supplier.
    const arriving = forwarderLeg(order.data) ? "forwarded" : "shipped"
    if (shipment.status !== arriving) {
      throw new Error(
        arriving === "forwarded"
          ? "The forwarder hasn't shipped these goods on yet"
          : "The supplier hasn't shipped these goods yet"
      )
    }
    await tx.update(shipments).set({ status: "received", updatedAt: new Date() }).where(eq(shipments.id, shipmentId))
    await tx.insert(events).values({ orderId: shipment.orderId, actor: s.user.id, message: "Shipment received" })
  })
}
