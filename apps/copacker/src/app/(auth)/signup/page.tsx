import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { signedInUser } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { returnPath } from "@/server/security"
import { invitedEmail } from "@/server/sign-in"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t("signup.title") }
})

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

// WorkOS's invitation links, such as the one approving a waitlist entry, open this page with `invitation_token`: the
// form keeps to the invited address and accepts the invitation. Google and Microsoft can't carry it, so they're left out.
export default withRequest(async function SignUp({
  searchParams
}: {
  searchParams: Promise<{ next?: string; email?: string; invitation_token?: string }>
}) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const query = await searchParams
  const next = returnPath(query.next, "/")
  if (await signedInUser()) {
    redirect(next)
  }
  const invitation = query.invitation_token
  const invited = invitation ? await invitedEmail(invitation) : null
  const onward = next === "/" ? "" : `?${new URLSearchParams({ next })}`
  const t = await getTranslations("auth")
  return (
    <AuthPage title={t("signup.title")}>
      <div className="flex flex-col gap-6">
        {invited && invitation ? (
          <SignUpForm next={next} email={invited} locked invitation={invitation} />
        ) : (
          <>
            <SocialSignIn next={next} />
            <SignUpForm next={next} email={query.email} />
          </>
        )}
      </div>
      <AuthSwitch prompt={t("switch.haveAccount")} href={`/login${onward}`}>
        {t("switch.signIn")}
      </AuthSwitch>
    </AuthPage>
  )
})
