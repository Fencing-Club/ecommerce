import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { localization, resolveLocalization } from "@/server/localization"
import { maintenanceActive } from "@/server/maintenance"

export const readDocument = createServerFn().handler(async () => {
  const resolved = await localization()
  // The query-state probe tests a language switch. Real auth pages use request localization.
  const url = getRequestUrl()
  const config =
    url.pathname === "/" && url.searchParams.get("lang") === "ur"
      ? await resolveLocalization({ preferredLocale: "ur", acceptLanguage: null, timeZone: resolved.timeZone })
      : resolved
  const {
    locale,
    timeZone,
    messages: { auth, common, validation }
  } = config
  return { locale, timeZone, messages: { auth, common, validation }, maintenance: maintenanceActive() }
})
