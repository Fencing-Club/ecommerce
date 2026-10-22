import { randomUUID } from "node:crypto"
import type { Address } from "@repo/copacker-orders"
import { addressSchema } from "@repo/copacker-orders"
import type { AnyColumn } from "drizzle-orm"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import invariant from "tiny-invariant"
import { z } from "zod"
import type { Transaction } from "@/db"
import { db } from "@/db"
import { contacts, forwarders, jobs, memberships, orderRevisions, orders, organizations, shipments } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { isAdmin } from "@/lib/access"
import { withJobWake } from "@/server/job-delivery"
import { requestLocale } from "@/server/localization"
import { invitationFields, optionalEmail } from "./invitations"
import { jobRow } from "./job-payloads"
import { hash } from "./security"

export const forwarderInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: optionalEmail
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

// Invites a forwarder at this email with a new link, which replaces any earlier one, in the transaction that decided to.
async function queueInvite(tx: Transaction, forwarderId: string, email: string, buyerName: string) {
  const { invitation, saved } = invitationFields()
  await tx
    .update(forwarders)
    .set({ email, ...saved })
    .where(eq(forwarders.id, forwarderId))
  // Each send is its own job, whose key doubles as the email provider's idempotency key.
  await tx.insert(jobs).values(
    jobRow("email", `forwarder-invite:${forwarderId}:${randomUUID()}`, {
      type: "forwarder",
      to: email,
      name: buyerName,
      invitation,
      locale: await requestLocale()
    })
  )
}

// Adds a forwarder, or restores one the buyer removed. With an email, it's invited to join, in the same transaction.
export async function createForwarder(
  buyer: { id: string; name: string },
  input: z.output<typeof forwarderInputSchema>
) {
  return withJobWake(
    db().transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(forwarders)
        .where(and(eq(forwarders.buyerOrgId, buyer.id), eq(forwarders.name, input.name)))
        .for("update")
      if (existing && !existing.removedAt) {
        throw new LocalizedError("forwarderAlreadyAdded", { name: input.name })
      }
      const [row] = existing
        ? await tx
            .update(forwarders)
            .set({ email: input.email, removedAt: null, forwarderOrgId: null, invitationHash: null, expiresAt: null })
            .where(eq(forwarders.id, existing.id))
            .returning()
        : await tx.insert(forwarders).values({ buyerOrgId: buyer.id, name: input.name, email: input.email }).returning()
      invariant(row, "The forwarder was saved")
      if (input.email) {
        await queueInvite(tx, row.id, input.email, buyer.name)
      }
      return row
    })
  )
}

export async function renameForwarder(buyerOrgId: string, id: string, name: string) {
  const [taken] = await db()
    .select({ id: forwarders.id })
    .from(forwarders)
    .where(and(eq(forwarders.buyerOrgId, buyerOrgId), eq(forwarders.name, name)))
  if (taken && taken.id !== id) {
    throw new LocalizedError("forwarderNameTaken")
  }
  const updated = await db()
    .update(forwarders)
    .set({ name })
    .where(and(eq(forwarders.id, id), eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt)))
    .returning({ id: forwarders.id })
  if (!updated.length) {
    throw new LocalizedError("forwarderRemoved")
  }
}

export async function removeForwarder(buyerOrgId: string, id: string) {
  const updated = await db()
    .update(forwarders)
    .set({ removedAt: new Date(), invitationHash: null, expiresAt: null })
    .where(and(eq(forwarders.id, id), eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt)))
    .returning({ id: forwarders.id })
  if (!updated.length) {
    throw new LocalizedError("forwarderAlreadyRemoved")
  }
}

// Invites a forwarder that hasn't joined, or sends its invitation again. A new email replaces the saved one.
export async function inviteForwarder(buyer: { id: string; name: string }, id: string, email: string | null) {
  await withJobWake(
    db().transaction(async (tx) => {
      const [row] = await tx
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
        .for("update")
      if (!row) {
        throw new LocalizedError("forwarderJoinedOrRemoved")
      }
      const to = email ?? row.email
      if (!to) {
        throw new LocalizedError("enterForwarderEmail")
      }
      await queueInvite(tx, row.id, to, buyer.name)
    })
  )
}

export const forwarderAddressSchema = z.object({
  forwarderId: z.uuid(),
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  address: addressSchema
})

