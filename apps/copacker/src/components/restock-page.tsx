import { useTranslations } from "use-intl"
import type { RestockSearch } from "@/lib/page-search"
import type { restockPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { RestockReport } from "./restock-report"

// `link` is the filters in the URL the page was opened with, such as an Overview link's.
export function RestockPageView({ settings, link }: ReturnType<typeof restockPageData> & { link?: RestockSearch }) {
  const t = useTranslations("restock")
  return (
    <>
      <PageHeader title={t("title")} />
      <RestockReport settings={settings} link={link} />
    </>
  )
}
