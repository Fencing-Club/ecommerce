import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { Maintenance } from "@/components/maintenance"
import { maintenanceHeader } from "@/lib/maintenance"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.pages.maintenance")
  return { title: t("title"), robots: { index: false } }
}

// While Copacker is down for maintenance, every page behind sign-in shows this one, at the page's own address
// (src/server/maintenance.ts). Opened directly, it's a preview, and stays put.
export default async function MaintenancePage() {
  return <Maintenance reload={(await headers()).has(maintenanceHeader)} />
}
