import { useTranslations } from "use-intl"
import type { inventoryPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { InventoryTable } from "./supplier/inventory"

// `tab` is the one the URL asks for, such as ?tab=short from the Overview.
export function InventoryPageView({ rows, tab }: Awaited<ReturnType<typeof inventoryPageData>> & { tab?: string }) {
  const t = useTranslations("inventory.page")
  return (
    <>
      <PageHeader title={t("title")} />
      <InventoryTable rows={rows} initialTab={tab} />
    </>
  )
}
