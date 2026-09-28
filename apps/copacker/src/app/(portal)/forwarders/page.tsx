import { redirect } from "next/navigation"

// Forwarders are listed with the other partners.
export default function ForwardersPage() {
  redirect("/partners?type=forwarder")
}
