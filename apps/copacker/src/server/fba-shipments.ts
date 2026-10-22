import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import type { FbaPackingOption } from "@repo/copacker-marketplaces/amazon"
import { downloadAmazonLabels, ProviderError } from "@repo/copacker-marketplaces/amazon"
import type { OrderInput } from "@repo/copacker-shipments"
import type { Packing } from "@repo/copacker-shipments"
import type { Pallet } from "@repo/copacker-shipments"
import { buildFbaPlan, fbaBoxes, originSchema, palletLabels } from "@repo/copacker-shipments"
import {
  chooseDeliveryWindow,
  choosePackingOption,
  choosePlacementOption,
  chooseTransportationOption,
  FbaInboundError,
  fbaPlanName,
  matchBoxes,
  palletConfiguration
} from "@repo/copacker-shipments/amazon-inbound"
import { combinePdfs } from "@repo/copacker-shipments/documents"
import type { CartonLabel } from "@repo/copacker-shipments/labels"
import { splitPdfPages, unpackLabels } from "@repo/copacker-shipments/labels"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { storeDocument } from "./documents"
import { forwarderAddress } from "./forwarders"
import { PollAgain } from "./job-handlers"
import { queueLabels, sendQueuedLabels } from "./label-release"

type Shipment = typeof shipments.$inferSelect & { packing: Packing; snapshot: OrderInput }

// The cartons as Amazon collects them. A PO with a forwarder stop on the way ships to Amazon from the forwarder's
// address, so the shipment's origin is that address rather than the supplier's pickup.
export async function amazonPacking(buyerOrgId: string, order: OrderInput, packing: Packing): Promise<Packing> {
  if (!order.via) {
    return packing
  }
  const stop = await forwarderAddress(buyerOrgId, order.via.forwarderId, order.via.addressId)
  if (!stop) {
    throw new LocalizedError("forwarderAddressRemoved")
  }
  const origin = originSchema.safeParse({ ...stop.address, name: stop.address.name || stop.forwarderName })
  if (!origin.success) {
    throw new LocalizedError("forwarderPhoneNeeded", { forwarder: stop.forwarderName, address: stop.addressName })
  }
  return { ...packing, origin: origin.data }
}

// Sends a request that creates an Amazon shipment. Amazon rejecting it outright (a 4xx) means nothing was created, so
// the shipment goes back to unsent and can be retried; any other failure leaves the outcome unknown until reconciled.
export async function createOnce<T>(shipmentId: string, create: () => Promise<T>) {
  try {
    return await create()
  } catch (error) {
    if (error instanceof ProviderError && error.status >= 400 && error.status < 500) {
      await db()
        .update(shipments)
        .set({ operation: "none" })
        .where(and(eq(shipments.id, shipmentId), eq(shipments.operation, "sending"), isNull(shipments.amazonOrderId)))
    }
    throw error
  }
}

// Cancels a shipment's AWD order or FBA inbound plan in Amazon, and whether Amazon has finished cancelling it. Amazon
// cancels an FBA plan in the background, so this waits a few seconds for it.
export async function cancelAmazonShipment(
  api: Pick<Amazon, "order" | "cancel" | "fbaPlan" | "fbaCancelPlan" | "fbaOperation">,
  shipment: Pick<typeof shipments.$inferSelect, "amazonOrderId" | "amazonNetwork">,
  pauseMs = 2000
) {
  const id = shipment.amazonOrderId!
  if (shipment.amazonNetwork !== "fba") {
    if ((await api.order(id)).orderStatus !== "CANCELLED") {
      await api.cancel(id)
    }
    return (await api.order(id)).orderStatus === "CANCELLED"
  }
  if ((await api.fbaPlan(id)).status === "VOIDED") {
    return true
  }
  const operationId = await api.fbaCancelPlan(id)
  for (let check = 0; check < 5; check++) {
    const operation = await api.fbaOperation(operationId)
    if (operation.operationStatus === "SUCCESS") {
      return true
    }
    if (operation.operationStatus === "FAILED") {
      const problems = operation.operationProblems.map((problem) => problem.message).join("; ")
      throw problems
        ? new LocalizedError("amazonCancelFailed", { problems })
        : new LocalizedError("amazonCancelFailedNoReason")
    }
    await new Promise((resolve) => setTimeout(resolve, pauseMs))
  }
  return false
}

