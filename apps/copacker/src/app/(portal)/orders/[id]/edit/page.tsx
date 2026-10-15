import { and, eq, isNull } from "drizzle-orm"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { can } from "@/lib/access"
import { accessibleOrder } from "@/server/access"
import { noAccessTitle, requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { forwarderAddresses } from "@/server/forwarders"
import { withRequest } from "@/server/next-request"
import { variantsNeedingBarcode } from "@/server/product-barcodes"

type Props = { params: Promise<{ id: string }> }

// Looking the PO up here too gives a malformed or unknown id the not-found page's title.
export const generateMetadata = withRequest(async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [s, t] = await Promise.all([session(), getTranslations("orders.builder")])
  if (!can(s, "orders", "edit")) {
    return noAccessTitle()
  }
  const { order } = await accessibleOrder(s, (await params).id)
  return { title: t("editTitle", { reference: order.data.reference }) }
})

// Edits a draft PO. Once sent, a PO changes through its shipments instead, so this goes back to the PO.
export default withRequest(async function EditOrder({ params }: Props) {
  const [s, t] = await Promise.all([session(), getTranslations("orders")])
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  const { order } = await accessibleOrder(s, id)
  if (order.status !== "draft") {
    redirect(`/orders/${id}`)
  }
  const [rows, deliveries, needsBarcode, forwarding] = await Promise.all([
    db()
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt))),
    db()
      .select({ id: contacts.id, name: contacts.name, shopifyLocationId: contacts.shopifyLocationId })
      .from(contacts)
      .where(and(eq(contacts.orgId, s.org.id), eq(contacts.kind, "delivery"))),
    variantsNeedingBarcode(s.org.id),
    forwarderAddresses(s.org.id)
  ])

  // The builder renders the page's header row first, then its form.
  return (
    <OrderBuilder
      title={t("builder.edit")}
      parents={[
        { label: t("index.title"), href: "/orders" },
        { label: order.data.reference, href: `/orders/${id}` }
      ]}
      suppliers={rows.map((row) => ({ id: row.id, name: row.name }))}
      deliveries={deliveries}
      forwarderAddresses={forwarding.map((row) => ({
        addressId: row.addressId,
        forwarderId: row.forwarderId,
        label: `${row.forwarderName}, ${row.addressName}`,
        hasPhone: Boolean(row.address.phoneNumber)
      }))}
      needsBarcodeVariantIds={needsBarcode}
      draft={{ id, revision: order.revision, data: order.data }}
    />
  )
})
