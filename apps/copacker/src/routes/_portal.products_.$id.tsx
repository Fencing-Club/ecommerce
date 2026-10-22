import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/products/[id]/page"
import { readProduct } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/products_/$id")({
  loader: ({ params }) => readProduct({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
