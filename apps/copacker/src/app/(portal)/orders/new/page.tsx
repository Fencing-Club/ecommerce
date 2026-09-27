import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import type { Metadata } from "next"
import { z } from "zod"
import { PageBreadcrumb, PageHeader } from "@/components/common"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { orderLine } from "@/lib/order-lines"
import { requireBuyer, session } from "@/server/auth"
import { shopifyFor } from "@/server/connections"
import { forwarderAddresses } from "@/server/forwarders"
import { variantsNeedingBarcode } from "@/server/product-barcodes"
import { lineDefaultsFor } from "@/server/product-defaults"
import { withVariantFields } from "@/server/product-fields"

export const metadata: Metadata = { title: "New purchase order" }

const variantIds = z
  .array(z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+(@[1-9]\d{0,5})?$/))
  .max(100)
  .catch([])

// Variants passed as ?variant=… (Reorder on Products, and restock) start as lines on the new PO. "<id>@<units>" also
// sets the quantity in sellable units.
async function reorderLines(orgId: string, raw: string | string[] | undefined) {
  const units = new Map(
    variantIds.parse(typeof raw === "string" ? [raw] : (raw ?? [])).map((entry) => {
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

export default async function NewOrder({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const s = await session()
  requireBuyer(s)
  const params = await searchParams
  const rows = await db()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
  const [initialItems, needsBarcode] = await Promise.all([
    reorderLines(s.org.id, params.variant),
    variantsNeedingBarcode(s.org.id)
  ])
  const forwarding = await forwarderAddresses(s.org.id)
  const deliveries = await db()
    .select({ id: contacts.id, name: contacts.name, shopifyLocationId: contacts.shopifyLocationId })
    .from(contacts)
    .where(and(eq(contacts.orgId, s.org.id), eq(contacts.kind, "delivery")))
  const initialDestination =
    params.destination === "warehouse" || params.destination === "fba" || params.destination === "awd_us"
      ? params.destination
      : "amazon"
  const linked = deliveries.filter((delivery) => delivery.shopifyLocationId === params.locationId)

  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current="New purchase order" />
      <PageHeader
        title="Create purchase order"
        description="Choose products, set quantities, and give your supplier a clear starting point."
      />
      <OrderBuilder
        suppliers={rows.map((r) => ({ id: r.id, name: r.name }))}
        deliveries={deliveries}
        forwarderAddresses={forwarding.map((row) => ({
          addressId: row.addressId,
          forwarderId: row.forwarderId,
          label: `${row.forwarderName}, ${row.addressName}`
        }))}
        initialItems={initialItems}
        needsBarcodeVariantIds={needsBarcode}
        initialDestination={initialDestination}
        initialSupplierId={rows.find((row) => row.id === params.supplierId)?.id}
        initialDeliveryId={initialDestination === "warehouse" && linked.length === 1 ? linked[0]!.id : undefined}
      />
    </>
  )
}