// A palletized shipment's pallet labels as one file. Amazon prints four for each pallet, one for each side, for each
// Amazon shipment's pallets in order; the file keeps each pallet's labels together, the pallets in packing order.
// Amazon prints four labels for each pallet, one for each side, a page each on plain paper.
const labelsPerPallet = 4

export async function fbaPalletLabelFile(
  api: Pick<Amazon, "fbaPalletLabels">,
  pallets: ReadonlyArray<Pick<Pallet, "palletId" | "cartonIds">>,
  labels: ReadonlyArray<CartonLabel>
) {
  const placed = palletLabels(pallets, labels)
  if (!placed.length) {
    return undefined
  }
  const sheets = new Map<string, Uint8Array[]>()
  for (const amazonShipmentId of new Set(placed.map((pallet) => pallet.amazonShipmentId))) {
    const shipmentPallets = placed.filter((pallet) => pallet.amazonShipmentId === amazonShipmentId)
    const url = await api.fbaPalletLabels(amazonShipmentId, shipmentPallets.length)
    const [file] = await unpackLabels(await downloadAmazonLabels(url))
    const pages = await splitPdfPages(file!.data)
    if (pages.length !== shipmentPallets.length * labelsPerPallet) {
      throw new Error("Amazon's pallet labels don't match the shipment's pallets")
    }
    for (const [index, pallet] of shipmentPallets.entries()) {
      sheets.set(
        pallet.palletId,
        pages.slice(index * labelsPerPallet, (index + 1) * labelsPerPallet).map((page) => page.data)
      )
    }
  }
  return combinePdfs(placed.flatMap((pallet) => sheets.get(pallet.palletId)!))
}

// Moves a shipment's FBA inbound plan on as far as it can go: creating the plan, choosing packing, sending carton
// contents, choosing warehouses and the buyer's own carrier with a delivery window, then fetching each carton's box
// label. Amazon does most steps in the background, so the job waits on each one's operation and runs again.
// An FBA decision that stops the plan says why in the buyer's language.
export async function fbaShipmentJob(...args: Parameters<typeof advanceFbaPlan>) {
  try {
    return await advanceFbaPlan(...args)
  } catch (error) {
    if (error instanceof FbaInboundError) {
      throw new LocalizedError(error.code, error.values)
    }
    throw error
  }
}

