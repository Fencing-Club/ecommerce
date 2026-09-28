import { and, eq, isNull } from "drizzle-orm"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { requireBuyer, session } from "@/server/auth"
import { forwarderAddresses } from "@/server/forwarders"
import { variantsNeedingBarcode } from "@/server/product-barcodes"

type Props = { params: Promise<{ id: string }> }

// Looking the PO up here too gives a malformed or unknown id the not-found page's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { order } = await accessibleOrder(await session(), (await params).id)
  return { title: `Edit ${order.data.reference}` }
}

// Edits a draft PO. Once sent, a PO changes through its shipments instead, so this goes back to the PO.
export default async function EditOrder({ params }: Props) {
  const s = await session()
  requireBuyer(s)
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
      title="Edit"
      parents={[
        { label: "Purchase orders", href: "/orders" },
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
}
