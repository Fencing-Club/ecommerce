import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { Contact } from "@/components/marketing/contact"
import { withRequest } from "@/server/next-request"
import { appUrl } from "@/server/security"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing")
  const title = t("contact.metadata.title")
  const description = t("contact.metadata.description")
  return {
    metadataBase: new URL(appUrl()),
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: "Copacker",
      title,
      description,
      images: [{ url: "/marketing/og.jpg", width: 1200, height: 630, alt: t("metadata.title") }]
    },
    twitter: { card: "summary_large_image", title, description, images: ["/marketing/og.jpg"] }
  }
})

// Rendered per request, like the home page, so its links carry the deployed address rather than the build's.
export const dynamic = "force-dynamic"

// Anyone can write in, signed in or not.
export default function ContactPage() {
  return <Contact />
}
