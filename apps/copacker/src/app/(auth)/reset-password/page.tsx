import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { AuthPage } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/password-reset"
import { Button } from "@/components/ui/button"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t("resetPassword.title") }
}

// Where the reset email's link lands, with its token. WorkOS's Password reset URL setting points here.
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const t = await getTranslations("auth.resetPassword")
  if (!token) {
    return (
      <AuthPage title={t("incompleteTitle")} description={t("incompleteDescription")}>
        <Button className="h-10 w-full" nativeButton={false} render={<Link href="/forgot-password" />}>
          {t("sendNewLink")}
        </Button>
      </AuthPage>
    )
  }
  return (
    <AuthPage title={t("title")}>
      <ResetPasswordForm token={token} />
    </AuthPage>
  )
}
