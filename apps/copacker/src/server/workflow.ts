import { eq } from "drizzle-orm"
import { db } from "@/db"
import { documents, shipments, type ShipmentState } from "@/db/schema"
import { accessibleOrder } from "./access"
import type { Session } from "./auth"
import { linesMissingLabels } from "./product-barcodes"
import {
  finishedStates,
  orderCoverage,
  packingReadiness,
  releasedStates,
  releaseIssues,
  reservedPieces,
  type ReadinessIssue
} from "./readiness"
import { forwarderLeg } from "./shipment-legs"

const finishedMessages: Partial<Record<ShipmentState, string>> = {
  received: "The goods have arrived",
  cancelled: "Shipment cancellation has been verified"
}

export async function orderWorkflow(s: Session, orderId: string) {
  // Lines whose product can't make a label yet hold back the packet's release.
  const missingLabels = await linesMissingLabels(s, orderId)
  return db().transaction(async (tx) => {
    const { order, supplier } = await accessibleOrder(s, orderId, tx)
    // Whether the goods pass through a forwarder, whose leg comes after the supplier's.
    const leg = forwarderLeg(order.data) !== null
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
        const release = releaseIssues(shipment, docs, missingLabels)
        let next: {
          owner: "buyer" | "supplier" | "forwarder" | "system" | null
          step: string
          action?: string
          message: string
        }
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
                message: "Book shipping and add the missing documents below"
              }
            : {
                owner: "buyer",
                step: "release",
                action: "shipment.release",
                message: "Enter the booking reference and release the supplier packet"
              }
        } else if (shipment.status === "ready") {
          next = {
            owner: "supplier",
            step: "ship",
            action: "shipment.ship",
            message: "Print the packet, pack the cartons and mark them shipped"
          }
        } else if (shipment.status === "shipped" && leg) {
          next = {
            owner: "forwarder",
            step: "forward",
            action: "shipment.forward",
            message: "The forwarder ships the goods on with its freight cost, carrier and tracking"
          }
        } else if (["shipped", "forwarded"].includes(shipment.status)) {
          next = {
            owner: "buyer",
            step: "receive",
            action: "shipment.received",
            message: "Mark the goods received when they arrive"
          }
        } else if (finishedStates.includes(shipment.status)) {
          next = {
            owner: null,
            step: "complete",
            message: finishedMessages[shipment.status] ?? "Shipment complete"
          }
        } else if (shipment.status === "correction") {
          next = {
            owner: "buyer",
            step: "cancellation",
            action: "shipment.cancelAmazon",
            message: "Cancel the existing Amazon shipment before creating a replacement"
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
          packetUrl: releasedStates.includes(shipment.status) ? `/api/shipments/${shipment.id}/packet` : null
        }
      }),
      documents: docs
        .filter((doc) => !doc.outdated)
        .map((doc) => {
          const shipment = rows.find((row) => row.id === doc.shipmentId)
          const downloadable =
            s.org.kind === "buyer" ||
            !["carton_label", "shipping_label"].includes(doc.kind) ||
            (!!shipment && releasedStates.includes(shipment.status))
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
