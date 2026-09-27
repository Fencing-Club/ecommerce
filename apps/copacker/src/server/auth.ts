import { withAuth } from "@workos-inc/authkit-nextjs"
import { and, eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { memberships, organizations, profiles } from "@/db/schema"
import { returnPath } from "@/server/security"
// Without an explicit page, sign-in returns to the page that was requested; the auth proxy records it as x-url.
export async function identity(returnTo?: string) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  // Sign-in sets a PKCE cookie, which Server Components cannot do; the /login route handler can.
  const { user } = await withAuth()
  if (!user) {
    // x-url is the full request URL (behind Railway its host is internal), so only its path is kept.
    const url = (await headers()).get("x-url")
    const requested = returnTo ?? (url && URL.canParse(url) ? `${new URL(url).pathname}${new URL(url).search}` : null)
    redirect(`/login?next=${encodeURIComponent(returnPath(requested))}`)
  }
  return user
}
export async function session() {
  const user = await identity()
  const [available, profile] = await Promise.all([
    db()
      .select({ org: organizations, member: memberships })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, user.id)),
    profileFor(user)
  ])
  if (!available.length) {
    redirect("/onboarding")
  }
  const active = (await cookies()).get("copacker-workspace")?.value
  const chosen = available.find((row) => row.org.id === active) ?? available[0]!
  return {
    user: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      // Null until they give their name, which the portal asks for before anything else.
      name: profile ? `${profile.firstName} ${profile.lastName}` : null
    },
    org: chosen.org,
    role: chosen.member.role,
    workspaces: available.map((row) => row.org)
  }
}
export type Session = Awaited<ReturnType<typeof session>>

// A person's saved name, or the one they signed up with, which is saved as theirs the first time it's seen.
export async function profileFor(user: { id: string; firstName?: string | null; lastName?: string | null }) {
  const [saved] = await db().select().from(profiles).where(eq(profiles.userId, user.id))
  if (saved) {
    return saved
  }
  const firstName = user.firstName?.trim()
  const lastName = user.lastName?.trim()
  if (!firstName || !lastName) {
    return null
  }
  const [created] = await db()
    .insert(profiles)
    .values({ userId: user.id, firstName, lastName })
    .onConflictDoNothing()
    .returning()
  return created ?? { userId: user.id, firstName, lastName, updatedAt: new Date() }
}
export function requireBuyer(s: Session) {
  if (s.org.kind !== "buyer") {
    throw new Error("A buyer workspace is required")
  }
}
export function requireOwner(s: Session) {
  if (s.role !== "owner") {
    throw new Error("Only workspace owners can manage access and connections")
  }
}
export async function requireMembership(userId: string, orgId: string) {
  const [member] = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
  if (!member) {
    throw new Error("Workspace access denied")
  }
  return member
}
