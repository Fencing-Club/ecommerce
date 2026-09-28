import { and, eq, ne } from "drizzle-orm"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AcceptInvitation } from "@/components/auth/accept-invitation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { Button } from "@/components/ui/button"
import { db } from "@/db"
import { memberships, organizations } from "@/db/schema"
import { signedInUser } from "@/server/auth"
import { findInvitation, invitationKind, invitationPath } from "@/server/invitations"
import { ownProfile } from "@/server/profile"
import { hasAccount } from "@/server/sign-in"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.invite")
  return { title: t("title") }
}

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// The link in an invitation email. It says who sent it before anyone signs in, then signs up or signs in with the
// invited email, and hands over to getting started for whatever the new workspace still needs.
export default async function Invitation({
  searchParams
}: {
  searchParams: Promise<{ token?: string; kind?: string; mode?: string }>
}) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const query = await searchParams
  const token = query.token ?? ""
  const kind = invitationKind(query.kind)
  const [invitation, user] = await Promise.all([
    token.length >= 20 ? findInvitation(kind, token) : null,
    signedInUser()
  ])
  const home = user ? "/" : "/login"
  const t = await getTranslations("auth.invite")

  if (!invitation) {
    return (
      <AuthPage title={t("invalidTitle")} description={t("invalidDescription")}>
        <Button className="h-10 w-full" nativeButton={false} render={<Link href={home} />}>
          {user ? t("openCopacker") : t("signIn")}
        </Button>
      </AuthPage>
    )
  }
  if (invitation.expired) {
    return (
      <AuthPage title={t("expiredTitle")} description={t("expiredDescription", { name: invitation.from })}>
        <Button className="h-10 w-full" nativeButton={false} render={<Link href={home} />}>
          {user ? t("openCopacker") : t("signIn")}
        </Button>
      </AuthPage>
    )
  }

  const here = invitationPath(kind, token)
  const setUp = `/onboarding?${new URLSearchParams({ invite: token, kind: kind === "supplier" ? "invite" : kind })}`
  // What accepting makes them: a colleague, or the inviting buyer's supplier or forwarder.
  const joining = t(`joining.${kind}`)
  const title = (
    <span className="flex flex-col gap-5">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-xl border bg-muted text-base font-semibold tracking-normal"
      >
        {initials(invitation.from)}
      </span>
      {t("invitedYou", { name: invitation.from })}
    </span>
  )

  if (!user) {
    // Someone new gets sign-up; someone with an account already, sign-in. Either can switch.
    let existing = false
    try {
      existing = await hasAccount(invitation.email)
    } catch (error) {
      console.error("Couldn’t look up the invited email", error)
    }
    const signIn = query.mode ? query.mode === "signin" : existing
    const other = await getTranslations("auth.switch")
    return (
      <AuthPage title={title} description={joining}>
        <div className="flex flex-col gap-6">
          <SocialSignIn next={here} email={invitation.email} />
          {signIn ? (
            <SignInForm next={here} email={invitation.email} locked />
          ) : (
            <SignUpForm next={here} email={invitation.email} locked />
          )}
        </div>
        {signIn ? (
          <AuthSwitch prompt={other("newToCopacker")} href={`${here}&mode=signup`}>
            {other("createAccount")}
          </AuthSwitch>
        ) : (
          <AuthSwitch prompt={other("haveAccount")} href={`${here}&mode=signin`}>
            {other("signIn")}
          </AuthSwitch>
        )}
      </AuthPage>
    )
  }

  if (user.email.toLowerCase() !== invitation.email) {
    return (
      <AuthPage
        title={t("otherEmailTitle")}
        description={t.rich("otherEmailDescription", {
          invited: invitation.email,
          current: user.email,
          strong
        })}
      >
        <form action="/logout" method="post">
          <input type="hidden" name="next" value={here} />
          <Button type="submit" className="h-10 w-full">
            {t("signOutAndContinue")}
          </Button>
        </form>
      </AuthPage>
    )
  }

  const { complete } = await ownProfile(user.id)
  if (kind === "team") {
    if (!complete) {
      redirect(setUp)
    }
    return (
      <AuthPage title={title} description={joining}>
        <AcceptInvitation kind="team" token={token} label={t("join", { company: invitation.company })} />
      </AuthPage>
    )
  }
  // A supplier or forwarder that runs a workspace of that kind already, as its owner or an admin, can bring it;
  // otherwise getting started makes one.
  const owned = await db()
    .select({ id: organizations.id, name: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, user.id), ne(memberships.role, "member"), eq(organizations.kind, kind)))
    .orderBy(organizations.name)
  if (!owned.length) {
    redirect(setUp)
  }
  return (
    <AuthPage title={title} description={t(`choosing.${kind}`)}>
      <AcceptInvitation kind={kind} token={token} label={t("accept")} workspaces={owned} setUp={setUp} />
    </AuthPage>
  )
}
