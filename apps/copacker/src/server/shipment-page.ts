import { and, eq } from "drizzle-orm"
import { shipmentPlaceRows } from "@/app/(portal)/shipments/destination"
import { db } from "@/db"
import { documents, organizations, shipments } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import { can } from "@/lib/access"
import { accessibleOrder } from "@/server/access"
import { requirePage, session } from "@/server/auth"
import { proposalState } from "@/server/order-proposals"
import { shipmentPageData } from "@/server/shipment-page-data"
import { savedRoutes } from "@/server/shipment-routes"
import { supplierPickupAddresses } from "@/server/supplier-addresses"
import { serverTranslator } from "@/server/translation"
import { orderWorkflow } from "@/server/workflow"
import { pageId } from "./page-id"
import { lineLabels } from "./product-barcodes"

// A shipment's page: its rows from the database, the workflow and Amazon, made into the page's data by
// shipmentPageData, which the page's stories use too.
export async function shipmentPage(input: { id: string }) {
  const s = await session()
  requirePage(s, "shipments")
  const t = await serverTranslator("shipments.detail")
  const id = pageId(input.id)
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    throw new NotFoundError()
  }
  const { order, supplier } = await accessibleOrder(s, shipment.orderId)
  const workflow = await orderWorkflow(s, order.id)
  const snapshot = shipment.snapshot ?? order.data
  const saved = (await savedRoutes(db(), [id])).get(id)
  const [rows, docs, addresses, [buyer], { latest }, labels, places] = await Promise.all([
    db().select().from(shipments).where(eq(shipments.orderId, order.id)),
    db()
      .select()
      .from(documents)
      .where(and(eq(documents.shipmentId, id), eq(documents.outdated, false))),
    supplierPickupAddresses(supplier),
    db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, order.buyerOrgId)),
    proposalState(order.id),
    lineLabels({ ...order, data: snapshot }),
    // Only the buyer, who edits the route, is offered its forwarder addresses.
    shipmentPlaceRows(order, shipment, saved, s.org.kind === "buyer" && can(s, "shipments", "edit"))
  ])
  return shipmentPageData(
    {
      viewer: { permissions: s, kind: s.org.kind },
      shipment,
      shipments: rows,
      order,
      supplier,
      step: workflow.shipments.find((row) => row.id === id)!,
      // A purchase order's shipments are numbered oldest first, as on the shipments list.
      number: workflow.shipments.findIndex((row) => row.id === id) + 1,
      docs,
      addresses,
      buyer: buyer?.name ?? "",
      awaitingChanges: latest?.status === "pending",
      labels,
      savedRoute: saved,
      ...places
    },
    (number) => t("title", { number })
  )
}
