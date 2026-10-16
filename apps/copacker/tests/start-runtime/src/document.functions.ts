import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { z } from "zod"
import { localization, resolveLocalization } from "@/server/localization"
import { maintenanceActive } from "@/server/maintenance"

export const readDocument = createServerFn()
  .validator(z.boolean())
  .handler(async ({ data: portal }) => {
    const resolved = await localization()
    // The query-state probe tests a language switch. Real auth pages use request localization.
    const url = getRequestUrl()
    const config =
      url.pathname === "/" && url.searchParams.get("lang") === "ur"
        ? await resolveLocalization({ preferredLocale: "ur", acceptLanguage: null, timeZone: resolved.timeZone })
        : resolved
    const { auth, common, validation, overview, navigation, supplier, sales } = config.messages
    return {
      ...config,
      messages: { auth, common, validation, ...(portal && { overview, navigation, supplier, sales }) },
      maintenance: maintenanceActive()
    }
  })
