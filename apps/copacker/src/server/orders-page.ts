import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { connections, suppliers } from "@/db/schema"
import { can, isAdmin } from "@/lib/access"
import { forwarderOrders, visibleOrders } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { supplierOrders, withoutTotals } from "@/server/supplier-workspace"
import { serverTranslator } from "@/server/translation"
import { orderListRows } from "./order-list"
export async function ordersPage(input: { query: Record<string, string | string[]> }) {
  const [s, t] = await Promise.all([session(), serverTranslator("orders.index")])
  requirePage(s, "orders")
  if (s.org.kind === "supplier") {
    const [orders, { tab }] = await Promise.all([supplierOrders(s.org.id), input.query])
    return {
      view: "supplier" as const,
      orders: can(s, "prices") ? orders : withoutTotals(orders),
      tab: typeof tab === "string" ? tab : undefined
    }
  }
  // A forwarder sees the POs whose goods pass through it, without their prices.
  const rows = (s.org.kind === "forwarder" ? await forwarderOrders(s) : await visibleOrders(s)).reverse()
  // A forwarder never sees what a purchase order is worth, and a member sees it only with prices.
  const showValue = s.org.kind !== "forwarder" && can(s, "prices")
  const isBuyer = s.org.kind === "buyer"
  // With no POs yet, a buyer is pointed at whichever step comes next: connecting Shopify, inviting a supplier, or the
  // first PO.
  const [shopify] = isBuyer
    ? await db()
        .select({ id: connections.externalId })
        .from(connections)
        .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
    : []
  const [supplierLink] =
    isBuyer && !rows.length
      ? await db()
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(eq(suppliers.buyerOrgId, s.org.id), isNull(suppliers.removedAt)))
          .limit(1)
      : []
  const creates = isBuyer && can(s, "orders", "edit")
  let nextStep = {
    description: t("next.create.description"),
    href: "/orders/new",
    action: t("create"),
    allowed: creates
  }
  if (!shopify) {
    nextStep = {
      description: t("next.shopify.description"),
      href: "/settings#integrations",
      action: t("next.shopify.action"),
      allowed: isAdmin(s)
    }
  } else if (!supplierLink) {
    nextStep = {
      description: t("next.supplier.description"),
      href: "/partners",
      action: t("next.supplier.action"),
      allowed: can(s, "partners", "edit")
    }
  }
  // Someone who can't take the next step just hears there are none yet.
  const guided = isBuyer && nextStep.allowed

  return {
    view: "other" as const,
    rows: await orderListRows(rows, showValue),
    creates,
    nextStep,
    guided,
    kind: s.org.kind,
    listView: orderView(input.query)
  }
}

// The list's view from the URL. Links from before the views, such as /orders?status=draft, open the view that holds
// the same orders.
function orderView(query: Record<string, string | string[]>) {
  if (typeof query.view === "string") {
    return query.view
  }
  const legacy = new Map([
    ["draft", "draft"],
    ["submitted", "active"],
    ["closed", "closed"]
  ])
  return typeof query.status === "string" ? legacy.get(query.status) : undefined
}
