import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { AcceptInvitation } from "@/components/auth/accept-invitation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { Button } from "@/components/ui/button"
import { initials } from "@/lib/initials"
import type { invitationPage } from "@/server/invitation-page"

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

// The link in an invitation email. It says who sent it before anyone signs in, then signs up or signs in with the
// invited email, and hands over to getting started for whatever the new workspace still needs.
export default function Invitation({ page }: { page: Awaited<ReturnType<typeof invitationPage>> }) {
  const { token, kind, invitation, user, home, here, setUp, signIn, owned } = page
  const t = useTranslations("auth.invite")
  const other = useTranslations("auth.switch")
  if (!invitation) {
    return (
      <AuthPage title={t("invalidTitle")} description={t("invalidDescription")}>
        <Button className="h-10 w-full" nativeButton={false} render={<Link to="." href={home} />}>
          {user ? t("openCopacker") : t("signIn")}
        </Button>
      </AuthPage>
    )
  }
  if (invitation.expired) {
    return (
      <AuthPage title={t("expiredTitle")} description={t("expiredDescription", { name: invitation.from })}>
        <Button className="h-10 w-full" nativeButton={false} render={<Link to="." href={home} />}>
          {user ? t("openCopacker") : t("signIn")}
        </Button>
      </AuthPage>
    )
  }

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

  if (kind === "team") {
    return (
      <AuthPage title={title} description={joining}>
        <AcceptInvitation kind="team" token={token} label={t("join", { company: invitation.company })} />
      </AuthPage>
    )
  }
  // A supplier or forwarder that runs a workspace of that kind already, as its owner or an admin, can bring it;
  // otherwise getting started makes one.
  return (
    <AuthPage title={title} description={t(`choosing.${kind}`)}>
      <AcceptInvitation kind={kind} token={token} label={t("accept")} workspaces={owned} setUp={setUp} />
    </AuthPage>
  )
}
