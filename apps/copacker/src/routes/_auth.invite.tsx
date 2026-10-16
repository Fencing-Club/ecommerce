import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(auth)/invite/page"
import { invitationSearch, readInvitation } from "@/invitation.functions"
export const Route = createFileRoute("/_auth/invite")({
  validateSearch: invitationSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readInvitation({ data: deps }),
  component: Screen
})
function Screen() {
  return <Page page={Route.useLoaderData()} />
}
