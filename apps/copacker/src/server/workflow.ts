import { orderDestination } from "@repo/copacker-packing-rules"
import { canEditPacking, releasedStates, type ShipmentState } from "@repo/copacker-shipments/states"
import { eq } from "drizzle-orm"
import { match, P } from "ts-pattern"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { releasedLabelKinds } from "@/lib/shipment-states"
import { type AccessibleOrder, accessibleOrder } from "./access"
import { linesMissingLabels } from "./product-barcodes"
import type { ReadinessIssue } from "./readiness"
import { orderCoverage, packingReadiness, releaseIssues } from "./readiness"
import { forwarderLeg } from "./shipment-legs"
import { withRoutes } from "./shipment-routes"
import { serverText } from "./text"
import type { Session } from "./workspace-session"

// What a shipment waits on next, who does it, and the action that does it.
type NextStep = {
  owner: "buyer" | "supplier" | "forwarder" | "system" | null
  step: string
  action?: string
  message: string
}

// Where a PO and each of its shipments stand, and who acts next. `po` is the PO's id, or the PO the caller has already
// opened with accessibleOrder.
export async function orderWorkflow(s: Session, po: string | AccessibleOrder) {
  const { order, supplier } = typeof po === "string" ? await accessibleOrder(s, po) : po
  // Lines whose product can't make a label yet hold back the packet's release.
  const missingLabels = await linesMissingLabels(order)
  const t = await serverText()
  return db().transaction(async (tx) => {
    // Whether the goods pass through a forwarder, whose leg comes after the supplier's.
    const leg = forwarderLeg(order.data) !== null
    const rows = await withRoutes(
      tx,
      await tx.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(shipments.createdAt),
      order.data
    )
    const docs = await tx.select().from(documents).where(eq(documents.orderId, order.id))
    return {
      order: {
        id: order.id,
        reference: order.data.reference,
        revision: order.revision,
        status: order.status,
        destination: orderDestination(order.data)
      },
      supplier: { name: supplier.name },
      items: orderCoverage(order.data, rows),
      shipments: rows.map((shipment) => {
        const editable = canEditPacking(shipment)
        const packing = packingReadiness(
          order.data,
          shipment,
          shipment.packingDraft ?? shipment.packing ?? {},
          rows,
          order.revision,
          t
        )
        const release = releaseIssues(shipment, docs, missingLabels, t)
        const next = match<{ status: ShipmentState; editable: boolean; leg: boolean }, NextStep>({
          status: shipment.status,
          editable,
          leg
        })
          .with({ editable: true }, () => ({
            owner: "supplier",
            step: "packing",
            action: "shipment.submit",
            message: t("workflow.packing")
          }))
          .with({ status: "packed" }, () => ({
            owner: "buyer",
            step: "prepareAmazon",
            action: "shipment.prepareAmazon",
            message: t("workflow.packed")
          }))
          .with({ status: "approval" }, () => ({
            owner: "buyer",
            step: "approval",
            action: "shipment.approve",
            message: t("workflow.approval")
          }))
          .with({ status: P.union("queued", "creating") }, () => ({
            owner: "system",
            step: "processing",
            message: t("workflow.processing")
          }))
          // The labels go to the supplier by themselves once nothing in release is left.
          .with({ status: "waiting_labels" }, () => ({ owner: "buyer", step: "labels", message: t("workflow.labels") }))
          .with({ status: "ready" }, () => ({
            owner: "supplier",
            step: "ship",
            action: "shipment.ship",
            message: t("workflow.ship")
          }))
          .with({ status: "shipped", leg: true }, () => ({
            owner: "forwarder",
            step: "forward",
            action: "shipment.forward",
            message: t("workflow.forward")
          }))
          .with({ status: P.union("shipped", "forwarded") }, () => ({
            owner: "buyer",
            step: "receive",
            action: "shipment.received",
            message: t("workflow.receive")
          }))
          .with({ status: "received" }, () => ({ owner: null, step: "complete", message: t("workflow.arrived") }))
          .with({ status: "cancelled" }, () => ({ owner: null, step: "complete", message: t("workflow.cancelled") }))
          .with({ status: "correction" }, () => ({
            owner: "buyer",
            step: "cancellation",
            action: "shipment.cancelAmazon",
            message: t("workflow.cancellation")
          }))
          // Packing an Amazon order already holds, and shipments Amazon couldn't create.
          .with({ status: P.union("packing", "needs_attention") }, () =>
            shipment.operation === "sending" && !shipment.amazonOrderId
              ? { owner: "buyer", step: "reconcile", action: "shipment.reconcile", message: t("workflow.reconcile") }
              : { owner: "buyer", step: "retry", action: "shipment.retry", message: t("workflow.retry") }
          )
          .exhaustive()
        // Released shipments report what their packet lacks, such as a product label the buyer hasn't added yet.
        let issues: ReadinessIssue[] = []
        if (editable) {
          issues = packing.issues
        } else if (shipment.status === "waiting_labels" || releasedStates.includes(shipment.status)) {
          issues = release
        }
        return {
          id: shipment.id,
          revision: shipment.revision,
          orderRevision: shipment.orderRevision,
          status: shipment.status,
          issue: shipment.issue,
          packingDraft: shipment.packingDraft,
          packing: shipment.packing,
          updatedAt: shipment.updatedAt,
          readyDate: shipment.packingDraft?.readyDate ?? shipment.packing?.readyDate ?? null,
          amazonOrderId: shipment.amazonOrderId,
          amazonShipmentId: shipment.amazonShipmentId,
          next,
          editable,
          canSubmit: editable && !packing.issues.length,
          issues,
          // The packet downloads only while it's complete.
          packetUrl:
            releasedStates.includes(shipment.status) && !release.length ? `/shipments/${shipment.id}/packet` : null
        }
      }),
      documents: docs
        .filter((doc) => !doc.outdated)
        .map((doc) => {
          const shipment = rows.find((row) => row.id === doc.shipmentId)
          const downloadable =
            s.org.kind === "buyer" ||
            !releasedLabelKinds.includes(doc.kind) ||
            (!!shipment && releasedStates.includes(shipment.status))
          return {
            id: doc.id,
            name: doc.name,
            kind: doc.kind,
            shipmentId: doc.kind === "invoice" ? null : doc.shipmentId,
            cartonId: doc.cartonId,
            itemId: doc.itemId,
            downloadUrl: downloadable ? `/api/documents/${doc.id}` : null
          }
        })
    }
  })
}
