import { createFileRoute } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import Page from "@/app/(portal)/orders/import/[id]/page"
import { PortalForbidden } from "@/components/portal-forbidden"
import { urlQuery } from "@/lib/url-query"
import { readReviewImport } from "@/review-import-page.functions"
export const Route = createFileRoute("/_portal/orders_/import_/$id")({
  validateSearch: urlQuery,
  loaderDeps: ({ search }) => search,
  loader: ({ params }) => readReviewImport({ data: params }),
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
      <title>{t("orders.review.title")} | Copacker</title>
      <Page page={result.page} />
    </>
  )
}
