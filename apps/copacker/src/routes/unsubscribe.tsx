import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/unsubscribe/page"
import { urlQuery } from "@/lib/url-query"
import { readUnsubscribe } from "@/public.functions"
export const Route = createFileRoute("/unsubscribe")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readUnsubscribe({ data: deps }),
  component: Screen
})
function Screen() {
  return <Page {...Route.useLoaderData()} />
}
