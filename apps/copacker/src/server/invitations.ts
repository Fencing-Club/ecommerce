import type { Address } from "@repo/copacker-orders"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { Transaction } from "@/db"
import { db } from "@/db"
import {
  contacts,
  forwarders,
  memberships,
  organizations,
  supplierProfiles,
  suppliers,
  teamInvitations
} from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { isAdmin } from "@/lib/access"
import { hash } from "./security"

// Who an invitation is for: a colleague joining a workspace, or a buyer's supplier or freight forwarder joining with a
// workspace of its own.
export type InvitationKind = "team" | "supplier" | "forwarder"

// The `kind` in an invitation link. Supplier invitations came first, and their links say "invite".
export function invitationKind(value: string | null | undefined): InvitationKind {
  if (value === "team" || value === "forwarder") {
    return value
  }
  return "supplier"
}

export function invitationPath(kind: InvitationKind, token: string) {
  return `/invite?token=${encodeURIComponent(token)}&kind=${kind === "supplier" ? "invite" : kind}`
}

export type Invitation = {
  kind: InvitationKind
  email: string
  // Who sent it: the buyer, or for a colleague, the workspace they join.
  from: string
  // What the buyer calls the supplier or forwarder, which starts the new workspace's name. A colleague's workspace.
  company: string
  expired: boolean
  // Details the buyer kept, which start the company and address steps.
  website: string
  phone: string
  addresses: Array<{ name: string; address: Address }>
}

// The invitation a link carries, before anyone signs in: enough to say who sent it and to start the new workspace.
// Null when the link is wrong, was replaced by a newer one, or was already used.
export async function findInvitation(kind: InvitationKind, token: string): Promise<Invitation | null> {
  const tokenHash = hash(token)
  const now = new Date()
  if (kind === "team") {
    const [row] = await db()
      .select({ invitation: teamInvitations, org: organizations })
      .from(teamInvitations)
      .innerJoin(organizations, eq(organizations.id, teamInvitations.orgId))
      .where(eq(teamInvitations.hash, tokenHash))
    return row
      ? {
          kind,
          email: row.invitation.email,
          from: row.org.name,
          company: row.org.name,
          expired: row.invitation.expiresAt < now,
          website: "",
          phone: "",
          addresses: []
        }
      : null
  }
  if (kind === "supplier") {
    const [row] = await db()
      .select({ supplier: suppliers, buyer: organizations })
      .from(suppliers)
      .innerJoin(organizations, eq(organizations.id, suppliers.buyerOrgId))
      .where(and(eq(suppliers.invitationHash, tokenHash), isNull(suppliers.removedAt), isNull(suppliers.supplierOrgId)))
    if (!row?.supplier.email) {
      return null
    }
    return {
      kind,
      email: row.supplier.email,
      from: row.buyer.name,
      company: row.supplier.name,
      expired: !row.supplier.expiresAt || row.supplier.expiresAt < now,
      website: row.supplier.website ?? "",
      phone: row.supplier.phoneNumber ?? "",
      addresses: []
    }
  }
  const [row] = await db()
    .select({ forwarder: forwarders, buyer: organizations })
    .from(forwarders)
    .innerJoin(organizations, eq(organizations.id, forwarders.buyerOrgId))
    .where(
      and(eq(forwarders.invitationHash, tokenHash), isNull(forwarders.removedAt), isNull(forwarders.forwarderOrgId))
    )
  if (!row?.forwarder.email) {
    return null
  }
  const saved = await db()
    .select({ name: contacts.name, address: contacts.address })
    .from(contacts)
    .where(and(eq(contacts.orgId, row.forwarder.buyerOrgId), eq(contacts.forwarderId, row.forwarder.id)))
    .orderBy(contacts.createdAt)
  return {
    kind,
    email: row.forwarder.email,
    from: row.buyer.name,
    company: row.forwarder.name,
    expired: !row.forwarder.expiresAt || row.forwarder.expiresAt < now,
    website: "",
    phone: "",
    addresses: saved
  }
}

type Invitee = { id: string; email: string; emailVerified: boolean }

function requireVerified(user: Invitee) {
  if (!user.emailVerified) {
    throw new LocalizedError("verifyEmailFirst")
  }
}

// Each acceptance runs in the given transaction, such as the one that creates the new workspace, or in its own.
function inTransaction<T>(tx: Transaction | undefined, work: (tx: Transaction) => Promise<T>) {
  return tx ? work(tx) : db().transaction(work)
}

// Adds a colleague to the workspace that invited them, and returns its id.
export async function acceptTeamInvitation(user: Invitee, token: string, tx?: Transaction) {
  requireVerified(user)
  return inTransaction(tx, async (tx) => {
    const [row] = await tx
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.hash, hash(token)))
      .for("update")
    if (!row || row.email !== user.email.toLowerCase() || row.expiresAt < new Date()) {
      throw new LocalizedError("invitationInvalid")
    }
    // They join as the invitation made them: an admin, or a member with its pages.
    await tx
      .insert(memberships)
      .values({ orgId: row.orgId, userId: user.id, email: user.email, role: row.role, access: row.access })
      .onConflictDoNothing()
    await tx.delete(teamInvitations).where(eq(teamInvitations.id, row.id))
    return row.orgId
  })
}

// Links an invited supplier to the supplier workspace its owner or an admin chose.
export async function acceptSupplierInvitation(user: Invitee, orgId: string, invitation: string, tx?: Transaction) {
  requireVerified(user)
  await inTransaction(tx, async (tx) => {
    const [workspace] = await tx
      .select()
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)))
    if (!workspace || !isAdmin(workspace.memberships) || workspace.organizations.kind !== "supplier") {
      throw new LocalizedError("chooseSupplierWorkspace")
    }
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.invitationHash, hash(invitation)))
      .for("update")
    if (
      !supplier?.expiresAt ||
      supplier.removedAt ||
      supplier.expiresAt < new Date() ||
      supplier.email !== user.email.toLowerCase()
    ) {
      throw new LocalizedError("invitationInvalid")
    }
    await tx
      .update(suppliers)
      .set({ supplierOrgId: orgId, invitationHash: null, expiresAt: null })
      .where(eq(suppliers.id, supplier.id))
    // The contact details the buyer kept become the supplier's own, where the supplier hasn't set them; from now on
    // the supplier keeps them.
    const seeded = {
      website: supplier.website,
      phoneNumber: supplier.phoneNumber,
      contactName: supplier.contactName,
      contactEmail: supplier.contactEmail
    }
    await tx
      .insert(supplierProfiles)
      .values({ orgId, ...seeded })
      .onConflictDoUpdate({
        target: supplierProfiles.orgId,
        set: {
          website: sql`coalesce(${supplierProfiles.website}, excluded.website)`,
          phoneNumber: sql`coalesce(${supplierProfiles.phoneNumber}, excluded."phoneNumber")`,
          contactName: sql`coalesce(${supplierProfiles.contactName}, excluded."contactName")`,
          contactEmail: sql`coalesce(${supplierProfiles.contactEmail}, excluded."contactEmail")`
        }
      })
  })
}
