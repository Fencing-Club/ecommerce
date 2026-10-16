import { useTranslations } from "use-intl"
import type { inventoryPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { InventoryTable } from "./supplier/inventory"

export function InventoryPageView({ rows, tab }: Awaited<ReturnType<typeof inventoryPageData>>) {
  const t = useTranslations("inventory.page")
  return (
    <>
      <PageHeader title={t("title")} />
      <InventoryTable rows={rows} initialTab={tab} />
    </>
  )
}
