import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"
import { pendingVerification } from "@/server/sign-in"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t("verifyEmail.title") }
}

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

export const dynamic = "force-dynamic"

// After signing up, or signing in to an account whose email isn't confirmed yet: the code WorkOS emailed.
export default async function VerifyEmail() {
  const pending = await pendingVerification()
  if (!pending) {
    redirect("/login")
  }
  const t = await getTranslations("auth")
  return (
    <AuthPage
      title={t("verifyEmail.title")}
      description={t.rich("verifyEmail.description", {
        email: pending.email,
        strong
      })}
    >
      <VerifyEmailForm />
      <AuthSwitch prompt={t("verifyEmail.wrongEmail")} href="/signup">
        {t("verifyEmail.startAgain")}
      </AuthSwitch>
    </AuthPage>
  )
}