// Saves an address for a forwarder that hasn't joined. Once it joins, it keeps its own addresses.
export async function saveForwarderAddress(buyerOrgId: string, input: z.output<typeof forwarderAddressSchema>) {
  const [forwarder] = await db()
    .select()
    .from(forwarders)
    .where(
      and(eq(forwarders.id, input.forwarderId), eq(forwarders.buyerOrgId, buyerOrgId), isNull(forwarders.removedAt))
    )
  if (!forwarder) {
    throw new LocalizedError("forwarderRemoved")
  }
  if (forwarder.forwarderOrgId) {
    throw new LocalizedError("forwarderKeepsAddresses", { name: forwarder.name })
  }
  const values = { name: input.name, address: input.address }
  if (input.id) {
    const updated = await db()
      .update(contacts)
      .set(values)
      .where(and(eq(contacts.id, input.id), eq(contacts.orgId, buyerOrgId), eq(contacts.forwarderId, forwarder.id)))
      .returning({ id: contacts.id })
    if (!updated.length) {
      throw new LocalizedError("addressRemoved")
    }
    return
  }
  await db()
    .insert(contacts)
    .values({ orgId: buyerOrgId, kind: "forwarder", forwarderId: forwarder.id, ...values })
}

// Links an invited forwarder to the forwarder workspace its owner or an admin chose, in the given transaction (such as
// the one that creates that workspace) or in its own.
export async function acceptForwarderInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  orgId: string,
  invitation: string,
  transaction?: Transaction
) {
  if (!user.emailVerified) {
    throw new LocalizedError("verifyEmailFirst")
  }
  const accept = async (tx: Transaction) => {
    const [workspace] = await tx
      .select()
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)))
    if (!workspace || !isAdmin(workspace.memberships) || workspace.organizations.kind !== "forwarder") {
      throw new LocalizedError("chooseForwarderWorkspace")
    }
    const [row] = await tx
      .select()
      .from(forwarders)
      .where(eq(forwarders.invitationHash, hash(invitation)))
      .for("update")
    if (!row?.expiresAt || row.removedAt || row.expiresAt < new Date() || row.email !== user.email.toLowerCase()) {
      throw new LocalizedError("invitationInvalid")
    }
    await tx
      .update(forwarders)
      .set({ forwarderOrgId: orgId, invitationHash: null, expiresAt: null })
      .where(eq(forwarders.id, row.id))
    // The addresses the buyer saved for it become the forwarder's own, unless it already keeps some; the ones the
    // buyer's POs stop at always do. Those POs then stop at the forwarder's copy, which it keeps up to date from here.
    const [kept] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.kind, "delivery")))
    const saved = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, row.buyerOrgId), eq(contacts.forwarderId, row.id)))
    const stops = await tx
      .selectDistinct({ addressId: sql<string>`${orders.data}->'via'->>'addressId'` })
      .from(orders)
      .where(and(eq(orders.buyerOrgId, row.buyerOrgId), sql`${orders.data}->'via'->>'forwarderId' = ${row.id}`))
    const handedOver = kept ? saved.filter((contact) => stops.some((stop) => stop.addressId === contact.id)) : saved
    for (const contact of handedOver) {
      const [copy] = await tx
        .insert(contacts)
        .values({ orgId, kind: "delivery", name: contact.name, address: contact.address })
        .returning({ id: contacts.id })
      await moveStops(tx, row.id, contact.id, copy!.id)
    }
  }
  await (transaction ? accept(transaction) : db().transaction(accept))
}

// Moves the stops at one of a forwarder's addresses to another of its addresses, in its POs, their earlier revisions and
// their shipments.
async function moveStops(tx: Transaction, forwarderId: string, from: string, to: string) {
  const stopsAt = (route: AnyColumn) =>
    and(sql`${route}->'via'->>'forwarderId' = ${forwarderId}`, sql`${route}->'via'->>'addressId' = ${from}`)
  const moved = (route: AnyColumn) => sql`jsonb_set(${route}, '{via,addressId}', to_jsonb(${to}::text))`
  await tx
    .update(orders)
    .set({ data: moved(orders.data) })
    .where(stopsAt(orders.data))
  await tx
    .update(orderRevisions)
    .set({ data: moved(orderRevisions.data) })
    .where(stopsAt(orderRevisions.data))
  await tx
    .update(shipments)
    .set({ snapshot: moved(shipments.snapshot) })
    .where(stopsAt(shipments.snapshot))
}
