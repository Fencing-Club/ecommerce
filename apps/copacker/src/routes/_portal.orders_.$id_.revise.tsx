import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/orders/[id]/revise/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readReviseOrder } from "@/revise-order-page.functions"
export const Route = createFileRoute("/_portal/orders_/$id_/revise")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params }) => readReviseOrder({ data: params }),
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
      <title>{t("orders.revise.title")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
