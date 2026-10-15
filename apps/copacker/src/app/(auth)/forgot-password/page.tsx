import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ForgotPassword } from "@/components/auth/password-reset"
import { withRequest } from "@/server/next-request"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t("forgotPassword.title") }
})

export default withRequest(async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>
}) {
  return <ForgotPassword email={(await searchParams).email} />
})
