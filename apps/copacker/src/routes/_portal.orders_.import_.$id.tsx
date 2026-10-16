import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/import/[id]/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readReviewImport } from "@/review-import-page.functions"
export const Route = createFileRoute("/_portal/orders_/import_/$id")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params }) => readReviewImport({ data: params }),
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
