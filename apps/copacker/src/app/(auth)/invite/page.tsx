import { and, eq } from "drizzle-orm"
import type { Metadata } from "next"
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
import { findInvitation, type InvitationKind, invitationKind, invitationPath } from "@/server/invitations"
import { ownProfile } from "@/server/profile"
import { hasAccount } from "@/server/sign-in"

export const metadata: Metadata = { title: "Invitation" }

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

const joining: Record<InvitationKind, string> = {
  team: "Join their workspace on Copacker.",
  supplier: "Join Copacker as their supplier.",
  forwarder: "Join Copacker as their freight forwarder."
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

  if (!invitation) {
    return (
      <AuthPage title="This invitation isn’t valid" description="It was used already, or a newer one replaced it.">
        <Button className="h-10 w-full" nativeButton={false} render={<Link href={home} />}>
          {user ? "Open Copacker" : "Sign in"}
        </Button>
      </AuthPage>
    )
  }
  if (invitation.expired) {
    return (
      <AuthPage title="This invitation expired" description={`Ask ${invitation.from} to send a new one.`}>
        <Button className="h-10 w-full" nativeButton={false} render={<Link href={home} />}>
          {user ? "Open Copacker" : "Sign in"}
        </Button>
      </AuthPage>
    )
  }

  const here = invitationPath(kind, token)
  const setUp = `/onboarding?${new URLSearchParams({ invite: token, kind: kind === "supplier" ? "invite" : kind })}`
  const title = (
    <span className="flex flex-col gap-5">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-xl border bg-muted text-base font-semibold tracking-normal"
      >
        {initials(invitation.from)}
      </span>
      {invitation.from} invited you
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
    return (
      <AuthPage title={title} description={joining[kind]}>
        <div className="flex flex-col gap-6">
          <SocialSignIn next={here} email={invitation.email} />
          {signIn ? (
            <SignInForm next={here} email={invitation.email} locked />
          ) : (
            <SignUpForm next={here} email={invitation.email} locked />
          )}
        </div>
        {signIn ? (
          <AuthSwitch prompt="New to Copacker?" href={`${here}&mode=signup`}>
            Create an account
          </AuthSwitch>
        ) : (
          <AuthSwitch prompt="Already have an account?" href={`${here}&mode=signin`}>
            Sign in
          </AuthSwitch>
        )}
      </AuthPage>
    )
  }

  if (user.email.toLowerCase() !== invitation.email) {
    return (
      <AuthPage
        title="This invitation is for another email"
        description={
          <>
            It was sent to <span className="font-medium text-foreground">{invitation.email}</span>. You’re signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
          </>
        }
      >
        <form action="/logout" method="post">
          <Button type="submit" className="h-10 w-full">
            Sign out
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
      <AuthPage title={title} description={joining[kind]}>
        <AcceptInvitation kind="team" token={token} label={`Join ${invitation.company}`} />
      </AuthPage>
    )
  }
  // A supplier or forwarder with a workspace of that kind already can bring it; otherwise getting started makes one.
  const owned = await db()
    .select({ id: organizations.id, name: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.role, "owner"), eq(organizations.kind, kind)))
    .orderBy(organizations.name)
  if (!owned.length) {
    redirect(setUp)
  }
  return (
    <AuthPage title={title} description={joining[kind]}>
      <AcceptInvitation kind={kind} token={token} label="Accept invitation" workspaces={owned} setUp={setUp} />
    </AuthPage>
  )
}
