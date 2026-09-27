import { and, eq, isNull } from "drizzle-orm"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { z } from "zod"
import { PageBreadcrumb, PageHeader } from "@/components/common"
import { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { requireBuyer, session } from "@/server/auth"
import { forwarderAddresses } from "@/server/forwarders"
import { variantsNeedingBarcode } from "@/server/product-barcodes"

export const metadata: Metadata = { title: "Edit purchase order" }

// Edits a draft PO. Once sent, a PO changes through its shipments instead, so this goes back to the PO.
export default async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  requireBuyer(s)
  const id = z.uuid().parse((await params).id)
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
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.orgId, s.org.id), eq(contacts.kind, "delivery"))),
    variantsNeedingBarcode(s.org.id),
    forwarderAddresses(s.org.id)
  ])

  return (
    <>
      <PageBreadcrumb
        parents={[
          { label: "Purchase orders", href: "/orders" },
          { label: order.data.reference, href: `/orders/${id}` }
        ]}
        current="Edit"
      />
      <PageHeader title={`Edit ${order.data.reference}`} />
      <OrderBuilder
        suppliers={rows.map((row) => ({ id: row.id, name: row.name, paymentTerms: row.paymentTerms }))}
        deliveries={deliveries}
        forwarderAddresses={forwarding.map((row) => ({
          addressId: row.addressId,
          forwarderId: row.forwarderId,
          label: `${row.forwarderName}, ${row.addressName}`
        }))}
        needsBarcodeVariantIds={needsBarcode}
        draft={{ id, revision: order.revision, data: order.data }}
      />
    </>
  )
}
