import { useTranslations } from "use-intl"
import type { restockPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { RestockReport } from "./restock-report"

export function RestockPageView({ settings }: ReturnType<typeof restockPageData>) {
  const t = useTranslations("restock")
  return (
    <>
      <PageHeader title={t("title")} />
      <RestockReport settings={settings} />
    </>
  )
}
