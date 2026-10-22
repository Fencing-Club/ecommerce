import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/partners/page"
import { partnersSearch } from "@/lib/page-search"
import { readPartners } from "@/partners-page.functions"
import { PortalPage, PortalRouteError, pageHead } from "./-page-route"

// The server lists the partners of the URL's type that match its search. ?add= only opens a dialog.
export const Route = createFileRoute("/_portal/partners")({
  validateSearch: partnersSearch,
  loaderDeps: ({ search: { type, q } }) => ({ type, q }),
  loader: ({ deps }) => readPartners({ data: deps }),
  head: pageHead,
  errorComponent: PortalRouteError,
  component: Screen
})
function Screen() {
  return <PortalPage result={Route.useLoaderData()}>{(page) => <Page page={page} />}</PortalPage>
}
