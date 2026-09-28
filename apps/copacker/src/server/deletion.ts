import { and, eq, inArray, like, ne, or, sql } from "drizzle-orm"
import { cookies } from "next/headers"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import {
  amazonInboundShipments,
  amazonTransactions,
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
  profiles,
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
import { LocalizedError } from "@/i18n/errors"
import type { Session } from "./auth"
import { workspaceCookie } from "./auth"
import { disconnect } from "./connections"
import { deleteFile } from "./storage"
import { workos } from "./workos"

// Deleting a person's account, and deleting a workspace. Both are for good: a person's sign-in, memberships and profile
// go, and a deleted workspace takes its purchase orders, products, connections and team with it.

// The workspaces a person owns, split by whether anyone else is in them: those they hand over before deleting their
// account, and those only they use, which close with it.
export async function ownedWorkspaces(userId: string) {
  const owned = await db()
    .select({ id: organizations.id, name: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")))
    .orderBy(organizations.name)
  const others = owned.length
    ? await db()
        .select({ orgId: memberships.orgId })
        .from(memberships)
        .where(
          and(
            inArray(
              memberships.orgId,
              owned.map((row) => row.id)
            ),
            ne(memberships.userId, userId)
          )
        )
    : []
  const shared = new Set(others.map((row) => row.orgId))
  return {
    handOver: owned.filter((row) => shared.has(row.id)),
    closing: owned.filter((row) => !shared.has(row.id))
  }
}

// Deletes the person's account: their sign-in, their place in every workspace and their profile. A workspace they own
// that others use must go to someone else first. One only they use closes: its stores are disconnected and its partners
// unlinked, and its records stay, as its partners' purchase orders refer to them. Their comments and uploads stay with
// the purchase orders they're on.
export async function deleteAccount(user: { id: string; email: string }, raw: unknown) {
  const { email } = z.object({ email: z.string().trim() }).parse(raw)
  if (email.toLowerCase() !== user.email.toLowerCase()) {
    throw new LocalizedError("enterEmailToConfirm")
  }
  const { handOver, closing } = await ownedWorkspaces(user.id)
  if (handOver.length) {
    throw new LocalizedError("transferOwnershipFirst", { workspaces: handOver.map((row) => row.name).join(", ") })
  }
  for (const workspace of closing) {
    await disconnectStores(workspace.id)
  }
  // The sign-in goes first: if WorkOS can't delete it, nothing else has changed and the person can try again.
  await workos().userManagement.deleteUser(user.id)
  await db().transaction(async (tx) => {
    for (const workspace of closing) {
      await unlinkPartners(tx, workspace.id)
      await withdrawInvitations(tx, workspace.id)
    }
    await tx.delete(memberships).where(eq(memberships.userId, user.id))
    await tx.delete(oauthStates).where(eq(oauthStates.userId, user.id))
    await tx.delete(profiles).where(eq(profiles.userId, user.id))
  })
  await signedOut()
  return { redirect: "/" }
}

// Deletes a workspace and everything it keeps, for everyone in it: its purchase orders and shipments, products,
// catalogs, store connections, addresses, settings and team. Buyers and forwarders it worked with see it as not on
// Copacker again, and a buyer's suppliers keep the purchase orders it sent them only until it's deleted. The owner
// confirms by typing its name.
export async function deleteWorkspace(org: Pick<Session["org"], "id" | "name" | "workosId">, raw: unknown) {
  const { name } = z.object({ name: z.string().trim() }).parse(raw)
  if (name.toLowerCase() !== org.name.trim().toLowerCase()) {
    throw new LocalizedError("enterWorkspaceNameToConfirm")
  }
  await disconnectStores(org.id)
  const files = await db().transaction(async (tx) => {
    const kept = await storedFiles(tx, org.id)
    await unlinkPartners(tx, org.id)
    await withdrawInvitations(tx, org.id)
    await deleteJobs(tx, org.id)
    await deleteOrders(tx, org.id)
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
      shopifyBalanceTransactions,
      monthlyCosts,
      amazonInboundShipments,
      connections,
      memberships,
      supplierProfiles
    ]) {
      await tx.delete(table).where(eq(table.orgId, org.id))
    }
    await tx.delete(suppliers).where(eq(suppliers.buyerOrgId, org.id))
    await tx.delete(forwarders).where(eq(forwarders.buyerOrgId, org.id))
    for (const table of [catalogs, supplierProducts, supplierProductGroups, supplierCatalogImports]) {
      await tx.delete(table).where(eq(table.supplierOrgId, org.id))
    }
    await tx.delete(organizations).where(eq(organizations.id, org.id))
    return kept
  })
  // Files and the WorkOS organization go once the records have; one that can't be deleted now is only logged.
  for (const key of files) {
    await deleteFile(key).catch((error: unknown) => console.error(`Couldn’t delete stored file ${key}`, error))
  }
  if (org.workosId) {
    await workos()
      .organizations.deleteOrganization(org.workosId)
      .catch((error: unknown) => console.error(`Couldn’t delete WorkOS organization ${org.workosId}`, error))
  }
  return { redirect: "/" }
}

// Tells Shopify that Copacker no longer has access, and forgets the workspace's store connections.
async function disconnectStores(orgId: string) {
  const linked = await db()
    .select({ provider: connections.provider })
    .from(connections)
    .where(eq(connections.orgId, orgId))
  for (const { provider } of linked) {
    if (provider === "shopify" || provider === "amazon") {
      await disconnect(orgId, provider).catch((error: unknown) =>
        console.error(`Couldn’t disconnect ${provider} for ${orgId}`, error)
      )
    }
  }
}

// The buyers and forwarders that linked this workspace as their supplier or forwarder manage it themselves again.
async function unlinkPartners(tx: Transaction, orgId: string) {
  await tx.update(suppliers).set({ supplierOrgId: null }).where(eq(suppliers.supplierOrgId, orgId))
  await tx.update(forwarders).set({ forwarderOrgId: null }).where(eq(forwarders.forwarderOrgId, orgId))
}

// Invitations to join the workspace stop working, and their emails that haven't gone out don't.
async function withdrawInvitations(tx: Transaction, orgId: string) {
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

// Ends the session in this browser after its account is deleted: AuthKit's cookie and the open workspace.
async function signedOut() {
  const jar = await cookies()
  jar.delete(process.env.WORKOS_COOKIE_NAME || "wos-session")
  jar.delete(workspaceCookie)
}
