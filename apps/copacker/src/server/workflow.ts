import { eq } from "drizzle-orm"
import { db } from "@/db"
import { documents, shipments } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { orderCoverage, packingReadiness, releaseIssues, reservedPieces, type ReadinessIssue } from "./readiness"

export async function orderWorkflow(s: Session, orderId: string) {
  return db().transaction(async (tx) => {
    const { order, supplier } = await accessibleOrder(s, orderId, tx)
    const rows = await tx.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(shipments.createdAt)
    const docs = await tx.select().from(documents).where(eq(documents.orderId, orderId))
    return {
      order: {
        id: order.id,
        reference: order.data.reference,
        revision: order.revision,
        status: order.status,
        destination: order.data.destination
      },
      supplier: { name: supplier.name },
      items: orderCoverage(order.data, rows),
      shipments: rows.map((shipment) => {
        const editable =
          ["packing", "correction"].includes(shipment.status) &&
          shipment.operation === "none" &&
          !shipment.amazonOrderId
        const packing = packingReadiness(
          order.data,
          shipment,
          shipment.packingDraft ?? shipment.packing ?? {},
          docs,
          reservedPieces(rows, shipment.id),
          order.revision
        )
        const release = releaseIssues(shipment, docs)
        let next: { owner: "buyer" | "supplier" | "system" | null; step: string; action?: string; message: string }
        if (editable) {
          next = {
            owner: "supplier",
            step: "packing",
            action: "shipment.submit",
            message: "Complete the packing list and upload the commercial invoice"
          }
        } else if (shipment.status === "approval") {
          next = {
            owner: "buyer",
            step: "approval",
            action: "shipment.approve",
            message: "Review the supplier's proposed prices and supplier SKUs"
          }
        } else if (["queued", "creating"].includes(shipment.status)) {
          next = { owner: "system", step: "processing", message: "Amazon is processing the shipment and carton labels" }
        } else if (shipment.status === "waiting_labels") {
          next = release.length
            ? {
                owner: "buyer",
                step: "labels",
                message: "Book shipping in Amazon and complete the missing documents below"
              }
            : {
                owner: "buyer",
                step: "release",
                action: "shipment.release",
                message: "Enter the booking reference and release the supplier packet"
              }
        } else if (shipment.status === "ready") {
          next = { owner: "supplier", step: "print", message: "Print the packet and prepare the cartons for pickup" }
        } else if (["collected", "cancelled"].includes(shipment.status)) {
          next = {
            owner: null,
            step: "complete",
            message:
              shipment.status === "collected"
                ? "Collection has been reported"
                : "Shipment cancellation has been verified"
          }
        } else if (shipment.status === "correction") {
          next = {
            owner: "buyer",
            step: "cancellation",
            action: "shipment.cancelled",
            message: "Resolve the existing shipment in Amazon before creating a replacement"
          }
        } else {
          next =
            shipment.operation === "sending" && !shipment.amazonOrderId
              ? {
                  owner: "buyer",
                  step: "reconcile",
                  action: "shipment.reconcile",
                  message: "Find and link the Amazon order before continuing"
                }
              : {
                  owner: "buyer",
                  step: "retry",
                  action: "shipment.retry",
                  message: "Resolve the reported problem, then retry the shipment"
                }
        }
        let issues: ReadinessIssue[] = []
        if (editable) {
          issues = packing.issues
        } else if (shipment.status === "waiting_labels") {
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
          canRelease: s.org.kind === "buyer" && shipment.status === "waiting_labels" && !release.length,
          issues,
          packetUrl: ["ready", "collected"].includes(shipment.status) ? `/api/shipments/${shipment.id}/packet` : null
        }
      }),
      documents: docs
        .filter((doc) => !doc.outdated)
        .map((doc) => {
          const shipment = rows.find((row) => row.id === doc.shipmentId)
          const downloadable =
            s.org.kind === "buyer" ||
            !["carton_label", "shipping_label"].includes(doc.kind) ||
            (!!shipment && ["ready", "collected"].includes(shipment.status))
          return {
            id: doc.id,
            name: doc.name,
            kind: doc.kind,
            shipmentId: doc.shipmentId,
            cartonId: doc.cartonId,
            itemId: doc.itemId,
            downloadUrl: downloadable ? `/api/documents/${doc.id}` : null
          }
        })
    }
  })
}
