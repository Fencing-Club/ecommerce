import { orderTotal } from "@repo/aisle"
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm"
import { db } from "@/db"
import {
  catalogs,
  organizations,
  orders,
  shipments,
  supplierProductGroups,
  supplierProducts,
  supplierProfiles,
  suppliers,
  type ShipmentState
} from "@/db/schema"
import { variantLabel } from "@/lib/supplier-product"
import { supplierCustomers } from "./catalogs"
import { committedStock } from "./supplier-stock"

// Where a supplier's PO stands from the supplier's side: its cartons to pack, labels to wait for, goods to ship, or done.
export type OrderStage = "pack" | "waiting" | "ship" | "shipped" | "closed"
const stages: Record<ShipmentState, OrderStage> = {
  packing: "pack",
  correction: "pack",
  needs_attention: "pack",
  approval: "waiting",
  queued: "waiting",
  creating: "waiting",
  waiting_labels: "waiting",
  ready: "ship",
  shipped: "shipped",
  forwarded: "shipped",
  received: "closed",
  cancelled: "closed"
}

function stageOf(status: string, shipment: ShipmentState | undefined): OrderStage {
  if (status === "closed") {
    return "closed"
  }
  return shipment ? stages[shipment] : "pack"
}

// The POs a supplier's customers sent, newest first, with the customer, when it was sent, and its latest shipment.
export async function supplierOrders(orgId: string, customerId?: string) {
  const rows = await db()
    .select({ order: orders, link: suppliers, customer: organizations.name })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .innerJoin(organizations, eq(organizations.id, orders.buyerOrgId))
    .where(
      and(
        eq(suppliers.supplierOrgId, orgId),
        isNull(suppliers.removedAt),
        ne(orders.status, "draft"),
        customerId ? eq(suppliers.id, customerId) : undefined
      )
    )
    .orderBy(desc(orders.createdAt))
  const list = rows.length
    ? await db()
        .select({
          id: shipments.id,
          orderId: shipments.orderId,
          status: shipments.status,
          createdAt: shipments.createdAt
        })
        .from(shipments)
        .where(
          inArray(
            shipments.orderId,
            rows.map((row) => row.order.id)
          )
        )
        .orderBy(asc(shipments.createdAt))
    : []
  return rows
    .map(({ order, link, customer }) => {
      const own = list.filter((shipment) => shipment.orderId === order.id)
      const latest = own.at(-1) ?? null
      return {
        id: order.id,
        reference: order.data.reference,
        customerId: link.id,
        customer,
        // Sending a PO opens its first shipment.
        sentAt: own[0]?.createdAt ?? order.updatedAt,
        orderStatus: order.status,
        status: order.status === "closed" ? "closed" : (latest?.status ?? order.status),
        stage: stageOf(order.status, latest?.status),
        shipmentId: latest?.id ?? null,
        currency: order.data.currency,
        total: orderTotal(order.data),
        pieces: order.data.items.reduce((sum, item) => sum + item.pieces, 0),
        lines: order.data.items.length,
        firstItem: order.data.items[0]?.name ?? ""
      }
    })
    .toSorted((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
}
export type SupplierOrder = Awaited<ReturnType<typeof supplierOrders>>[number]
// An order as a list shows it: without its total for someone who doesn't see prices.
export type ListedOrder = Omit<SupplierOrder, "total"> & { total: number | null }

// Orders for someone who doesn't see prices, without their totals.
export function withoutTotals(list: SupplierOrder[]): ListedOrder[] {
  return list.map((order) => ({ ...order, total: null }))
}

// Amounts in several currencies, added up per currency, largest first.
export function totalsByCurrency(rows: Array<{ currency: string; total: number }>) {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.total)
  }
  return [...totals].map(([currency, amount]) => ({ currency, amount })).toSorted((a, b) => b.amount - a.amount)
}

// Each customer with its catalog and what it has ordered.
export async function customerList(orgId: string) {
  const [customers, list, catalogRows] = await Promise.all([
    supplierCustomers(orgId),
    supplierOrders(orgId),
    db()
      .select({ id: catalogs.id, title: catalogs.title, status: catalogs.status })
      .from(catalogs)
      .where(eq(catalogs.supplierOrgId, orgId))
      .orderBy(asc(catalogs.title))
  ])
  return {
    catalogs: catalogRows,
    customers: customers.map((customer) => {
      const own = list.filter((order) => order.customerId === customer.id)
      return {
        ...customer,
        catalog: catalogRows.find((catalog) => catalog.id === customer.catalogId) ?? null,
        orders: own.length,
        open: own.filter((order) => order.stage !== "closed").length,
        spent: totalsByCurrency(own),
        lastOrderAt: own[0]?.sentAt ?? null
      }
    })
  }
}

// One customer: its contact details from its own profile, its catalog, and its orders.
export async function customerDetail(orgId: string, id: string) {
  const { customers, catalogs: catalogRows } = await customerList(orgId)
  const customer = customers.find((candidate) => candidate.id === id)
  if (!customer) {
    return null
  }
  const [[profile], [link], list] = await Promise.all([
    db().select().from(supplierProfiles).where(eq(supplierProfiles.orgId, customer.buyerOrgId)),
    db()
      .select({ email: suppliers.email, contactName: suppliers.contactName })
      .from(suppliers)
      .where(eq(suppliers.id, id)),
    supplierOrders(orgId, id)
  ])
  return {
    customer,
    contact: {
      name: profile?.contactName ?? null,
      email: profile?.contactEmail ?? link?.email ?? null,
      phone: profile?.phoneNumber ?? null,
      website: profile?.website ?? null
    },
    catalogs: catalogRows,
    orders: list
  }
}

// Stock of every active tracked variant: on hand, what open POs have committed, and what's left to sell.
export async function inventoryRows(orgId: string) {
  const [rows, committed] = await Promise.all([
    db()
      .select({
        id: supplierProducts.id,
        groupId: supplierProducts.groupId,
        supplierSku: supplierProducts.supplierSku,
        options: supplierProducts.options,
        trackInventory: supplierProducts.trackInventory,
        onHand: supplierProducts.onHand,
        continueSelling: supplierProducts.continueSelling,
        revision: supplierProducts.revision,
        title: supplierProductGroups.title,
        optionNames: supplierProductGroups.optionNames,
        images: supplierProductGroups.images
      })
      .from(supplierProducts)
      .innerJoin(supplierProductGroups, eq(supplierProductGroups.id, supplierProducts.groupId))
      .where(and(eq(supplierProducts.supplierOrgId, orgId), eq(supplierProducts.active, 1)))
      .orderBy(asc(supplierProductGroups.title), asc(supplierProducts.position), asc(supplierProducts.supplierSku)),
    committedStock(orgId)
  ])
  return rows.map(({ options, optionNames, images, ...row }) => {
    const owed = committed.get(row.id) ?? 0
    return {
      ...row,
      variant: variantLabel(options, optionNames),
      image: images[0] ?? null,
      committed: owed,
      available: row.onHand - owed
    }
  })
}
export type InventoryRow = Awaited<ReturnType<typeof inventoryRows>>[number]
