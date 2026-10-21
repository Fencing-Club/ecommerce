import { orderDestination } from "@repo/copacker-shipments"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import type { ShipmentState } from "@/db/schema"
import { documents, shipments } from "@/db/schema"
import type { ServerKey } from "@/i18n/server-text"
import { accessibleOrder } from "./access"
import { linesMissingLabels } from "./product-barcodes"
import type { ReadinessIssue } from "./readiness"
import {
  finishedStates,
  orderCoverage,
  packingReadiness,
  releasedLabelKinds,
  releasedStates,
  releaseIssues
} from "./readiness"
import { forwarderLeg } from "./shipment-legs"
import { serverText } from "./text"
import type { Session } from "./workspace-session"

const finishedMessages: Partial<Record<ShipmentState, ServerKey>> = {
  received: "workflow.arrived",
  cancelled: "workflow.cancelled"
}

export async function orderWorkflow(s: Session, orderId: string) {
  // Lines whose product can't make a label yet hold back the packet's release.
  const missingLabels = await linesMissingLabels(s, orderId)
  const t = await serverText()
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
        destination: orderDestination(order.data)
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
          rows,
          order.revision,
          t
        )
        const release = releaseIssues(shipment, docs, missingLabels, t)
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
            message: t("workflow.packing")
          }
        } else if (shipment.status === "packed") {
          next = {
            owner: "buyer",
            step: "prepareAmazon",
            action: "shipment.prepareAmazon",
            message: t("workflow.packed")
          }
        } else if (shipment.status === "approval") {
          next = {
            owner: "buyer",
            step: "approval",
            action: "shipment.approve",
            message: t("workflow.approval")
          }
        } else if (["queued", "creating"].includes(shipment.status)) {
          next = { owner: "system", step: "processing", message: t("workflow.processing") }
        } else if (shipment.status === "waiting_labels") {
          // The labels go to the supplier by themselves once nothing in release is left.
          next = { owner: "buyer", step: "labels", message: t("workflow.labels") }
        } else if (shipment.status === "ready") {
          next = {
            owner: "supplier",
            step: "ship",
            action: "shipment.ship",
            message: t("workflow.ship")
          }
        } else if (shipment.status === "shipped" && leg) {
          next = {
            owner: "forwarder",
            step: "forward",
            action: "shipment.forward",
            message: t("workflow.forward")
          }
        } else if (["shipped", "forwarded"].includes(shipment.status)) {
          next = {
            owner: "buyer",
            step: "receive",
            action: "shipment.received",
            message: t("workflow.receive")
          }
        } else if (finishedStates.includes(shipment.status)) {
          next = {
            owner: null,
            step: "complete",
            message: t(finishedMessages[shipment.status] ?? "workflow.complete")
          }
        } else if (shipment.status === "correction") {
          next = {
            owner: "buyer",
            step: "cancellation",
            action: "shipment.cancelAmazon",
            message: t("workflow.cancellation")
          }
        } else {
          next =
            shipment.operation === "sending" && !shipment.amazonOrderId
              ? {
                  owner: "buyer",
                  step: "reconcile",
                  action: "shipment.reconcile",
                  message: t("workflow.reconcile")
                }
              : {
                  owner: "buyer",
                  step: "retry",
                  action: "shipment.retry",
                  message: t("workflow.retry")
                }
        }
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
