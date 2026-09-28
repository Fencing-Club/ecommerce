import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { Maintenance } from "@/components/maintenance"
import { maintenanceHeader } from "@/lib/maintenance"

// The page only stands in for another while Copacker is down for maintenance (src/server/maintenance.ts). Opened
// directly while Copacker is up, it isn't a page.
async function standingIn() {
  if (!(await headers()).has(maintenanceHeader)) {
    notFound()
  }
}

export async function generateMetadata(): Promise<Metadata> {
  await standingIn()
  const t = await getTranslations("common.pages.maintenance")
  return { title: t("title"), robots: { index: false } }
}

export default async function MaintenancePage() {
  await standingIn()
  return <Maintenance />
}
