import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/catalogs/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readCatalogs } from "@/workspace.functions"

export const Route = createFileRoute("/_portal/catalogs")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => ({ query: search }),
  loader: ({ deps }) => readCatalogs({ data: { ...deps } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? (loaderData.forbidden ? loaderData.title : loaderData.page.title) + " | Copacker"
          : "Copacker"
      }
    ]
  }),
  component: Screen
})
function Screen() {
  const result = Route.useLoaderData()
  if (result.forbidden) {
    return <PortalForbidden />
  }
  return <Page page={result.page.data} />
}
