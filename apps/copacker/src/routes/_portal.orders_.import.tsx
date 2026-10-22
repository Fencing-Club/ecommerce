import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/import/page"
import { readImport } from "@/import.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/orders_/import")({
  loader: () => readImport(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{() => <Page />}</PortalPage>
}
