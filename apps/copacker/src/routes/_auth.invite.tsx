import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(auth)/invite/page"
import { invitationSearch, readInvitation } from "@/invitation.functions"
import { AuthRouteError, pageHead } from "./-page-route"

export const Route = createFileRoute("/_auth/invite")({
  validateSearch: invitationSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readInvitation({ data: deps }),
  head: pageHead,
  errorComponent: AuthRouteError,
  component: Screen
})
function Screen() {
  return <Page page={Route.useLoaderData().page} />
}
