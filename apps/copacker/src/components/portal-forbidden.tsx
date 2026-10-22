import { Lock } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"

// Shown in the shell when the person's role can't open the page. The header says so; the empty state says who can help.
export function PortalForbidden() {
  const t = useTranslations("common.pages.forbidden")
  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState description={t("askAdmin")} icon={<Lock aria-hidden />} />
    </>
  )
}
