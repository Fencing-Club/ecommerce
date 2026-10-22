import { createHash } from "node:crypto"
import { usMarketplaceId } from "@repo/copacker-marketplaces/amazon-marketplaces"
import { and, eq, isNull } from "drizzle-orm"
import type { db } from "@/db"
import {
  amazonFulfillmentShipments,
  salesOrders,
  amazonProductMappings,
  inventoryLocationMappings,
  organizations,
  inventoryUnitMappings
} from "@/db/schema"
import type { InventoryBasisInput } from "@/lib/inventory-basis"
import { historicalProductMatch } from "./amazon-product-mappings"
import { AnalyticsProblem } from "./analytics-contract"
import { hasExcludedTag, normalizeTags } from "./shopify-tags"
type Reader = Pick<ReturnType<typeof db>, "select">
type Depletion = Extract<InventoryBasisInput, { kind: "depletion" }>
function reject(code: string, detail: string): never {
  throw new AnalyticsProblem(422, code, detail)
}
async function shipmentEvidence(tx: Reader, orgId: string, input: Depletion) {
  const source = input.sale
  if (source?.source !== "amazon" || !source.shipmentItemId) {
    return null
  }
  const [order] = await tx
    .select()
    .from(salesOrders)
    .where(and(eq(salesOrders.orgId, orgId), eq(salesOrders.id, source.salesOrderId), eq(salesOrders.source, "amazon")))
  if (!order) {
    throw new AnalyticsProblem(404, "sales_order_not_found", "Sales order not found.")
  }
  const [shipment] = await tx
    .select()
    .from(amazonFulfillmentShipments)
    .where(
      and(
        eq(amazonFulfillmentShipments.orgId, orgId),
        eq(amazonFulfillmentShipments.externalAccountId, order.externalAccountId),
        eq(amazonFulfillmentShipments.shipmentId, source.shipmentReference),
        eq(amazonFulfillmentShipments.shipmentItemId, source.shipmentItemId)
      )
    )
  const line =
    "orderItems" in order.data ? order.data.orderItems.find((row) => row.orderItemId === source.orderItemId) : undefined
  if (
    !shipment ||
    shipment.orderId !== order.orderId ||
    shipment.orderItemId !== source.orderItemId ||
    shipment.quantity !== source.units ||
    shipment.sku !== line?.product.sellerSku ||
    shipment.salesChannel !== "Amazon.com" ||
    shipment.fulfillmentChannel !== "AFN"
  ) {
    reject("shipment_unresolved", "Shipment item must match the order, item, SKU, units and US FBA channel.")
  }
  // Exclude ingestion time so replacing an unchanged report does not invalidate imports.
  return {
    shipmentId: shipment.shipmentId,
    shipmentItemId: shipment.shipmentItemId,
    orderItemId: shipment.orderItemId,
    shippedAt: shipment.shippedAt.toISOString(),
    quantity: shipment.quantity,
    sku: shipment.sku,
    fulfillmentCenterId: shipment.fulfillmentCenterId
  }
}
export async function resolveDepletionDate(tx: Reader, orgId: string, input: Depletion) {
  let providerDate: string | null = null
  if (input.sale?.source === "shopify") {
    const [order] = await tx
      .select()
      .from(salesOrders)
      .where(
        and(
          eq(salesOrders.orgId, orgId),
          eq(salesOrders.id, input.sale.salesOrderId),
          eq(salesOrders.source, "shopify")
        )
      )
    if (!order) {
      throw new AnalyticsProblem(404, "sales_order_not_found", "Sales order not found.")
    }
    const fulfillmentId = input.sale.fulfillmentId
    if ("lines" in order.data) {
      providerDate = order.data.fulfillments.find((row) => row.id === fulfillmentId)?.inTransitAt ?? null
    }
  } else {
    providerDate = (await shipmentEvidence(tx, orgId, input))?.shippedAt ?? null
  }
  if (providerDate && input.occurredAt && Date.parse(providerDate) !== Date.parse(input.occurredAt)) {
    reject("shipment_date_mismatch", "The supplied date differs from the stored provider shipment timestamp.")
  }
  const date = providerDate ?? input.occurredAt
  if (!date) {
    reject(
      "shipment_date_required",
      "No provider shipment timestamp is available. Supply a dated shipping document and its timestamp."
    )
  }
  return new Date(date).toISOString()
}
export async function resolveSaleEvidence(tx: Reader, orgId: string, input: Depletion) {
  const source = input.sale
  if (!source) {
    return null
  }
  const [order] = await tx
    .select()
    .from(salesOrders)
    .where(and(eq(salesOrders.orgId, orgId), eq(salesOrders.id, source.salesOrderId)))
  if (!order || order.source !== source.source) {
    throw new AnalyticsProblem(404, "sales_order_not_found", "Sales order not found.")
  }
  const occurredAt = await resolveDepletionDate(tx, orgId, input)
  if (Date.parse(occurredAt) < order.orderedAt.getTime()) {
    reject("shipment_before_order", "Shipment evidence cannot precede the order.")
  }
  let units: number,
    sourceLocationId: string | null = null,
    mappingId: string | null = null
  let identity: string[]
  let mappingEvidence: unknown = null
  let locationEvidence: unknown = null
  let tagsEvidence: unknown = null
  if (source.source === "shopify") {
    const sale = order.data
    if (!("lines" in sale)) {
      reject("source_shape", "Refresh the stored order before importing.")
    }
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId))
    const tags = normalizeTags(org?.excludedShopifyTags ?? [])
    tagsEvidence = tags
    if (
      sale.test ||
      sale.cancelledAt ||
      !["web", "pos", "shopify_draft_order"].includes(sale.sourceName ?? "") ||
      !sale.tags ||
      hasExcludedTag(sale, tags)
    ) {
      reject(
        "sale_excluded",
        "Only native, non-test, non-cancelled Shopify orders with known, permitted tags can be imported."
      )
    }
    const fulfillment = sale.fulfillments.find((row) => row.id === source.fulfillmentId)
    const shipped = fulfillment?.lines.find((row) => row.id === source.fulfillmentLineId)
    const line = sale.lines.find((row) => row.id === shipped?.lineItem.id)
    if (!fulfillment || fulfillment.status !== "SUCCESS" || !shipped || !line || !shipped.quantity) {
      reject("fulfillment_unresolved", "Choose a successful fulfillment line with known positive quantity.")
    }
    if (
      sale.fulfillments
        .filter((row) => row.status === "SUCCESS")
        .flatMap((row) => row.lines)
        .filter((row) => row.lineItem.id === line.id)
        .reduce((sum, row) => sum + (row.quantity ?? 0), 0) > line.quantity
    ) {
      reject("quantity_inconsistent", "Fulfilled quantities exceed the order line.")
    }
    if (order.externalAccountId !== input.shopifyDomain || line.variant?.id !== input.variantId) {
      reject("product_mismatch", "Product must match the fulfilled Shopify component line.")
    }
    sourceLocationId = fulfillment.location?.id ?? null
    const [location] = sourceLocationId
      ? await tx
          .select()
          .from(inventoryLocationMappings)
          .where(
            and(
              eq(inventoryLocationMappings.orgId, orgId),
              eq(inventoryLocationMappings.shopifyDomain, order.externalAccountId),
              eq(inventoryLocationMappings.locationId, sourceLocationId)
            )
          )
      : []
    if (location?.classification !== "merchant") {
      reject("location_unresolved", "Explicitly classify the fulfillment location as merchant stock before importing.")
    }
    locationEvidence = location.classification
    // The accounting location must use the provider identity, preventing accidental pooling across warehouses.
    if (input.location !== `shopify:${order.externalAccountId}:${sourceLocationId}`) {
      reject("location_mismatch", "Use the canonical Shopify account and fulfillment location for inventory records.")
    }
    units = shipped.quantity
    identity = ["sale", "shopify", order.externalAccountId, order.orderId, fulfillment.id, shipped.id]
  } else {
    const sale = order.data
    if (!("orderItems" in sale)) {
      reject("source_shape", "Refresh the stored order before importing.")
    }
    const line = sale.orderItems.find((row) => row.orderItemId === source.orderItemId)
    if (
      sale.salesChannel.channelName !== "AMAZON" ||
      !["SHIPPED", "PARTIALLY_SHIPPED"].includes(sale.fulfillment?.fulfillmentStatus ?? "") ||
      !line
    ) {
      reject("fulfillment_unresolved", "Choose a shipped Amazon order item.")
    }
    const fulfilled = line.fulfillment?.quantityFulfilled
    if (!fulfilled || fulfilled > line.quantityOrdered || source.units > fulfilled) {
      reject("quantity_inconsistent", "Shipment units must fit the known fulfilled order quantity.")
    }
    const mappings = await tx
      .select()
      .from(amazonProductMappings)
      .where(
        and(
          eq(amazonProductMappings.orgId, orgId),
          eq(amazonProductMappings.externalAccountId, order.externalAccountId),
          isNull(amazonProductMappings.retiredAt)
        )
      )
    const match = historicalProductMatch(
      {
        sku: line.product.sellerSku ?? null,
        asin: line.product.asin ?? null,
        fnsku: null,
        marketplaceId: sale.salesChannel.marketplaceId ?? "",
        occurredAt
      },
      mappings
    )
    const mapping = match.candidates[0]
    if (
      match.status !== "confirmed" ||
      !mapping ||
      mapping.shopifyDomain !== input.shopifyDomain ||
      mapping.variantId !== input.variantId
    ) {
      reject("product_unresolved", "A unique dated Amazon product mapping must match the requested product.")
    }
    mappingId = mapping.id
    mappingEvidence = mapping
    if (sale.fulfillment?.fulfilledBy !== "AMAZON") {
      reject(
        "location_unresolved",
        "Merchant-fulfilled Amazon orders need shipment warehouse evidence not retained in the order feed."
      )
    }
    if (
      sale.salesChannel.marketplaceId !== usMarketplaceId ||
      input.location !== `amazon:${order.externalAccountId}:US:FBA`
    ) {
      reject("location_unresolved", "Only explicitly identified US FBA stock is supported.")
    }
    units = source.units
    identity = ["sale", "amazon", order.externalAccountId, order.orderId, line.orderItemId, source.shipmentReference]
    if (source.shipmentItemId) {
      identity.push(source.shipmentItemId)
    }
  }
  let unitEvidence: unknown = null
  if (input.unitMappingId) {
    const [mapping] = await tx
      .select()
      .from(inventoryUnitMappings)
      .where(
        and(
          eq(inventoryUnitMappings.orgId, orgId),
          eq(inventoryUnitMappings.id, input.unitMappingId),
          isNull(inventoryUnitMappings.retiredAt)
        )
      )
    let sourceProductId: string | undefined
    if (source.source === "shopify") {
      sourceProductId = input.variantId
    } else if ("orderItems" in order.data) {
      sourceProductId = order.data.orderItems.find((row) => row.orderItemId === source.orderItemId)?.product.sellerSku
    }
    if (
      !mapping ||
      mapping.source !== source.source ||
      mapping.externalAccountId !== order.externalAccountId ||
      mapping.sourceProductId !== sourceProductId ||
      mapping.shopifyDomain !== input.shopifyDomain ||
      mapping.variantId !== input.variantId ||
      mapping.piecesPerUnit !== input.piecesPerUnit ||
      mapping.validFrom > new Date(occurredAt) ||
      mapping.validTo <= new Date(occurredAt)
    ) {
      reject(
        "unit_mapping_changed",
        "A current dated conversion must match the source product and physical-piece quantity."
      )
    }
    unitEvidence = mapping.request
  }
  if (!Number.isSafeInteger(units * input.piecesPerUnit) || units * input.piecesPerUnit !== input.quantity) {
    reject(
      "piece_conversion_mismatch",
      "Physical pieces must equal fulfilled units multiplied by the evidenced pieces per unit."
    )
  }
  return {
    sourceKey: JSON.stringify(identity),
    fulfilledUnits:
      source.source === "amazon" && "orderItems" in order.data
        ? order.data.orderItems.find((row) => row.orderItemId === source.orderItemId)!.fulfillment!.quantityFulfilled!
        : units,
    evidence: {
      salesOrderId: order.id,
      units,
      sourceLocationId,
      mappingId,
      fingerprint: createHash("sha256")
        .update(
          JSON.stringify([
            order.data,
            mappingEvidence,
            locationEvidence,
            tagsEvidence,
            unitEvidence,
            await shipmentEvidence(tx, orgId, input)
          ])
        )
        .digest("hex")
    }
  }
}
