import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"
import { Landing } from "@/components/marketing/landing"
import { homeFor } from "@/lib/navigation"
import { session, signedInUser } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { appUrl } from "@/server/security"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.metadata")
  const title = t("title")
  const description = t("description")
  return {
    metadataBase: new URL(appUrl()),
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: "Copacker",
      title,
      description,
      images: [{ url: "/marketing/og.jpg", width: 1200, height: 630, alt: title }]
    },
    twitter: { card: "summary_large_image", title, description, images: ["/marketing/og.jpg"] }
  }
})

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"
// Buyers land on the Overview, and suppliers and forwarders on their purchase orders, or a member on their first page.
// Anyone signed out gets the marketing page.
export default withRequest(async function Home() {
  if (!(await signedInUser())) {
    return <Landing />
  }
  const s = await session()
  redirect(homeFor(s.org.kind, s))
})
