import { useTranslations } from "use-intl"
import { PageHeader } from "./common"
import { SalesOrders } from "./sales-orders"

// `search` is the one the URL starts the list with, such as the header search's ?q=#1041.
export function SalesPageView({ search }: { search: string }) {
  const t = useTranslations("sales")
  return (
    <>
      <PageHeader title={t("title")} />
      <SalesOrders initialSearch={search} />
    </>
  )
}
