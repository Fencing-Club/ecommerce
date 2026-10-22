import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/unsubscribe/page"
import { unsubscribeSearch } from "@/lib/page-search"
import { readUnsubscribe } from "@/public.functions"
import { pageHead } from "./-page-route"

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: unsubscribeSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readUnsubscribe({ data: deps }),
  head: pageHead,
  component: Screen
})
function Screen() {
  return <Page {...Route.useLoaderData().page} />
}
