import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import type * as React from "react"
import type { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { orderLine } from "@/lib/order-lines"
import type { NewOrderSearch } from "@/lib/page-search"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { shopifyFor } from "@/server/connections"
import { forwarderAddresses } from "@/server/forwarders"
import { variantsNeedingBarcode } from "@/server/product-barcodes"
import { lineDefaultsFor } from "@/server/product-defaults"
import { withVariantFields } from "@/server/product-fields"
import { serverTranslator } from "./translation"

// Variants passed as ?variant=… (Reorder on Products, and restock) start as lines on the new PO. "<id>@<units>" also
// sets the quantity in sellable units.
async function reorderLines(orgId: string, entries: string[] = []) {
  const units = new Map(
    entries.map((entry) => {
      const [id = "", count] = entry.split("@")
      return [id, count ? Number(count) : 1]
    })
  )
  if (!units.size) {
    return []
  }
  const shopify = await shopifyFor(orgId)
  const [variants, defaultsFor] = await Promise.all([
    shopify.variants([...units.keys()]).then((found) => withVariantFields(orgId, shopify.domain, found)),
    lineDefaultsFor(orgId)
  ])
  return variants.flatMap((variant) => {
    if (!variant) {
      return []
    }
    const line = orderLine(variant, randomUUID(), defaultsFor(variant))
    return [{ ...line, pieces: (units.get(variant.id) ?? 1) * line.piecesPerSet }]
  })
}

export async function newOrderPage(search: NewOrderSearch): Promise<React.ComponentProps<typeof OrderBuilder>> {
  const [s, t] = await Promise.all([session(), serverTranslator("orders")])
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  requirePage(s, "prices")
  const [rows, deliveries, initialItems, needsBarcode, forwarding] = await Promise.all([
    db()
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt))),
    db()
      .select({ id: contacts.id, name: contacts.name, shopifyLocationId: contacts.shopifyLocationId })
      .from(contacts)
      .where(and(eq(contacts.orgId, s.org.id), eq(contacts.kind, "delivery"))),
    reorderLines(s.org.id, search.variant),
    variantsNeedingBarcode(s.org.id),
    forwarderAddresses(s.org.id)
  ])
  // Restock links name the Amazon network; the PO goes to Amazon, and each line picks its network.
  const initialDestination = search.destination ?? "amazon"
  const linked = deliveries.filter((delivery) => delivery.shopifyLocationId === search.locationId)

  // The builder renders the page's header row first, then its form.
  return {
    title: t("builder.newTitle"),
    parents: [{ label: t("index.title"), href: "/orders" }],
    suppliers: rows.map((r) => ({ id: r.id, name: r.name })),
    deliveries: deliveries,
    forwarderAddresses: forwarding.map((row) => ({
      addressId: row.addressId,
      forwarderId: row.forwarderId,
      label: `${row.forwarderName}, ${row.addressName}`,
      hasPhone: Boolean(row.address.phoneNumber)
    })),
    initialItems: initialItems,
    needsBarcodeVariantIds: needsBarcode,
    initialDestination: initialDestination,
    initialSupplierId: rows.find((row) => row.id === search.supplierId)?.id,
    initialDeliveryId: initialDestination === "warehouse" && linked.length === 1 ? linked[0]!.id : undefined
  }
}
