import { and, eq, inArray, like, ne, or, sql } from "drizzle-orm"
import type { Transaction } from "@/db"
import {
  amazonInboundShipments,
  amazonTransactions,
  amazonAdsConnections,
  amazonAdsDays,
  catalogs,
  connections,
  contacts,
  documents,
  events,
  forwarders,
  inventoryLocationMappings,
  jobs,
  landedCosts,
  memberships,
  monthlyCosts,
  oauthStates,
  orderProposals,
  orderRevisions,
  orders,
  organizations,
  poImports,
  productBarcodes,
  productDefaults,
  salesOrders,
  salesSyncs,
  shipments,
  shopifyBalanceTransactions,
  shopifyFieldImports,
  stockDays,
  stockSnapshots,
  supplierCatalogImports,
  supplierProductGroups,
  supplierProducts,
  supplierProfiles,
  suppliers,
  teamInvitations,
  variantFields
} from "@/db/schema"

// A workspace's records, which deleting the workspace removes. Kept apart from deletion.ts, which also signs people
// out and talks to WorkOS and the stores, so the end-to-end seed (scripts/seed-e2e.ts) can start its workspaces over.

// Deletes the workspace and everything it keeps, and returns the keys of the stored files its records pointed to, for
// the caller to delete once the transaction commits.
export async function deleteWorkspaceRecords(tx: Transaction, orgId: string) {
  const kept = await storedFiles(tx, orgId)
  await unlinkPartners(tx, orgId)
  await withdrawInvitations(tx, orgId)
  await deleteJobs(tx, orgId)
  await deleteOrders(tx, orgId)
  for (const table of [
    productDefaults,
    contacts,
    oauthStates,
    inventoryLocationMappings,
    variantFields,
    shopifyFieldImports,
    productBarcodes,
    salesOrders,
    salesSyncs,
    stockDays,
    stockSnapshots,
    amazonTransactions,
    amazonAdsConnections,
    amazonAdsDays,
    shopifyBalanceTransactions,
    monthlyCosts,
    amazonInboundShipments,
    connections,
    memberships,
    supplierProfiles
  ]) {
    await tx.delete(table).where(eq(table.orgId, orgId))
  }
  await tx.delete(suppliers).where(eq(suppliers.buyerOrgId, orgId))
  await tx.delete(forwarders).where(eq(forwarders.buyerOrgId, orgId))
  for (const table of [catalogs, supplierProducts, supplierProductGroups, supplierCatalogImports]) {
    await tx.delete(table).where(eq(table.supplierOrgId, orgId))
  }
  await tx.delete(organizations).where(eq(organizations.id, orgId))
  return kept
}

// The buyers and forwarders that linked this workspace as their supplier or forwarder manage it themselves again.
export async function unlinkPartners(tx: Transaction, orgId: string) {
  await tx.update(suppliers).set({ supplierOrgId: null }).where(eq(suppliers.supplierOrgId, orgId))
  await tx.update(forwarders).set({ forwarderOrgId: null }).where(eq(forwarders.forwarderOrgId, orgId))
}

// Invitations to join the workspace stop working, and their emails that haven't gone out don't.
export async function withdrawInvitations(tx: Transaction, orgId: string) {
  const withdrawn = await tx
    .delete(teamInvitations)
    .where(eq(teamInvitations.orgId, orgId))
    .returning({ id: teamInvitations.id })
  if (withdrawn.length) {
    await tx.delete(jobs).where(
      and(
        inArray(
          jobs.key,
          withdrawn.map((row) => `team:${row.id}`)
        ),
        ne(jobs.status, "running")
      )
    )
  }
}

// The stored files the workspace's records point to: its purchase orders' documents, imported purchase order PDFs,
// barcode labels, catalog imports and product photos.
async function storedFiles(tx: Transaction, orgId: string) {
  const [docs, imports, barcodes, catalogFiles, groups] = await Promise.all([
    tx
      .select({ key: documents.objectKey })
      .from(documents)
      .innerJoin(orders, eq(orders.id, documents.orderId))
      .where(eq(orders.buyerOrgId, orgId)),
    tx.select({ key: poImports.objectKey }).from(poImports).where(eq(poImports.orgId, orgId)),
    tx.select({ key: productBarcodes.objectKey }).from(productBarcodes).where(eq(productBarcodes.orgId, orgId)),
    tx
      .select({ key: supplierCatalogImports.objectKey })
      .from(supplierCatalogImports)
      .where(eq(supplierCatalogImports.supplierOrgId, orgId)),
    tx
      .select({ images: supplierProductGroups.images })
      .from(supplierProductGroups)
      .where(eq(supplierProductGroups.supplierOrgId, orgId))
  ])
  return [
    ...[...docs, ...imports, ...barcodes, ...catalogFiles].map((row) => row.key),
    ...groups.flatMap((row) => row.images.map((image) => image.key))
  ]
}

// The workspace's jobs that haven't started: syncs and subscriptions, emails about its purchase orders and invitations,
// and work on its shipments, imports and stock.
async function deleteJobs(tx: Transaction, orgId: string) {
  const [orderRows, shipmentRows, importRows, stockRows, supplierRows, forwarderRows] = await Promise.all([
    tx.select({ id: orders.id }).from(orders).where(eq(orders.buyerOrgId, orgId)),
    tx
      .select({ id: shipments.id })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(eq(orders.buyerOrgId, orgId)),
    tx.select({ id: poImports.id }).from(poImports).where(eq(poImports.orgId, orgId)),
    tx.select({ id: stockSnapshots.id }).from(stockSnapshots).where(eq(stockSnapshots.orgId, orgId)),
    tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.buyerOrgId, orgId)),
    tx.select({ id: forwarders.id }).from(forwarders).where(eq(forwarders.buyerOrgId, orgId))
  ])
  const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id)
  const payload = (field: string) => sql<string>`${jobs.payload}->>${field}`
  const matches = [
    eq(payload("orgId"), orgId),
    like(jobs.key, `email:data-request:%:${orgId}:%`),
    ...(orderRows.length ? [inArray(payload("orderId"), ids(orderRows))] : []),
    ...(shipmentRows.length ? [inArray(payload("shipmentId"), ids(shipmentRows))] : []),
    ...(importRows.length ? [and(eq(jobs.kind, "import"), inArray(payload("id"), ids(importRows)))] : []),
    ...(stockRows.length ? [and(eq(jobs.kind, "stock"), inArray(payload("id"), ids(stockRows)))] : []),
    ...supplierRows.map((row) => like(jobs.key, `invite:${row.id}:%`)),
    ...forwarderRows.map((row) => like(jobs.key, `forwarder-invite:${row.id}:%`))
  ]
  await tx.delete(jobs).where(and(ne(jobs.status, "running"), or(...matches)))
}

// Deletes the workspace's purchase orders with everything recorded on them.
async function deleteOrders(tx: Transaction, orgId: string) {
  const ids = (await tx.select({ id: orders.id }).from(orders).where(eq(orders.buyerOrgId, orgId))).map((row) => row.id)
  await tx.delete(poImports).where(eq(poImports.orgId, orgId))
  if (!ids.length) {
    return
  }
  for (const table of [documents, events, landedCosts, orderProposals, orderRevisions, shipments]) {
    await tx.delete(table).where(inArray(table.orderId, ids))
  }
  await tx.delete(orders).where(inArray(orders.id, ids))
}
