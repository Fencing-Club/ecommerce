import { IncompletePackingList, packingListSnapshot } from "@repo/copacker-shipments/shipping-snapshot"
import { eq } from "drizzle-orm"
import { shipmentDestinations } from "@/app/(portal)/shipments/destination"
import { db } from "@/db"
import { organizations, shipments } from "@/db/schema"
import { NotFoundError } from "@/i18n/errors"
import { packedStates } from "@/lib/shipment-states"
import { accessibleOrder } from "./access"
import { requireAccess } from "./authorization"
import { StatusError } from "./errors"
import { logEvent } from "./log"
import { serverTranslator } from "./translation"
import type { Session } from "./workspace-session"

// A shipment's packing list once its packing is finished, for whoever packs or follows it: Shipments access and its
// purchase order, as its labels need. It reads the packing and the accepted PO lines, never prices or label files, so it
// prints before Amazon's labels or the supplier packet exist. The browser renders the PDF from it.
export async function packingList(s: Session, id: string) {
  requireAccess(s, "shipments")
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, id))
  if (!shipment) {
    throw new NotFoundError()
  }
  const { order, supplier } = await accessibleOrder(s, shipment.orderId)
  if (!shipment.packing || !packedStates.includes(shipment.status)) {
    throw new StatusError("packingListUnavailable", 409)
  }
  const data = shipment.snapshot ?? order.data
  const [[buyer], numbered, destination, t] = await Promise.all([
    db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, order.buyerOrgId)),
    // A purchase order's shipments are numbered oldest first, as on the shipment's page.
    db()
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .orderBy(shipments.createdAt),
    shipmentDestinations([data]),
    serverTranslator("shipments.detail")
  ])
  if (!buyer) {
    throw new NotFoundError()
  }
  try {
    return packingListSnapshot({
      order: data,
      packing: shipment.packing,
      transport: shipment.transport,
      company: buyer.name,
      supplier: supplier.name,
      destination: destination(data, shipment.amazonNetwork),
      revision: shipment.revision,
      shipmentId: shipment.amazonShipmentId ?? t("title", { number: numbered.findIndex((row) => row.id === id) + 1 }),
      generatedDate: new Date().toISOString().slice(0, 10)
    })
  } catch (error) {
    if (!(error instanceof IncompletePackingList)) {
      throw error
    }
    logEvent("warn", "packing_list_incomplete", { shipmentId: id, issues: error.codes })
    throw new StatusError("packingListIncomplete", 409)
  }
}
