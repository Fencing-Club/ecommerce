import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/shipments/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readShipments } from "@/shipments-page.functions"
export const Route = createFileRoute("/_portal/shipments")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readShipments({ data: { query: deps } }),
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
      <title>{t("shipments.list.title")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
