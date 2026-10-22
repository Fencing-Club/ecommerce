import { redirect } from "@tanstack/react-router"
import { and, eq, isNull } from "drizzle-orm"
import type * as React from "react"
import type { OrderBuilder } from "@/components/order-builder"
import { db } from "@/db"
import { contacts, suppliers } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { forwarderAddresses } from "@/server/forwarders"
import { variantsNeedingBarcode } from "@/server/product-barcodes"
import { serverTranslator } from "./translation"

// Looking the PO up here too gives a malformed or unknown id the not-found page's title.

// Edits a draft PO. Once sent, a PO changes through its shipments instead, so this goes back to the PO.
export async function editOrderPage(params: { id: string }): Promise<React.ComponentProps<typeof OrderBuilder>> {
  const [s, t] = await Promise.all([session(), serverTranslator("orders")])
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  requirePage(s, "prices")
  const { id } = params
  const { order } = await accessibleOrder(s, id)
  if (order.status !== "draft") {
    throw redirect({ href: `/orders/${id}` })
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
  return {
    title: t("builder.edit"),
    parents: [
      { label: t("index.title"), href: "/orders" },
      { label: order.data.reference, href: `/orders/${id}` }
    ],
    suppliers: rows.map((row) => ({ id: row.id, name: row.name })),
    deliveries: deliveries,
    forwarderAddresses: forwarding.map((row) => ({
      addressId: row.addressId,
      forwarderId: row.forwarderId,
      label: `${row.forwarderName}, ${row.addressName}`,
      hasPhone: Boolean(row.address.phoneNumber)
    })),
    needsBarcodeVariantIds: needsBarcode,
    draft: { id, revision: order.revision, data: order.data }
  }
}
