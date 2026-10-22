import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import { addressSchema } from "@repo/copacker-orders"
import { type AmazonNetwork, amazonNetworks } from "@repo/copacker-shipments"
import { freightShipment, sellerCentralShipment } from "@repo/copacker-shipments/amazon-inbound"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import type { shipments } from "@/db/schema"
import { amazonInboundShipments } from "@/db/schema"

// The Amazon shipments a shipment's cartons travel in, each with its page in Seller Central. An FBA inbound plan can
// split into several, recorded comma-separated.
export function amazonShipmentLinks(
  shipment: Pick<typeof shipments.$inferSelect, "amazonNetwork" | "amazonShipmentId">
) {
  const { amazonNetwork: network, amazonShipmentId } = shipment
  if (!network || !amazonShipmentId) {
    return []
  }
  return amazonShipmentId.split(", ").map((id) => ({ id, url: sellerCentralShipment[network](encodeURIComponent(id)) }))
}

// Statuses of a shipment Amazon has finished with: fully received, or cancelled.
const finishedStatuses = new Set(["CLOSED", "CANCELLED"])

// Read confirmed destinations only; never create or choose a placement while rendering a shipment.
export async function amazonDestinationAddresses(
  api: Pick<Amazon, "awdInboundShipment" | "fbaPlan" | "fbaShipment">,
  shipment: Pick<typeof shipments.$inferSelect, "amazonNetwork" | "amazonShipmentId" | "amazonOrderId">
) {
  if (!shipment.amazonShipmentId) {
    return []
  }
  if (shipment.amazonNetwork === "awd_us") {
    const remote = await api.awdInboundShipment(shipment.amazonShipmentId)
    if (remote.shipmentId !== shipment.amazonShipmentId) {
      throw new Error("Amazon returned a different shipment")
    }
    return [addressSchema.parse(remote.destinationAddress)]
  }
  if (shipment.amazonNetwork === "fba" && shipment.amazonOrderId) {
    const plan = await api.fbaPlan(shipment.amazonOrderId)
    const destinations = await Promise.all(
      (plan.shipments ?? []).map(({ shipmentId }) => api.fbaShipment(shipment.amazonOrderId!, shipmentId))
    )
    const confirmed = new Set(shipment.amazonShipmentId.split(", "))
    return destinations
      .filter((row) => row.shipmentConfirmationId && confirmed.has(row.shipmentConfirmationId))
      .map((row) => z.object({ address: addressSchema }).parse(row.destination).address)
  }
  return []
}

export type AmazonShipment = {
  network: AmazonNetwork
  shipmentId: string
  name: string | null
  status: string
  createdAt: string | null
  url: string
}

// Every FBA and AWD inbound shipment in the connected Amazon account, whoever created it, each with its page in Seller
// Central. Open shipments come first, then FBA before AWD, newest first: FBA lists no dates, but its shipment IDs grow
// over time.
export async function listAmazonShipments(
  amazon: Pick<Amazon, "fbaShipments" | "awdShipments">
): Promise<AmazonShipment[]> {
  const [fba, awd] = await Promise.all([amazon.fbaShipments(), amazon.awdShipments()])
  const rows = [
    ...fba.map((row) => ({ network: "fba" as const, ...row, createdAt: null })),
    ...awd.map((row) => ({ network: "awd_us" as const, ...row, name: null }))
  ].map(({ network, shipmentId, name, status, createdAt }) => ({
    network,
    shipmentId,
    name,
    status,
    createdAt,
    url: sellerCentralShipment[network](encodeURIComponent(shipmentId))
  }))
  return rows.toSorted(
    (a, b) =>
      Number(finishedStatuses.has(a.status)) - Number(finishedStatuses.has(b.status)) ||
      amazonNetworks.indexOf(a.network) - amazonNetworks.indexOf(b.network) ||
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
      b.shipmentId.localeCompare(a.shipmentId)
  )
}

