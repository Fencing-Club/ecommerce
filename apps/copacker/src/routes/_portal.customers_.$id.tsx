import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/customers/[id]/page"
import { readCustomer } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/customers_/$id")({
  loader: ({ params }) => readCustomer({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
