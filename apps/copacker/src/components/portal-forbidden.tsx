import { Lock } from "lucide-react"
import { useTranslations } from "use-intl"
import { PageHeader } from "./common"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "./ui/empty"

export function PortalForbidden() {
  const t = useTranslations("common.pages.forbidden")
  return (
    <>
      <PageHeader title={t("title")} />
      <Empty className="gap-4 py-10">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon" className="size-10 text-muted-foreground">
            <Lock aria-hidden className="size-5" />
          </EmptyMedia>
          <EmptyDescription>{t("askAdmin")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  )
}
