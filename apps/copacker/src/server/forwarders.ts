import { randomUUID } from "node:crypto"
import { type Address, addressSchema } from "@repo/aisle"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { contacts, forwarders, jobs, memberships, organizations } from "@/db/schema"
import { hash, token } from "./security"

const week = 7 * 86400000

export const forwarderInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .union([z.email().max(254), z.literal("")])
    .optional()
    .transform((value) => value?.toLowerCase() || null)
})

// One place a buyer can ship a PO to at a forwarder: the forwarder, and one of its addresses.
export type ForwarderAddress = {
  forwarderId: string
  forwarderName: string
  joined: boolean
  addressId: string
  addressName: string
  address: Address
}

// The buyer's forwarders, each with the addresses its POs can ship to: the ones the buyer saved until the forwarder
// joins, then the forwarder's own.
// Reads through the given database or transaction, such as a PO's saving transaction.
type Reader = Pick<ReturnType<typeof db>, "select">

export async function listForwarders(buyerOrgId: string, reader: Reader = db()) {
  const rows = await reader
    .select()
    .from(forwarders)
    .where(and(eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt)))
    .orderBy(forwarders.name)
  const joined = rows.flatMap((row) => (row.forwarderOrgId ? [row.forwarderOrgId] : []))
  const [saved, own] = await Promise.all([
    rows.length
      ? reader
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, buyerOrgId),
              inArray(
                contacts.forwarderId,
                rows.map((row) => row.id)
              )
            )
          )
      : [],
    joined.length
      ? reader
          .select()
          .from(contacts)
          .where(and(inArray(contacts.orgId, joined), eq(contacts.kind, "delivery")))
      : []
  ])
  const now = Date.now()
  return rows.map((row) => ({
    ...row,
    expired: row.expiresAt !== null && row.expiresAt.getTime() < now,
    addresses: row.forwarderOrgId
      ? own.filter((contact) => contact.orgId === row.forwarderOrgId)
      : saved.filter((contact) => contact.forwarderId === row.id)
  }))
}

export async function forwarderAddresses(buyerOrgId: string, reader: Reader = db()): Promise<ForwarderAddress[]> {
  return (await listForwarders(buyerOrgId, reader)).flatMap((row) =>
    row.addresses.map((contact) => ({
      forwarderId: row.id,
      forwarderName: row.name,
      joined: row.forwarderOrgId !== null,
      addressId: contact.id,
      addressName: contact.name,
      address: contact.address
    }))
  )
}

// Whether a PO can ship to this forwarder address: a current forwarder of the buyer, and one of its addresses.
export async function forwarderAddress(
  buyerOrgId: string,
  forwarderId: string,
  addressId: string,
  reader: Reader = db()
) {
  return (await forwarderAddresses(buyerOrgId, reader)).find(
    (row) => row.forwarderId === forwarderId && row.addressId === addressId
  )
}

async function queueInvite(forwarderId: string, email: string, buyerName: string) {
  const invitation = token()
  await db().transaction(async (tx) => {
    await tx
      .update(forwarders)
      .set({ email, invitationHash: hash(invitation), expiresAt: new Date(Date.now() + week) })
      .where(eq(forwarders.id, forwarderId))
    // Each send is its own job, whose key doubles as the email provider's idempotency key.
    await tx.insert(jobs).values({
      key: `forwarder-invite:${forwarderId}:${randomUUID()}`,
      kind: "email",
      payload: { type: "forwarder", to: email, name: buyerName, invitation }
    })
  })
}

// Adds a forwarder, or restores one the buyer removed. With an email, it's invited to join.
export async function createForwarder(buyer: { id: string; name: string }, raw: unknown) {
  const input = forwarderInputSchema.parse(raw)
  const [existing] = await db()
    .select()
    .from(forwarders)
    .where(and(eq(forwarders.buyerOrgId, buyer.id), eq(forwarders.name, input.name)))
  if (existing && !existing.removedAt) {
    throw new Error(`${input.name} is already one of your forwarders`)
  }
  const [row] = existing
    ? await db()
        .update(forwarders)
        .set({ email: input.email, removedAt: null, forwarderOrgId: null, invitationHash: null, expiresAt: null })
        .where(eq(forwarders.id, existing.id))
        .returning()
    : await db().insert(forwarders).values({ buyerOrgId: buyer.id, name: input.name, email: input.email }).returning()
  if (input.email) {
    await queueInvite(row!.id, input.email, buyer.name)
  }
  return row!
}

