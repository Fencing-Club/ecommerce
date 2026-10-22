import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/products/new/page"
import { readNewProduct } from "@/workspace.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/products_/new")({
  loader: () => readNewProduct(),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
