import { Contact } from "@/components/marketing/contact"

// Rendered per request, like the home page, so its links carry the deployed address rather than the build's.

// Anyone can write in, signed in or not.
export default function ContactPage() {
  return <Contact />
}
