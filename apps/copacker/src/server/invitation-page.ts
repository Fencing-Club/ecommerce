import { redirect } from "@tanstack/react-router"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
import { signedInUser } from "./auth"
import { findInvitation, invitationKind, invitationPath } from "./invitations"
import { describeError, logEvent } from "./log"
import { ownProfile } from "./profile"
import { hasAccount } from "./sign-in"

export async function invitationPage(query: { token?: string; kind?: string; mode?: string }) {
  if (!process.env.WORKOS_CLIENT_ID) {
    throw redirect({ href: "/setup" })
  }
  const token = query.token ?? ""
  const kind = invitationKind(query.kind)
  const [found, authenticated] = await Promise.all([
    token.length >= 20 ? findInvitation(kind, token) : null,
    signedInUser()
  ])
  const user = authenticated ? { email: authenticated.email } : null
  const invitation = found
    ? { from: found.from, company: found.company, email: found.email, expired: found.expired }
    : null
  const here = invitationPath(kind, token)
  const setUp = `/onboarding?${new URLSearchParams({ invite: token, kind: kind === "supplier" ? "invite" : kind })}`
  const result = {
    token,
    kind,
    user,
    invitation,
    here,
    setUp,
    home: user ? "/" : "/login",
    signIn: false,
    owned: [] as { id: string; name: string }[]
  }
  if (!invitation || invitation.expired) {
    return result
  }
  if (!authenticated) {
    let existing = false
    try {
      existing = await hasAccount(invitation.email)
    } catch (error) {
      logEvent("error", "invited_account_lookup_failed", { kind, error: describeError(error) })
    }
    return { ...result, signIn: query.mode ? query.mode === "signin" : existing }
  }
  if (authenticated.email.toLowerCase() !== invitation.email) {
    return result
  }
  if (kind === "team") {
    if (!(await ownProfile(authenticated.id)).complete) {
      throw redirect({ href: setUp })
    }
    return result
  }
  const owned = await db()
    .select({ id: organizations.id, name: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, authenticated.id), ne(memberships.role, "member"), eq(organizations.kind, kind)))
    .orderBy(organizations.name)
  if (!owned.length) {
    throw redirect({ href: setUp })
  }
  return { ...result, owned }
}
