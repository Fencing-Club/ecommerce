import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/_portal/forwarders")({
  beforeLoad: () => {
    throw redirect({ href: "/partners?type=forwarder", replace: true })
  }
})
