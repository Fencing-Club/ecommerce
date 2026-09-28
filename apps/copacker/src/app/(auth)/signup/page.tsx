import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { signedInUser } from "@/server/auth"
import { returnPath } from "@/server/security"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t("signup.title") }
}

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
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
    <AuthPage title={t("signup.title")}>
      <div className="flex flex-col gap-6">
        <SocialSignIn next={next} />
        <SignUpForm next={next} email={query.email} />
      </div>
      <AuthSwitch prompt={t("switch.haveAccount")} href={`/login${onward}`}>
        {t("switch.signIn")}
      </AuthSwitch>
    </AuthPage>
  )
}
