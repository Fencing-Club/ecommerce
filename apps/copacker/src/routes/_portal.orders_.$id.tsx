import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/orders/[id]/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readOrder } from "@/order-page.functions"
export const Route = createFileRoute("/_portal/orders_/$id")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => readOrder({ data: { query: deps, id: params.id } }),
  component: Screen
})
function Screen() {
  const result = Route.useLoaderData()
  const t = useTranslations()
  if (result.forbidden) {
    return <PortalForbidden />
  }
  return (
    <>
      <title>{t("orders.index.title")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
