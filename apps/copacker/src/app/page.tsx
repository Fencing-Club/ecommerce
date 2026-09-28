import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Landing } from "@/components/marketing/landing"
import { homeFor } from "@/lib/navigation"
import { session, signedInUser } from "@/server/auth"
import { appUrl } from "@/server/security"

const title = "Copacker: Restocking, handled"
const description =
  "Forecast your inventory, send purchase orders just in time so you don’t run out, and handle the handoffs to your forwarder, Amazon FBA and AWD, with every label and document made for you."

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { absolute: title },
  description,
  openGraph: {
    type: "website",
    siteName: "Copacker",
    title,
    description,
    images: [{ url: "/marketing/og.jpg", width: 1200, height: 630, alt: "Copacker: Restocking, handled" }]
  },
  twitter: { card: "summary_large_image", title, description, images: ["/marketing/og.jpg"] }
}

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"
// Buyers land on the Overview, and suppliers and forwarders on their purchase orders, or a member on their first page.
// Anyone signed out gets the marketing page.
export default async function Home() {
  if (!(await signedInUser())) {
    return <Landing />
  }
  const s = await session()
  redirect(homeFor(s.org.kind, s))
}
