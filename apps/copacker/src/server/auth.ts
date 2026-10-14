import { withAuth } from "@workos-inc/authkit-nextjs"
import { and, eq } from "drizzle-orm"
import type { Metadata } from "next"
import type { MessageKeys, NestedKeyOf } from "next-intl"
import { getTranslations } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"
import { db } from "@/db"
import { memberships, organizations, profiles } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import type { Messages } from "@/i18n/messages"
import { type AccessLevel, type Area, can, type Grant, isAdmin, type Permissions } from "@/lib/access"
import { areaLabelKey } from "@/lib/navigation"
import { AccessError } from "@/server/errors"
import { appUrl, returnPath } from "@/server/security"

// The workspace this browser has open, until another is chosen.
export const workspaceCookie = "copacker-workspace"

export async function setWorkspace(id: string) {
  ;(await cookies()).set(workspaceCookie, id, {
    httpOnly: true,
    secure: appUrl().startsWith("https:"),
    sameSite: "lax",
    path: "/"
  })
}

// The signed-in person, or null, for pages that anyone can open, such as sign-in itself.
export async function signedInUser() {
  if (!process.env.WORKOS_CLIENT_ID) {
    return null
  }
  return (await withAuth()).user
}

// Without an explicit page, sign-in returns to the page that was requested; the auth proxy records it as x-url.
export async function identity(returnTo?: string) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const { user } = await withAuth()
  if (!user) {
    // x-url is the full request URL (behind Railway its host is internal), so only its path is kept.
    const url = (await headers()).get("x-url")
    const requested = returnTo ?? (url && URL.canParse(url) ? `${new URL(url).pathname}${new URL(url).search}` : null)
    redirect(`/login?next=${encodeURIComponent(returnPath(requested, "/"))}`)
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
  const active = (await cookies()).get(workspaceCookie)?.value
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
    // The pages a member can open, and whether to view or edit each. Owners and admins open everything.
    access: chosen.member.access,
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
    throw new LocalizedError("buyerWorkspaceRequired")
  }
}
export function requireSupplier(s: Session) {
  if (s.org.kind !== "supplier") {
    throw new LocalizedError("supplierWorkspaceRequired")
  }
}
// The team, the store connections and the workspace's settings are its owner's and admins'.
export function requireAdmin(s: Pick<Session, "role">) {
  if (!isAdmin(s)) {
    throw new AccessError("adminsOnly")
  }
}
// Handing the workspace over and deleting it are its owner's alone.
export function requireOwner(s: Pick<Session, "role">) {
  if (s.role !== "owner") {
    throw new AccessError("ownerOnly")
  }
}
// For a request: a member without the page, or without edit access to it for a change, is turned away, as is one who
// doesn't see prices from anything that shows or sets them.
export function requireAccess(
  s: Permissions & { org: Pick<Session["org"], "kind"> },
  grant: Grant,
  level: AccessLevel = "view"
) {
  if (!can(s, grant, level)) {
    const page = grant === "prices" ? "prices" : (areaLabelKey(s.org.kind, grant) ?? grant)
    throw new AccessError("askAdminForAccess", { page })
  }
}
// The No access page's title, for a page someone can't open. A page's metadata returns it rather than calling
// forbidden(): Next titles a page whose metadata throws forbidden() as not found.
export async function noAccessTitle(): Promise<Metadata> {
  const t = await getTranslations("common.pages.forbidden")
  return { title: t("title") }
}
// A page title's message key, such as "products.page.addProduct".
export type TitleKey = MessageKeys<Messages, NestedKeyOf<Messages>>
// A guarded page's title, as its generateMetadata. Someone who can't open the page gets the No access page's title,
// which a page's own static title would otherwise replace.
export function titleFor(title: TitleKey, area: Area, level: AccessLevel = "view") {
  return async (): Promise<Metadata> => {
    if (!can(await session(), area, level)) {
      return noAccessTitle()
    }
    const t = await getTranslations()
    return { title: t(title) }
  }
}
// For a page, or a request that only reads: someone without access gets Next's 403, which shows a page as the portal's
// No access page.
export function requirePage(s: Permissions, grant: Grant, level: AccessLevel = "view") {
  if (!can(s, grant, level)) {
    forbidden()
  }
}
export async function requireMembership(userId: string, orgId: string) {
  const [member] = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
  if (!member) {
    throw new LocalizedError("workspaceAccessDenied")
  }
  return member
}
