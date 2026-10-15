import { CircleAlert } from "lucide-react"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signedInUser } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { returnPath } from "@/server/security"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t("login.title") }
})

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

export default withRequest(async function Login({
  searchParams
}: {
  searchParams: Promise<{ next?: string; email?: string; error?: string }>
}) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const query = await searchParams
  const next = returnPath(query.next, "/")
  if (await signedInUser()) {
    redirect(next)
  }
  const onward = next === "/" ? "" : `?${new URLSearchParams({ next })}`
  const t = await getTranslations("auth")
  return (
    <AuthPage title={t("login.heading")}>
      {query.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{t("login.failed")}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-6">
        <SocialSignIn next={next} />
        <SignInForm next={next} email={query.email} />
      </div>
      <AuthSwitch prompt={t("switch.newToCopacker")} href={`/signup${onward}`}>
        {t("switch.createAccount")}
      </AuthSwitch>
    </AuthPage>
  )
})
