import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { jobs, memberships, profiles, teamInvitations } from "@/db/schema"
import { type Access, accessSchema, highestLevel } from "@/lib/access"
import { areasFor } from "@/lib/navigation"
import type { Session } from "./auth"
import { AccessError } from "./errors"
import { hash, token } from "./security"

const week = 7 * 86400000
const emailSchema = z.object({ email: z.email("Enter an email address").max(254) })
const userSchema = z.object({ userId: z.string().min(1) })
// What someone can do: an admin everything, a member the pages chosen for them.
const grantSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("admin") }),
  z.object({ role: z.literal("member"), access: accessSchema })
])
type Grant = { role: "admin" | "member"; access: Access }

// The role and pages to save from a choice in Settings: only the pages this kind of workspace has, each at most what
// it allows (View for a page with nothing to edit, and without prices, nothing for a page about money and View for one
// whose changes set prices). A member needs at least one page.
function grantFor(kind: Session["org"]["kind"], raw: unknown): Grant {
  const grant = grantSchema.parse(raw)
  if (grant.role === "admin") {
    return { role: "admin", access: {} }
  }
  const prices = grant.access.prices !== undefined
  const access: Access = prices ? { prices: "view" } : {}
  for (const { area } of areasFor(kind)) {
    const level = grant.access[area]
    const highest = highestLevel(kind, area, prices)
    if (level && highest) {
      access[area] = highest === "view" ? "view" : level
    }
  }
  if (!Object.keys(access).some((key) => key !== "prices")) {
    throw new Error("Choose at least one page")
  }
  return { role: "member", access }
}

// The workspace's people, its owner first, and the invitations still waiting for someone to join, each with what they
// can do and the day its link stops working, such as "Oct 4" in the workspace's time zone.
export async function teamOf(org: Pick<Session["org"], "id" | "timeZone">) {
  const [people, invited] = await Promise.all([
    db()
      .select({
        userId: memberships.userId,
        email: memberships.email,
        role: memberships.role,
        access: memberships.access,
        firstName: profiles.firstName,
        lastName: profiles.lastName
      })
      .from(memberships)
      .leftJoin(profiles, eq(profiles.userId, memberships.userId))
      .where(eq(memberships.orgId, org.id)),
    db()
      .select({
        email: teamInvitations.email,
        role: teamInvitations.role,
        access: teamInvitations.access,
        expiresAt: teamInvitations.expiresAt
      })
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
        role: invitation.role,
        access: invitation.access,
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
        role: person.role,
        access: person.access
      }))
      .toSorted((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.name.localeCompare(b.name)),
    invitations: [...invitations.values()]
  }
}

// Invites a colleague by email, as an admin or as a member with the pages chosen for them. Inviting someone who's
// already waiting sends them a new link with what's chosen now, and the old link stops working.
export async function inviteColleague(org: Pick<Session["org"], "id" | "name" | "kind">, raw: unknown) {
  const email = emailSchema.parse(raw).email.toLowerCase()
  const grant = grantFor(org.kind, raw)
  const [member] = await db()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.email, email)))
  if (member) {
    throw new Error(`${email} is already in this workspace`)
  }
  await db().transaction((tx) => send(tx, org, email, grant))
  return { ok: true, email }
}

// Sends an invitation again with a new link, keeping what it gives.
export async function resendInvitation(org: Pick<Session["org"], "id" | "name">, raw: unknown) {
  const email = emailSchema.parse(raw).email.toLowerCase()
  await db().transaction(async (tx) => {
    const [waiting] = await tx
      .select({ role: teamInvitations.role, access: teamInvitations.access })
      .from(teamInvitations)
      .where(and(eq(teamInvitations.orgId, org.id), eq(teamInvitations.email, email)))
      .orderBy(desc(teamInvitations.createdAt))
      .for("update")
    if (!waiting) {
      throw new Error("This invitation was already accepted or withdrawn")
    }
    await send(tx, org, email, waiting)
  })
  return { ok: true, email }
}

