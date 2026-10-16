import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/orders/[id]/edit/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { readEditOrder } from "@/edit-order-page.functions"
import { urlQuery } from "@/lib/url-query"
export const Route = createFileRoute("/_portal/orders_/$id_/edit")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params }) => readEditOrder({ data: params }),
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
      <title>{t("orders.builder.edit")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
