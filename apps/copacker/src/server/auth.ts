import { withAuth } from "@workos-inc/authkit-nextjs"
import { and, eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
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
  const available = await db()
    .select({ org: organizations, member: memberships })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, user.id))
  if (!available.length) {
    redirect("/onboarding")
  }
  const active = (await cookies()).get("copacker-workspace")?.value
  const chosen = available.find((row) => row.org.id === active) ?? available[0]!
  return {
    user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
    org: chosen.org,
    role: chosen.member.role,
    workspaces: available.map((row) => row.org)
  }
}
export type Session = Awaited<ReturnType<typeof session>>
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