async function advanceFbaPlan(
  api: Amazon,
  shipment: Shipment,
  payload: { shipmentId: string; revision: number; operationId?: string },
  assertOwned: () => Promise<void>
) {
  const { packing, snapshot: order, revision } = shipment
  const prep = await api.prepDetails(order.items.map((item) => item.buyerSku))
  const name = fbaPlanName(shipment.id, revision)
  const base = { shipmentId: shipment.id, revision }
  // Waits for Amazon to finish the step just started, then carries on from where the plan is.
  const wait = (message: string, operationId: string): never => {
    throw new PollAgain(message, { delayMs: 5000, payload: { ...base, operationId }, progressed: true })
  }
  const planId = shipment.amazonOrderId
  if (!planId) {
    if (shipment.operation === "sending") {
      throw new LocalizedError("amazonOutcomeUnknown")
    }
    const request = buildFbaPlan(order, packing, name, prep)
    await assertOwned()
    const dispatch = await db()
      .update(shipments)
      .set({ operation: "sending" })
      .where(
        and(
          eq(shipments.id, shipment.id),
          eq(shipments.revision, revision),
          eq(shipments.status, "creating"),
          eq(shipments.operation, "none"),
          isNull(shipments.amazonOrderId)
        )
      )
      .returning({ id: shipments.id })
    if (dispatch.length !== 1) {
      throw new LocalizedError("amazonCreationInProgress")
    }
    const created = await createOnce(shipment.id, () => api.fbaCreatePlan(request))
    await db()
      .update(shipments)
      .set({ amazonOrderId: created.inboundPlanId, operation: "created" })
      .where(eq(shipments.id, shipment.id))
    wait("Amazon is creating the inbound plan", created.operationId)
  }
  if (payload.operationId) {
    const operation = await api.fbaOperation(payload.operationId)
    if (operation.operationStatus === "IN_PROGRESS") {
      throw new PollAgain("Amazon is working on the inbound plan", { delayMs: 5000, payload })
    }
    if (operation.operationStatus === "FAILED") {
      const problems = operation.operationProblems.map((problem) => problem.message).join("; ")
      throw problems
        ? new LocalizedError("amazonPlanRejected", { problems })
        : new LocalizedError("amazonPlanRejectedNoReason")
    }
  }
  const plan = await api.fbaPlan(planId!)
  if (plan.name !== name) {
    throw new LocalizedError("amazonPlanNotForShipment")
  }
  if (plan.status === "VOIDED") {
    throw new LocalizedError("amazonPlanCancelled")
  }
  await assertOwned()

  // Packing: an option that keeps each carton's products together, then each carton's size, weight and contents. The
  // shipment keeps each SKU's group for the packing checks, also when no option fits, to show which cartons to repack.
  const choosePacking = async (options: FbaPackingOption[]) => {
    const chosen = await choosePackingOption(api, planId!, options, order, packing)
    await assertOwned()
    await db()
      .update(shipments)
      .set({ packingGroups: Object.fromEntries(chosen.groups) })
      .where(eq(shipments.id, shipment.id))
    if (!chosen.fits) {
      throw new LocalizedError("amazonPackSeparately")
    }
    return chosen
  }
  if (!plan.packingOptions?.some((option) => option.status === "ACCEPTED")) {
    const options = await api.fbaPackingOptions(planId!)
    if (!options.some((option) => option.status === "OFFERED")) {
      wait("Amazon is working out packing options", await api.fbaGeneratePackingOptions(planId!))
    }
    const { option } = await choosePacking(options)
    await assertOwned()
    wait("Amazon is confirming the packing option", await api.fbaConfirmPackingOption(planId!, option.packingOptionId))
  }
  const accepted = plan.placementOptions?.find((option) => option.status === "ACCEPTED")
  const placementOptionId = accepted?.placementOptionId
  if (!placementOptionId) {
    if (!(await api.fbaPlanBoxes(planId!)).length) {
      const packingOptions = await api.fbaPackingOptions(planId!)
      const packingOption = packingOptions.find((option) => option.status === "ACCEPTED")!
      const { groups } = await choosePacking([{ ...packingOption, status: "OFFERED" }])
      const grouped = new Map<string, ReturnType<typeof fbaBoxes>[number]["box"][]>()
      for (const { box } of fbaBoxes(order, packing, prep)) {
        const group = groups.get(box.items[0]!.msku)!
        grouped.set(group, [...(grouped.get(group) ?? []), box])
      }
      await assertOwned()
      wait(
        "Amazon is checking the cartons",
        await api.fbaSetPacking(planId!, {
          packageGroupings: [...grouped].map(([packingGroupId, boxes]) => ({ packingGroupId, boxes }))
        })
      )
    }
    const option = choosePlacementOption(await api.fbaPlacementOptions(planId!))
    if (!option) {
      wait("Amazon is choosing warehouses", await api.fbaGeneratePlacementOptions(planId!))
    }
    await assertOwned()
    wait("Amazon is confirming the warehouses", await api.fbaConfirmPlacementOption(planId!, option!.placementOptionId))
  }
  const placement = (await api.fbaPlacementOptions(planId!)).find(
    (option) => option.placementOptionId === placementOptionId
  )
  if (!placement) {
    throw new LocalizedError("amazonWarehousesMissing")
  }

  // Transportation: the buyer's own carrier, with a delivery window when Amazon asks for one.
  let destinations = await Promise.all(placement.shipmentIds.map((id) => api.fbaShipment(planId!, id)))
  const unbooked = destinations.filter((row) => !row.selectedTransportationOptionId)
  if (unbooked.length) {
    const listed = await Promise.all(
      unbooked.map(async (row) => ({
        shipment: row,
        options: await api.fbaTransportationOptions(planId!, placementOptionId!, row.shipmentId)
      }))
    )
    if (listed.some((row) => !row.options.length)) {
      const start = new Date(Math.max(Date.parse(`${packing.readyDate}T00:00:00Z`), Date.now() + 3600000))
      const contact = {
        name: packing.origin.name,
        phoneNumber: packing.origin.phoneNumber,
        ...(packing.origin.email ? { email: packing.origin.email } : {})
      }
      // Pallets go to Amazon per shipment, so each carton's shipment comes first.
      const cartons = packing.palletized
        ? matchBoxes(
            order,
            packing,
            prep,
            (
              await Promise.all(
                destinations.map(async (row) =>
                  (await api.fbaShipmentBoxes(planId!, row.shipmentId)).map((box) => ({
                    box,
                    shipmentId: row.shipmentId
                  }))
                )
              )
            ).flat()
          )
        : []
      await assertOwned()
      wait(
        "Amazon is finding carriers",
        await api.fbaGenerateTransportationOptions(planId!, {
          placementOptionId,
          shipmentTransportationConfigurations: unbooked.map((row) => ({
            shipmentId: row.shipmentId,
            readyToShipWindow: { start: start.toISOString() },
            contactInformation: contact,
            ...palletConfiguration(order, packing, cartons, row.shipmentId)
          }))
        })
      )
    }
    const offered = listed.map(({ shipment: row, options }) => {
      const option = chooseTransportationOption(options, packing.palletized)
      if (!option) {
        throw new LocalizedError(packing.palletized ? "amazonNoOwnFreight" : "amazonNoOwnCarrier")
      }
      return { shipment: row, option }
    })
    for (const { shipment: row, option } of offered) {
      if (!option.preconditions.includes("CONFIRMED_DELIVERY_WINDOW") || row.selectedDeliveryWindow) {
        continue
      }
      const window = chooseDeliveryWindow(
        await api.fbaDeliveryWindowOptions(planId!, row.shipmentId),
        packing.readyDate
      )
      await assertOwned()
      if (!window) {
        wait(
          "Amazon is working out delivery windows",
          await api.fbaGenerateDeliveryWindowOptions(planId!, row.shipmentId)
        )
      }
      wait(
        "Amazon is confirming the delivery window",
        await api.fbaConfirmDeliveryWindow(planId!, row.shipmentId, window!.deliveryWindowOptionId)
      )
    }
    await assertOwned()
    wait(
      "Amazon is confirming the carriers",
      await api.fbaConfirmTransportation(
        planId!,
        offered.map(({ shipment: row, option }) => ({
          shipmentId: row.shipmentId,
          transportationOptionId: option.transportationOptionId
        }))
      )
    )
  }
  destinations = await Promise.all(placement.shipmentIds.map((id) => api.fbaShipment(planId!, id)))
  if (destinations.some((row) => !row.shipmentConfirmationId)) {
    throw new PollAgain("Amazon is confirming the shipments", { delayMs: 10000, payload: base })
  }

  // Labels: each carton's own box label, from the Amazon shipment its box travels in.
  const boxes = (
    await Promise.all(
      destinations.map(async (row) =>
        (await api.fbaShipmentBoxes(planId!, row.shipmentId)).map((box) => ({ box, shipmentId: row.shipmentId }))
      )
    )
  ).flat()
  const matched = matchBoxes(order, packing, prep, boxes)
  const labels: CartonLabel[] = []
  for (const carton of matched) {
    const destination = destinations.find((row) => row.shipmentId === carton.shipmentId)!
    const url = await api.fbaBoxLabel(destination.shipmentConfirmationId!, carton.boxId)
    const [file] = await unpackLabels(await downloadAmazonLabels(url))
    await assertOwned()
    await storeDocument(
      {
        orderId: shipment.orderId,
        shipmentId: shipment.id,
        kind: "carton_label",
        cartonId: carton.cartonId,
        name: `Carton ${carton.cartonId} - ${carton.boxId}.pdf`,
        orderRevision: shipment.orderRevision,
        shipmentRevision: revision,
        uploadedBy: "amazon"
      },
      file!.data
    )
    labels.push({
      cartonId: carton.cartonId,
      labelNumber: carton.boxId,
      destinationCode: destination.destination.warehouseId ?? "",
      amazonShipmentId: destination.shipmentConfirmationId!
    })
  }
  if (packing.palletized) {
    const bytes = await fbaPalletLabelFile(api, packing.pallets ?? [], labels)
    if (bytes) {
      await assertOwned()
      await storeDocument(
        {
          orderId: shipment.orderId,
          shipmentId: shipment.id,
          kind: "pallet_label",
          name: "Pallet labels.pdf",
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
      labels,
      // The Amazon shipments the cartons travel in, in the order Amazon placed them.
      amazonShipmentId: [...new Set(labels.map((label) => label.amazonShipmentId))].join(", "),
      operation: "complete",
      issue: null,
      updatedAt: new Date()
    })
    .where(eq(shipments.id, shipment.id))
  await assertOwned()
  await assertOwned()
  const queued = await db().transaction(async (tx) => {
    await tx.update(shipments).set({ status: "waiting_labels" }).where(eq(shipments.id, shipment.id))
    return queueLabels(tx, { shipmentId: shipment.id, actor: "amazon" })
  })
  // A shipment that needs nothing more from the buyer goes straight to its supplier.
  await sendQueuedLabels(queued)
}
