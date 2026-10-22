import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/import/[id]/page"
import { readReviewImport } from "@/review-import-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_portal/orders_/import_/$id")({
  loader: ({ params }) => readReviewImport({ data: { id: params.id } }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
