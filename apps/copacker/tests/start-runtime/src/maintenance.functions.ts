import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { translatorFor } from "@/i18n/translator"
import { requestLocale } from "@/server/localization"
import { maintenanceActive } from "@/server/maintenance"

export const readMaintenancePage = createServerFn().handler(async () => {
  if (!maintenanceActive()) {
    throw notFound()
  }
  const t = await translatorFor(await requestLocale())
  return { title: `${t("common.pages.maintenance.title")} | Copacker` }
})
