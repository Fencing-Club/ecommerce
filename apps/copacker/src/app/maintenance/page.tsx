import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { Maintenance } from "@/components/maintenance"
import { maintenanceHeader } from "@/lib/maintenance"

type Props = { searchParams: Promise<{ preview?: string }> }

// Whether the page stands in for another while Copacker is down for maintenance (src/server/maintenance.ts), which it
// reloads into once Copacker is back. Opened directly while Copacker is up, it isn't a page, apart from
// /maintenance?preview, which shows it without taking anything down.
async function standingIn({ searchParams }: Props) {
  const standIn = (await headers()).has(maintenanceHeader)
  if (!standIn && (await searchParams).preview === undefined) {
    notFound()
  }
  return standIn
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  await standingIn(props)
  const t = await getTranslations("common.pages.maintenance")
  return { title: t("title"), robots: { index: false } }
}

export default async function MaintenancePage(props: Props) {
  return <Maintenance reload={await standingIn(props)} />
}
