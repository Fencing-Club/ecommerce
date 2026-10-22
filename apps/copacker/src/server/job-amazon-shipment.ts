import { downloadAmazonLabels } from "@repo/copacker-marketplaces/amazon"
import { buildAwdRequest } from "@repo/copacker-shipments"
import { amazonReference } from "@repo/copacker-shipments/amazon-inbound"
import { matchLabels, splitPdfPages, unpackLabels } from "@repo/copacker-shipments/labels"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db, type Transaction } from "@/db"
import { shipments, orders } from "@/db/schema"
import { checkLinkedAwd } from "./awd-packing"
import { amazonFor } from "./connections"
import { storeDocument } from "./documents"
import { amazonPacking, createOnce, fbaShipmentJob } from "./fba-shipments"
import type { JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { PollAgain } from "./job-runtime"
import { queueLabels, sendQueuedLabels } from "./label-release"

// Worker job: creates a queued shipment's AWD order (or hands an FBA shipment to its inbound plan), waits for Amazon to
// confirm it, then files each carton's label and releases the labels.
export async function amazonShipmentJob(input: JobInput<"amazon">, { assertOwned }: Pick<JobContext, "assertOwned">) {
  await assertOwned()
  const { shipmentId, revision } = input
  const [shipment] = await db().select().from(shipments).where(eq(shipments.id, shipmentId))
  if (!shipment || shipment.revision !== revision || !["queued", "creating"].includes(shipment.status)) {
    return
  }
  if (!shipment.packing || !shipment.snapshot) {
    throw new Error("Shipment data is missing")
  }
  const claimed = await db()
    .update(shipments)
    .set({ status: "creating" })
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.revision, revision),
        inArray(shipments.status, ["queued", "creating"])
      )
    )
    .returning({ id: shipments.id })
  if (claimed.length !== 1) {
    return
  }
  const [order] = await db().select().from(orders).where(eq(orders.id, shipment.orderId))
  if (!order) {
    throw new Error("Purchase order is missing")
  }
  const api = await amazonFor(order.buyerOrgId, order.amazonSellerId)
  const packing = await amazonPacking(order.buyerOrgId, shipment.snapshot, shipment.packing)
  if (shipment.amazonNetwork === "fba") {
    await fbaShipmentJob(api, { ...shipment, packing, snapshot: shipment.snapshot }, input, assertOwned)
    return
  }
  let amazonShipmentId: string
  if (shipment.linkedAmazonShipmentId) {
    const remote = await api.awdInboundShipment(shipment.linkedAmazonShipmentId)
    if (remote.shipmentId !== shipment.linkedAmazonShipmentId) {
      throw new Error("Amazon returned a different shipment")
    }
    checkLinkedAwd(remote, shipment.snapshot, packing)
    amazonShipmentId = remote.shipmentId
    await assertOwned()
    await db()
      .update(shipments)
      .set({
        amazonOrderId: remote.orderId,
        amazonShipmentId,
        operation: "confirmed"
      })
      .where(and(eq(shipments.id, shipmentId), eq(shipments.revision, revision), eq(shipments.status, "creating")))
  } else {
    const request = buildAwdRequest(
      shipment.snapshot,
      packing,
      amazonReference(shipment.id, revision),
      await api.prepDetails(shipment.snapshot.items.map((item) => item.buyerSku))
    )
    let orderId = shipment.amazonOrderId
    if (!orderId) {
      if (shipment.operation === "sending") {
        throw new Error("Amazon create outcome is unknown. Reconcile the existing order before retrying.")
      }
      await api.eligibility(request.packagesToInbound)
      await assertOwned()
      const dispatch = await db()
        .update(shipments)
        .set({ status: "creating", operation: "sending" })
        .where(
          and(
            eq(shipments.id, shipmentId),
            eq(shipments.revision, revision),
            eq(shipments.status, "creating"),
            eq(shipments.operation, "none"),
            isNull(shipments.amazonOrderId)
          )
        )
        .returning({ id: shipments.id })
      if (dispatch.length !== 1) {
        throw new Error("Amazon creation is already in progress. Reconcile before retrying.")
      }
      const result = await createOnce(shipmentId, () => api.create(request))
      orderId = result.orderId
      await db()
        .update(shipments)
        .set({ amazonOrderId: orderId, operation: "created" })
        .where(eq(shipments.id, shipmentId))
    }
    await assertOwned()
    const remote = await api.order(orderId)
    if (remote.externalReferenceId !== request.externalReferenceId) {
      throw new Error("Amazon order reference does not match this shipment")
    }
    const signature = (packages: typeof request.packagesToInbound | typeof remote.packagesToInbound) =>
      JSON.stringify(
        packages
          .map((p) => [
            p.count,
            p.distributionPackage.contents.products.map((i) => [i.sku, i.quantity]),
            p.distributionPackage.measurements
          ])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      )
    if (signature(request.packagesToInbound) !== signature(remote.packagesToInbound)) {
      throw new Error("Amazon carton contents do not match the approved packing list")
    }
    for (const [key, value] of Object.entries(request.originAddress)) {
      if (value && remote.originAddress[key] !== value) {
        throw new Error("Amazon origin does not match the shipment")
      }
    }
    if (remote.orderStatus === "VALIDATING") {
      throw new PollAgain("Amazon is validating cartons")
    }
    if (remote.orderStatus === "DRAFT") {
      await assertOwned()
      await api.confirm(orderId)
      throw new PollAgain("Amazon shipment confirmation is processing")
    }
    if (remote.orderStatus !== "CONFIRMED" || !remote.destinationDetails?.shipmentId) {
      throw new Error(`Amazon order requires review: ${remote.orderStatus}`)
    }
    amazonShipmentId = remote.destinationDetails.shipmentId
    await db().update(shipments).set({ amazonShipmentId, operation: "confirmed" }).where(eq(shipments.id, shipmentId))
  }
  const labelResponse = await api.labels(amazonShipmentId)
  if (labelResponse.labelStatus === "GENERATION_FAILED") {
    throw new Error("Amazon could not generate carton labels")
  }
  if (labelResponse.labelStatus !== "GENERATED" || !labelResponse.labelDownloadURL) {
    throw new PollAgain("Amazon carton labels are generating")
  }
  await assertOwned()
  const files = await unpackLabels(await downloadAmazonLabels(labelResponse.labelDownloadURL))
  const labels = await matchLabels(files, shipment.snapshot, shipment.packing)
  for (const file of files) {
    const pages = await splitPdfPages(file.data)
    for (const label of labels.filter((l) => l.file === file.name)) {
      const bytes = pages.find((p) => p.page === label.page)!.data
      await assertOwned()
      await storeDocument(
        {
          orderId: shipment.orderId,
          shipmentId,
          kind: "carton_label",
          cartonId: label.cartonId,
          name: `Carton ${label.cartonId} - ${label.labelNumber}.pdf`,
          orderRevision: shipment.orderRevision,
          shipmentRevision: revision,
          uploadedBy: "amazon"
        },
        bytes
      )
    }
  }
  await db()
    .update(shipments)
    .set({
      labels: labels.map(({ cartonId, labelNumber, destinationCode }) => ({
        cartonId,
        labelNumber,
        destinationCode,
        amazonShipmentId
      })),
      operation: "complete",
      issue: null,
      updatedAt: new Date()
    })
    .where(eq(shipments.id, shipmentId))
  await assertOwned()
  const queued = await db().transaction(async (tx) => {
    await tx.update(shipments).set({ status: "waiting_labels" }).where(eq(shipments.id, shipmentId))
    return queueLabels(tx, { shipmentId, actor: "amazon" })
  })
  // A shipment that needs nothing more from the buyer goes straight to its supplier.
  await sendQueuedLabels(queued)
}

// A shipment whose Amazon job failed for good waits for the buyer, with the reason, unless it has moved on since.
export async function amazonShipmentFailed(
  tx: Transaction,
  { shipmentId, revision }: JobInput<"amazon">,
  issue: string
) {
  await tx
    .update(shipments)
    .set({ status: "needs_attention", issue })
    .where(
      and(
        eq(shipments.id, shipmentId),
        eq(shipments.revision, revision),
        inArray(shipments.status, ["queued", "creating"])
      )
    )
}
