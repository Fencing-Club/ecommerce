import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/shipments/[id]/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readShipment } from "@/shipment-page.functions"
export const Route = createFileRoute("/_portal/shipments_/$id")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => readShipment({ data: { query: deps, id: params.id } }),
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
      <title>{t("shipments.detail.metaTitle")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
