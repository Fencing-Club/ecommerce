import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/customers/page"
import { readCustomers } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/customers")({
  loader: () => readCustomers(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
