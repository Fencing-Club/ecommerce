import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/orders/new/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readNewOrder } from "@/new-order-page.functions"
export const Route = createFileRoute("/_portal/orders_/new")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readNewOrder({ data: deps }),
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
      <title>{t("orders.builder.newTitle")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
