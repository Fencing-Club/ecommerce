import { Lock } from "lucide-react"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/common"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.pages.forbidden")
  return { title: t("title") }
}

// Shown in the shell when a member opens a page they weren't given, such as from a colleague's link. Like the portal's
// not-found page, it reads no session; the sidebar lists the pages they can open.
export default async function PortalForbidden() {
  const t = await getTranslations("common.pages.forbidden")
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
