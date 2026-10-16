import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { PortalForbidden } from "@/components/portal-forbidden"
import { withRequest } from "@/server/next-request"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.pages.forbidden")
  return { title: t("title") }
})

export default function ForbiddenPage() {
  return <PortalForbidden />
}
