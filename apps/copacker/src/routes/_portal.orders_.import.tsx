import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/import/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { readImport } from "@/import.functions"
export const Route = createFileRoute("/_portal/orders_/import")({ loader: () => readImport(), component: Screen })
function Screen() {
  return Route.useLoaderData().forbidden ? <PortalForbidden /> : <Page />
}
