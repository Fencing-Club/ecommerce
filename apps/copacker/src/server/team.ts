import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { jobs, memberships, profiles, teamInvitations } from "@/db/schema"
import type { Session } from "./auth"
import { hash, token } from "./security"

const week = 7 * 86400000
const emailSchema = z.object({ email: z.email("Enter an email address").max(254) })

// The workspace's people, owners first, and the invitations still waiting for someone to join, each with the day its
// link stops working, such as "Oct 4" in the workspace's time zone.
export async function teamOf(org: Pick<Session["org"], "id" | "timeZone">) {
  const [people, invited] = await Promise.all([
    db()
      .select({
        userId: memberships.userId,
        email: memberships.email,
        role: memberships.role,
        firstName: profiles.firstName,
        lastName: profiles.lastName
      })
      .from(memberships)
      .leftJoin(profiles, eq(profiles.userId, memberships.userId))
      .where(eq(memberships.orgId, org.id)),
    db()
      .select({ email: teamInvitations.email, expiresAt: teamInvitations.expiresAt })
      .from(teamInvitations)
      .where(eq(teamInvitations.orgId, org.id))
      .orderBy(teamInvitations.createdAt)
  ])
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: org.timeZone ?? undefined })
  const now = Date.now()
  // Someone invited twice before invitations replaced each other has one row, for the newest link.
  const invitations = new Map(
    invited.map((invitation) => [
      invitation.email,
      {
        email: invitation.email,
        expires: day.format(invitation.expiresAt),
        expired: invitation.expiresAt.getTime() < now
      }
    ])
  )
  return {
    members: people
      .map((person) => ({
        userId: person.userId,
        email: person.email,
        name: [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email,
        owner: person.role === "owner"
      }))
      .toSorted((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name)),
    invitations: [...invitations.values()]
  }
}

// Invites a colleague by email. Inviting someone who's already waiting sends them a new link, and the old one stops
// working.
export async function inviteColleague(org: Pick<Session["org"], "id" | "name">, raw: unknown) {
  const email = emailSchema.parse(raw).email.toLowerCase()
  const [member] = await db()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.email, email)))
  if (member) {
    throw new Error(`${email} is already in this workspace`)
  }
  const invitation = token()
  await db().transaction(async (tx) => {
    await withdraw(tx, org.id, email)
    const [row] = await tx
      .insert(teamInvitations)
      .values({ orgId: org.id, email, hash: hash(invitation), expiresAt: new Date(Date.now() + week) })
      .returning({ id: teamInvitations.id })
    await tx.insert(jobs).values({
      key: `team:${row!.id}`,
      kind: "email",
      payload: { type: "team", to: email, name: org.name, invitation }
    })
  })
  return { ok: true, email }
}

// Withdraws the invitation to an email, so its link stops working.
export async function cancelInvitation(orgId: string, raw: unknown) {
  const email = emailSchema.parse(raw).email.toLowerCase()
  if (!(await db().transaction((tx) => withdraw(tx, orgId, email)))) {
    throw new Error("This invitation was already accepted or withdrawn")
  }
  return { ok: true }
}

// Deletes a workspace's invitations to an email, and their emails that haven't gone out yet, so nobody gets a link that
// no longer works. Returns how many there were.
async function withdraw(tx: Transaction, orgId: string, email: string) {
  const withdrawn = await tx
    .delete(teamInvitations)
    .where(and(eq(teamInvitations.orgId, orgId), eq(teamInvitations.email, email)))
    .returning({ id: teamInvitations.id })
  const keys = withdrawn.map((row) => `team:${row.id}`)
  if (keys.length) {
    await tx.delete(jobs).where(and(inArray(jobs.key, keys), eq(jobs.status, "pending")))
  }
  return keys.length
}

// Takes a colleague out of the workspace. Owners stay, and nobody removes themselves.
export async function removeColleague(
  s: { org: Pick<Session["org"], "id">; user: Pick<Session["user"], "id"> },
  raw: unknown
) {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(raw)
  if (userId === s.user.id) {
    throw new Error("You can’t remove yourself")
  }
  const removed = await db()
    .delete(memberships)
    .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, userId), eq(memberships.role, "member")))
    .returning({ userId: memberships.userId })
  if (!removed.length) {
    throw new Error("Only members can be removed")
  }
  return { ok: true }
}
