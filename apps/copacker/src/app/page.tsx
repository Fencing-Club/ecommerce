import { redirect } from "next/navigation"
import { session } from "@/server/auth"

// Buyers land on the Overview; suppliers on their purchase orders.
export default async function Home() {
  const s = await session()
  redirect(s.org.kind === "buyer" ? "/overview" : "/orders")
}
