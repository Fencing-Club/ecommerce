import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/catalogs/[id]/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readCatalog } from "@/workspace.functions"

export const Route = createFileRoute("/_portal/catalogs_/$id")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => ({ query: search }),
  loader: ({ deps, params }) => readCatalog({ data: { ...deps, id: params.id } }),
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
