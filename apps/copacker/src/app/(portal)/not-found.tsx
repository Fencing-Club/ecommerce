import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { EmptyState, PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"

// Shown in the shell when a portal page calls notFound(), such as for a malformed link or another workspace's purchase
// order. The header row comes first, so it sits beside the sidebar's collapse button, and the empty state below doesn't
// repeat its title. It reads no session: every workspace has an Overview, and a forwarder's sends it on to its purchase
// orders.
export default function PortalNotFound() {
  const t = useTranslations("common.pages.notFound")
  return (
    <>
      <PageHeader title={t("title")} />
      <EmptyState description={t("removed")}>
        <Button nativeButton={false} render={<Link to="/overview" />}>
          {t("goToOverview")}
        </Button>
      </EmptyState>
    </>
  )
}