export async function renameForwarder(buyerOrgId: string, id: string, raw: unknown) {
  const { name } = forwarderInputSchema.pick({ name: true }).parse(raw)
  const [taken] = await db()
    .select({ id: forwarders.id })
    .from(forwarders)
    .where(and(eq(forwarders.buyerOrgId, buyerOrgId), eq(forwarders.name, name)))
  if (taken && taken.id !== id) {
    throw new Error("Another forwarder already has this name")
  }
  const updated = await db()
    .update(forwarders)
    .set({ name })
    .where(and(eq(forwarders.id, id), eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt)))
    .returning({ id: forwarders.id })
  if (!updated.length) {
    throw new Error("This forwarder was removed")
  }
}

export async function removeForwarder(buyerOrgId: string, id: string) {
  const updated = await db()
    .update(forwarders)
    .set({ removedAt: new Date(), invitationHash: null, expiresAt: null })
    .where(and(eq(forwarders.id, id), eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt)))
    .returning({ id: forwarders.id })
  if (!updated.length) {
    throw new Error("This forwarder was already removed")
  }
}

// Invites a forwarder that hasn't joined, or sends its invitation again. A new email replaces the saved one.
export async function inviteForwarder(buyer: { id: string; name: string }, id: string, rawEmail: unknown) {
  const email = z
    .union([z.email().max(254), z.literal("")])
    .optional()
    .transform((value) => value?.toLowerCase() || null)
    .parse(rawEmail)
  const [row] = await db()
    .select()
    .from(forwarders)
    .where(
      and(
        eq(forwarders.id, id),
        eq(forwarders.buyerOrgId, buyer.id),
        isNull(forwarders.forwarderOrgId),
        isNull(forwarders.removedAt)
      )
    )
  if (!row) {
    throw new Error("This forwarder has already joined or was removed")
  }
  const to = email ?? row.email
  if (!to) {
    throw new Error("Enter the forwarder's email to invite them")
  }
  await queueInvite(row.id, to, buyer.name)
}

// Saves an address for a forwarder that hasn't joined. Once it joins, it keeps its own addresses.
export async function saveForwarderAddress(buyerOrgId: string, raw: unknown) {
  const input = z
    .object({
      forwarderId: z.uuid(),
      id: z.uuid().optional(),
      name: z.string().trim().min(1).max(100),
      address: addressSchema
    })
    .parse(raw)
  const [forwarder] = await db()
    .select()
    .from(forwarders)
    .where(
      and(eq(forwarders.id, input.forwarderId), eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt))
    )
  if (!forwarder) {
    throw new Error("This forwarder was removed")
  }
  if (forwarder.forwarderOrgId) {
    throw new Error(`${forwarder.name} keeps its own addresses now that it has joined`)
  }
  const values = { name: input.name, address: input.address }
  if (input.id) {
    const updated = await db()
      .update(contacts)
      .set(values)
      .where(and(eq(contacts.id, input.id), eq(contacts.orgId, buyerOrgId), eq(contacts.forwarderId, forwarder.id)))
      .returning({ id: contacts.id })
    if (!updated.length) {
      throw new Error("This address was removed")
    }
    return
  }
  await db()
    .insert(contacts)
    .values({ orgId: buyerOrgId, kind: "forwarder", forwarderId: forwarder.id, ...values })
}

// Links an invited forwarder to the forwarder workspace its owner chose, in the given transaction (such as the one
// that creates that workspace) or in its own.
export async function acceptForwarderInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  orgId: string,
  invitation: string,
  transaction?: Transaction
) {
  if (!user.emailVerified) {
    throw new Error("Verify your email before accepting an invitation")
  }
  const accept = async (tx: Transaction) => {
    const [workspace] = await tx
      .select()
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)))
    if (workspace?.memberships.role !== "owner" || workspace.organizations.kind !== "forwarder") {
      throw new Error("Choose a forwarder workspace that you own")
    }
    const [row] = await tx
      .select()
      .from(forwarders)
      .where(eq(forwarders.invitationHash, hash(invitation)))
      .for("update")
    if (!row?.expiresAt || row.removedAt || row.expiresAt < new Date() || row.email !== user.email.toLowerCase()) {
      throw new Error("Invitation expired or belongs to a different email address")
    }
    await tx
      .update(forwarders)
      .set({ forwarderOrgId: orgId, invitationHash: null, expiresAt: null })
      .where(eq(forwarders.id, row.id))
    // The addresses the buyer saved for it become the forwarder's own, unless it already keeps some.
    const [kept] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.kind, "delivery")))
    const saved = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, row.buyerOrgId), eq(contacts.forwarderId, row.id)))
    if (!kept && saved.length) {
      await tx
        .insert(contacts)
        .values(
          saved.map((contact) => ({ orgId, kind: "delivery" as const, name: contact.name, address: contact.address }))
        )
    }
  }
  await (transaction ? accept(transaction) : db().transaction(accept))
}
