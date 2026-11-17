import { Button } from "@buildkitgg/shadcn"
import { CircleAlert } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"

// Shown in the shell when a portal page fails, so the sidebar and header stay. The header row comes first, beside the
// sidebar's collapse button, and the empty state below it. Trying again fetches the page afresh (`retry`; `reset` would
// only re-render what already failed). Every workspace has an Overview.
export function PortalError({ retry }: { retry: () => void }) {
  const t = useTranslations("common.pages.error")
  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState
        titleAs="h2"
        title={t("didntLoad")}
        description={t("dataUnchanged")}
        icon={<CircleAlert aria-hidden />}
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retry}>{t("tryAgain")}</Button>
          <Button variant="outline" nativeButton={false} render={<a href="/overview" aria-label={t("goToOverview")} />}>
            {t("goToOverview")}
          </Button>
        </div>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<a href="/workspaces" aria-label={t("switchWorkspace")} />}
        >
          {t("switchWorkspace")}
        </Button>
      </EmptyState>
    </>
  )
}
