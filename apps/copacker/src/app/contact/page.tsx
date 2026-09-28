import type { Metadata } from "next"
import { Contact } from "@/components/marketing/contact"
import { appUrl } from "@/server/security"

const title = "Contact Copacker"
const description = "Questions, a walkthrough for your team, or working together: send Copacker a note."

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

// Rendered per request, like the home page, so its links carry the deployed address rather than the build's.
export const dynamic = "force-dynamic"

// Anyone can write in, signed in or not.
export default function ContactPage() {
  return <Contact />
}
