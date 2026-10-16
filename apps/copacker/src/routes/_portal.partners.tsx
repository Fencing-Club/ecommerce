import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/partners/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readPartners } from "@/partners-page.functions"
export const Route = createFileRoute("/_portal/partners")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readPartners({ data: { query: deps } }),
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
      <title>{t("partners.page.title")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
