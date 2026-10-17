import { createFileRoute, redirect } from "@tanstack/react-router"
export const Route = createFileRoute("/_portal/suppliers")({
  beforeLoad: () => {
    throw redirect({ href: "/partners", replace: true })
  }
})
