import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(portal)/orders/[id]/edit/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { readEditOrder } from "@/edit-order-page.functions"
import { urlQuery } from "@/lib/url-query"
export const Route = createFileRoute("/_portal/orders_/$id_/edit")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params }) => readEditOrder({ data: params }),
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
