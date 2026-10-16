import { Link } from "@tanstack/react-router"
import { PackageOpen } from "lucide-react"
import { useTranslations } from "use-intl"
import { PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"

// Shown in the shell when a portal page calls notFound(), such as for a malformed link or another workspace's purchase
// order. The header row comes first, so it sits beside the sidebar's collapse button, and the empty state below (built
// like EmptyState) doesn't repeat its title. It reads no session: every workspace has an Overview, and a forwarder's
// sends it on to its purchase orders.
export default function PortalNotFound() {
  const t = useTranslations("common.pages.notFound")
  return (
    <>
      <PageHeader title={t("title")} />
      <Empty className="gap-4 py-10">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon" className="size-10 text-muted-foreground">
            <PackageOpen aria-hidden className="size-5" />
          </EmptyMedia>
          <EmptyDescription>{t("removed")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link to="/overview" />}>
            {t("goToOverview")}
          </Button>
        </EmptyContent>
      </Empty>
    </>
  )
}
