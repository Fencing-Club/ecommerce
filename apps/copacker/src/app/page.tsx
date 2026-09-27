import { redirect } from "next/navigation"
import { session } from "@/server/auth"

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"
// Buyers land on the Overview; suppliers on their purchase orders; forwarders on their addresses in Settings.
const homes = { buyer: "/overview", supplier: "/orders", forwarder: "/settings" } as const
export default async function Home() {
  const s = await session()
  redirect(homes[s.org.kind])
}