// Amazon's charges for getting stock into its warehouses: its freight service, inbound placement, transport after
// inbound, and AWD transport. Each names the shipment it's for in its ORDER_ID.
export const amazonInboundFreight = [
  "FBAInternationalInboundFreightCharge",
  "FBAInternationalInboundFreightRefund",
  "FBAInboundConvenience",
  "FBAPostInboundTransportation",
  "AWDTransportationFee"
]
export const freightDescriptions = sql.join(
  amazonInboundFreight.map((name) => sql`${name}`),
  sql`, `
)

// How long a shipment Amazon couldn't find waits before it's looked up again.
const retryMissingMs = 7 * 86400000
// Shipments looked up in one sync; the rest wait for the next.
const lookupsPerSync = 40

// Looks up the contents of the inbound shipments Amazon charged freight for, so the freight can be spread over the SKUs
// each carried. A shipment is read once; one Amazon has no record of is tried again a week later.
export async function syncInboundShipments(
  input: { orgId: string; externalAccountId: string; amazon: Pick<Amazon, "fbaShipmentUnits" | "awdShipmentUnits"> },
  assertOwned: () => Promise<void>,
  now = new Date()
) {
  const { orgId, externalAccountId, amazon } = input
  const [charged, stored] = await Promise.all([
    db().execute(sql`
      select distinct "orderId" as reference from amazon_transactions
      where "orgId" = ${orgId} and "externalAccountId" = ${externalAccountId}
        and data->>'description' in (${freightDescriptions})`),
    db()
      .select({
        shipmentId: amazonInboundShipments.shipmentId,
        found: sql<boolean>`${amazonInboundShipments.units} is not null`,
        fetchedAt: amazonInboundShipments.fetchedAt
      })
      .from(amazonInboundShipments)
      .where(
        and(eq(amazonInboundShipments.orgId, orgId), eq(amazonInboundShipments.externalAccountId, externalAccountId))
      )
  ])
  const known = new Map(stored.map((row) => [row.shipmentId, row]))
  const wanted = new Map<string, NonNullable<ReturnType<typeof freightShipment>>>()
  for (const row of (charged as unknown as { rows: { reference: string | null }[] }).rows) {
    const shipment = freightShipment(row.reference)
    const previous = shipment && known.get(shipment.shipmentId)
    if (shipment && (!previous || (!previous.found && now.getTime() - previous.fetchedAt.getTime() > retryMissingMs))) {
      wanted.set(shipment.shipmentId, shipment)
    }
  }
  for (const shipment of [...wanted.values()].slice(0, lookupsPerSync)) {
    await assertOwned()
    const units =
      shipment.network === "fba"
        ? await amazon.fbaShipmentUnits(shipment.shipmentId)
        : await amazon.awdShipmentUnits(shipment.shipmentId)
    const values = {
      network: shipment.network,
      units: units && units.size ? Object.fromEntries(units) : null,
      fetchedAt: now
    }
    await db()
      .insert(amazonInboundShipments)
      .values({ orgId, externalAccountId, shipmentId: shipment.shipmentId, ...values })
      .onConflictDoUpdate({
        target: [
          amazonInboundShipments.orgId,
          amazonInboundShipments.externalAccountId,
          amazonInboundShipments.shipmentId
        ],
        set: values
      })
  }
}

// Amazon's freight for the shipments sent from each of the buyer's POs, by PO, shipment and currency. The charges name
// the Amazon shipment (or its inbound order), which Copacker records when it creates the shipment. An FBA inbound plan
// can split into several Amazon shipments, recorded comma-separated.
export async function amazonFreightByOrder(orgId: string) {
  const result = await db().execute(sql`
    select s."orderId" as "orderId", t."orderId" as reference, t.currency, -sum(t."totalMinor") as freight
    from shipments s
    join orders o on o.id = s."orderId"
    join amazon_transactions t on t."orgId" = o."buyerOrgId"
      and (t."orderId" = any(string_to_array(s."amazonShipmentId", ', ')) or t."orderId" = s."amazonOrderId")
    where o."buyerOrgId" = ${orgId} and t.data->>'description' in (${freightDescriptions})
    group by 1, 2, 3`)
  return (result as unknown as { rows: Record<string, unknown>[] }).rows.map((row) => ({
    orderId: String(row.orderId),
    reference: String(row.reference),
    currency: String(row.currency),
    freightMinor: Number(row.freight)
  }))
}
