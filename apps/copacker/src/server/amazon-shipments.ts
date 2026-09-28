import { type AmazonNetwork, amazonNetworks } from "@repo/aisle"
import type { Amazon } from "@repo/aisle/amazon"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { amazonInboundShipments, type shipments } from "@/db/schema"

// Each network's page for one of its inbound shipments in Seller Central, which opens on the shipment's events.
const sellerCentralShipment: Record<AmazonNetwork, (shipmentId: string) => string> = {
  fba: (id) => `https://sellercentral.amazon.com/fba/inbound-shipment/summary/${id}`,
  awd_us: (id) => `https://sellercentral.amazon.com/awd/inbound-shipment/${id}`
}

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

// The inbound shipment a freight charge names: an FBA shipment (FBA15ABC12) or an AWD shipment (STAR-ABC123, sometimes
// with a date before it). Transfers from AWD to FBA (repl-...) and other references name no inbound shipment.
export function freightShipment(reference: string | null) {
  const fba = reference?.match(/^FBA[0-9A-Z]{6,}$/)
  if (fba) {
    return { network: "fba" as const, shipmentId: fba[0] }
  }
  const awd = reference?.match(/(?:^|_)(STAR-[0-9A-Z]+)$/)
  return awd ? { network: "awd" as const, shipmentId: awd[1]! } : null
}

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

export type FreightCharge = { reference: string | null; freightMinor: number }

// Spreads freight over the SKUs of the shipments it was charged for, as a cost per unit shipped: each shipment's
// freight is shared by its units. Freight for a shipment whose contents aren't known, or naming no inbound shipment
// (such as transfers from AWD to FBA), is returned as `unallocatedMinor`, to spread over every unit sold instead.
export function freightPerSku(
  charges: readonly FreightCharge[],
  shipments: ReadonlyMap<string, Readonly<Record<string, number>> | null>
) {
  const freight = new Map<string, number>(),
    shipped = new Map<string, number>()
  let unallocated = 0
  const byShipment = new Map<string, number>()
  for (const charge of charges) {
    const shipment = freightShipment(charge.reference)
    const units = shipment ? shipments.get(shipment.shipmentId) : null
    const total = units ? Object.values(units).reduce((sum, count) => sum + count, 0) : 0
    if (shipment && total > 0) {
      byShipment.set(shipment.shipmentId, (byShipment.get(shipment.shipmentId) ?? 0) + charge.freightMinor)
    } else {
      unallocated += charge.freightMinor
    }
  }
  for (const [shipmentId, charged] of byShipment) {
    const units = shipments.get(shipmentId)!
    const total = Object.values(units).reduce((sum, count) => sum + count, 0)
    for (const [sku, count] of Object.entries(units)) {
      freight.set(sku, (freight.get(sku) ?? 0) + (charged * count) / total)
      shipped.set(sku, (shipped.get(sku) ?? 0) + count)
    }
  }
  const perUnit = new Map<string, number>()
  for (const [sku, amount] of freight) {
    const count = shipped.get(sku) ?? 0
    if (count > 0 && amount !== 0) {
      perUnit.set(sku, amount / count)
    }
  }
  return { perUnit, unallocatedMinor: unallocated }
}
