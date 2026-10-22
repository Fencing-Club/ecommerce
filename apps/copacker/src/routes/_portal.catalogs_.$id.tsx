import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/catalogs/[id]/page"
import { readCatalog } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/catalogs_/$id")({
  loader: ({ params }) => readCatalog({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
