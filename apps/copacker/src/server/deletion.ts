import { deleteCookie } from "@tanstack/react-start/server"
import { and, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, memberships, oauthStates, organizations, profiles } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { clearAuthentication } from "./auth-session"
import { disconnect } from "./connections"
import { deleteFile } from "./storage"
import { workos } from "./workos"
import { deleteWorkspaceRecords, unlinkPartners, withdrawInvitations } from "./workspace-records"
import type { Session } from "./workspace-session"
import { workspaceCookie } from "./workspace-session"

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
  const files = await db().transaction((tx) => deleteWorkspaceRecords(tx, org.id))
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
    if (provider === "shopify" || provider === "amazon" || provider === "ebay") {
      await disconnect(orgId, provider).catch((error: unknown) =>
        console.error(`Couldn’t disconnect ${provider} for ${orgId}`, error)
      )
    }
  }
}

// Ends the session in this browser after its account is deleted: AuthKit's cookie and the open workspace.
async function signedOut() {
  await clearAuthentication()
  deleteCookie(workspaceCookie, { path: "/" })
}
