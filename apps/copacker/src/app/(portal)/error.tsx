"use client"

import { CircleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Shown in the shell when a portal page fails, so the sidebar and header stay. The header row comes first, beside the
// sidebar's collapse button, and the empty state below is built like EmptyState. Trying again fetches the page afresh
// (`retry`; `reset` would only re-render what already failed). Every workspace has an Overview.
export default function PortalError({ retry }: { retry: () => void }) {
  const t = useTranslations("common.pages.error")
  return (
    <>
      <PageHeader title={t("title")} />
      <Empty className="gap-4 py-10">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon" className="size-10 text-muted-foreground">
            <CircleAlert aria-hidden className="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            <h2>{t("didntLoad")}</h2>
          </EmptyTitle>
          <EmptyDescription>{t("dataUnchanged")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={retry}>{t("tryAgain")}</Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/overview" />}>
              {t("goToOverview")}
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </>
  )
}
