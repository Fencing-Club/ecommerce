import { and, asc, eq } from "drizzle-orm"
import invariant from "tiny-invariant"
import { z } from "zod"
import { db, type Database, type Transaction } from "@/db"
import { memberships, organizations, profiles } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"

// The cookie chooses among this person's current memberships; it never grants access to a workspace.
export const workspaceCookie = "copacker-workspace"

type Person = { id: string; firstName?: string | null; lastName?: string | null }
type Identity = Person & { email: string; emailVerified: boolean }
type Executor = Database | Transaction

// Resolve from current database memberships on every operation. Framework request helpers and redirect decisions
// belong to the caller, so Next, Start and isolated database tests use exactly the same authorization query.
export async function workspaceSession(user: Identity, active: string | undefined, executor: Executor = db()) {
  const available = await executor
    .select({ org: organizations, member: memberships })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, user.id))
    .orderBy(asc(organizations.createdAt), asc(organizations.id))
  const chosen = available.find((row) => row.org.id === active) ?? available[0]
  if (!chosen) {
    return null
  }
  const profile = await profileFor(user, executor)
  return {
    user: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: profile ? `${profile.firstName} ${profile.lastName}` : null
    },
    // Full workspace settings stay server-side. A route returns an explicit rendering DTO instead of this session.
    org: chosen.org,
    role: chosen.member.role,
    access: chosen.member.access,
    workspaces: available.map(({ org }) => ({ id: org.id, name: org.name, kind: org.kind }))
  }
}

export type Session = NonNullable<Awaited<ReturnType<typeof workspaceSession>>>

// A saved profile wins over WorkOS's sign-up name, including when another request creates it concurrently.
export async function profileFor(user: Person, executor: Executor = db()) {
  const [saved] = await executor.select().from(profiles).where(eq(profiles.userId, user.id))
  if (saved) {
    return saved
  }
  const firstName = user.firstName?.trim()
  const lastName = user.lastName?.trim()
  if (!firstName || !lastName) {
    return null
  }
  const [created] = await executor
    .insert(profiles)
    .values({ userId: user.id, firstName, lastName })
    .onConflictDoNothing()
    .returning()
  if (created) {
    return created
  }
  const [concurrent] = await executor.select().from(profiles).where(eq(profiles.userId, user.id))
  invariant(concurrent, "The profile created by the concurrent request must exist")
  return concurrent
}

export async function requireMembership(userId: string, orgId: string, executor: Executor = db()) {
  if (!z.uuid().safeParse(orgId).success) {
    throw new LocalizedError("workspaceAccessDenied")
  }
  const [member] = await executor
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
  if (!member) {
    throw new LocalizedError("workspaceAccessDenied")
  }
  return member
}
