import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/orders/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readOrders } from "@/orders-page.functions"
export const Route = createFileRoute("/_portal/orders")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOrders({ data: { query: deps } }),
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