// Replaces any invitation to the email with a new one, and queues its email.
async function send(tx: Transaction, org: Pick<Session["org"], "id" | "name">, email: string, grant: Grant) {
  await withdraw(tx, org.id, email)
  const invitation = token()
  const [row] = await tx
    .insert(teamInvitations)
    .values({ orgId: org.id, email, ...grant, hash: hash(invitation), expiresAt: new Date(Date.now() + week) })
    .returning({ id: teamInvitations.id })
  await tx.insert(jobs).values({
    key: `team:${row!.id}`,
    kind: "email",
    payload: { type: "team", to: email, name: org.name, invitation }
  })
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

// Changes what a colleague can do, or what an invitation will give them when they join: admin, or member with the pages
// chosen for them. The owner's access stays as it is, and nobody changes their own, so every workspace keeps its owner
// and nobody locks themselves out.
export async function changeAccess(
  s: { org: Pick<Session["org"], "id" | "kind">; user: Pick<Session["user"], "id"> },
  raw: unknown
) {
  const grant = grantFor(s.org.kind, raw)
  const invited = emailSchema.safeParse(raw)
  if (invited.success) {
    const changed = await db()
      .update(teamInvitations)
      .set(grant)
      .where(and(eq(teamInvitations.orgId, s.org.id), eq(teamInvitations.email, invited.data.email.toLowerCase())))
      .returning({ id: teamInvitations.id })
    if (!changed.length) {
      throw new Error("This invitation was already accepted or withdrawn")
    }
    return { ok: true }
  }
  const { userId } = userSchema.parse(raw)
  if (userId === s.user.id) {
    throw new Error("You can’t change your own access")
  }
  await requireColleague(s.org.id, userId, "The owner’s access can’t be changed")
  const changed = await db()
    .update(memberships)
    .set(grant)
    .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, userId), ne(memberships.role, "owner")))
    .returning({ userId: memberships.userId })
  if (!changed.length) {
    throw new Error("They’re no longer in this workspace")
  }
  return { ok: true }
}

// Hands the workspace to a colleague, who becomes its owner; the owner stays on as an admin. Only the owner does this,
// so a workspace always has exactly one.
export async function transferOwnership(
  s: { org: Pick<Session["org"], "id">; user: Pick<Session["user"], "id"> },
  raw: unknown
) {
  const { userId } = userSchema.parse(raw)
  if (userId === s.user.id) {
    throw new Error("You already own this workspace")
  }
  await db().transaction(async (tx) => {
    const [previous] = await tx
      .update(memberships)
      .set({ role: "admin", access: {} })
      .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, s.user.id), eq(memberships.role, "owner")))
      .returning({ userId: memberships.userId })
    if (!previous) {
      throw new AccessError("Only the owner can do this")
    }
    const [next] = await tx
      .update(memberships)
      .set({ role: "owner", access: {} })
      .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, userId)))
      .returning({ userId: memberships.userId })
    if (!next) {
      throw new Error("They’re no longer in this workspace")
    }
  })
  return { ok: true }
}

// Takes a colleague out of the workspace. The owner stays, and nobody removes themselves.
export async function removeColleague(
  s: { org: Pick<Session["org"], "id">; user: Pick<Session["user"], "id"> },
  raw: unknown
) {
  const { userId } = userSchema.parse(raw)
  if (userId === s.user.id) {
    throw new Error("You can’t remove yourself")
  }
  await requireColleague(s.org.id, userId, "The owner can’t be removed")
  const removed = await db()
    .delete(memberships)
    .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, userId), ne(memberships.role, "owner")))
    .returning({ userId: memberships.userId })
  if (!removed.length) {
    throw new Error("They’re no longer in this workspace")
  }
  return { ok: true }
}

// Someone else in the workspace whose access can change: anyone but its owner.
async function requireColleague(orgId: string, userId: string, ownerMessage: string) {
  const [member] = await db()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
  if (!member) {
    throw new Error("They’re no longer in this workspace")
  }
  if (member.role === "owner") {
    throw new Error(ownerMessage)
  }
}
