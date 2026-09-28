import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Landing } from "@/components/marketing/landing"
import { session, signedInUser } from "@/server/auth"
import { appUrl } from "@/server/security"

const title = "Copacker: Restocking, handled"
const description =
  "Forecast what to reorder, send the purchase order, and run the logistics to Amazon or your own warehouse, with your supplier and forwarder on the same order."

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
// Buyers land on the Overview; suppliers and forwarders on their purchase orders. Anyone signed out gets the marketing
// page.
const homes = { buyer: "/overview", supplier: "/orders", forwarder: "/orders" } as const
export default async function Home() {
  if (!(await signedInUser())) {
    return <Landing />
  }
  const s = await session()
  redirect(homes[s.org.kind])
}
