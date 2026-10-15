import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { orderLine } from "@/lib/order-lines"
import { requirePage, session, titleFor } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { shopifyFor } from "@/server/connections"
import { forwarderAddresses } from "@/server/forwarders"
import { withRequest } from "@/server/next-request"
import { variantsNeedingBarcode } from "@/server/product-barcodes"
import { lineDefaultsFor } from "@/server/product-defaults"
import { withVariantFields } from "@/server/product-fields"

export const generateMetadata = titleFor("orders.builder.newTitle", "orders", "edit")

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

export default withRequest(async function NewOrder({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const [s, t] = await Promise.all([session(), getTranslations("orders")])
  requireBuyer(s)
  requirePage(s, "orders", "edit")
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
  // Restock links name the Amazon network; the PO goes to Amazon, and each line picks its network.
  const initialDestination = params.destination === "warehouse" ? "warehouse" : "amazon"
  const linked = deliveries.filter((delivery) => delivery.shopifyLocationId === params.locationId)

  // The builder renders the page's header row first, then its form.
  return (
    <OrderBuilder
      title={t("builder.newTitle")}
      parents={[{ label: t("index.title"), href: "/orders" }]}
      suppliers={rows.map((r) => ({ id: r.id, name: r.name }))}
      deliveries={deliveries}
      forwarderAddresses={forwarding.map((row) => ({
        addressId: row.addressId,
        forwarderId: row.forwarderId,
        label: `${row.forwarderName}, ${row.addressName}`,
        hasPhone: Boolean(row.address.phoneNumber)
      }))}
      initialItems={initialItems}
      needsBarcodeVariantIds={needsBarcode}
      initialDestination={initialDestination}
      initialSupplierId={rows.find((row) => row.id === params.supplierId)?.id}
      initialDeliveryId={initialDestination === "warehouse" && linked.length === 1 ? linked[0]!.id : undefined}
    />
  )
})
