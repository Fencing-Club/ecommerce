import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { AuthScreen } from "@/components/auth/auth-screen"
import { authSearch, authTitle } from "@/lib/auth-pages"
import { signedInUser, signInRequest } from "@/server/auth"
import { loadAuthPage } from "@/server/auth-pages"
import { withRequest } from "@/server/next-request"

export const dynamic = "force-dynamic"
export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth")
  return { title: t(authTitle["login"]) }
})

export default withRequest(async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const result = await loadAuthPage("login", authSearch.parse(await searchParams), {
    signedIn: async () => Boolean(await signedInUser()),
    signInRequest
  })
  if ("redirect" in result) {
    redirect(result.redirect)
  }
  return <AuthScreen page={result.page} />
})
