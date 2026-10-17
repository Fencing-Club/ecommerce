import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookie, setResponseStatus } from "@tanstack/react-start/server"
import { createTranslator } from "use-intl"
import { AccessError } from "@/i18n/errors"
import { overviewHref, overviewSearch } from "@/lib/overview-search"
import { failureMessage } from "@/server/errors"
import { localization } from "@/server/localization"
import { overviewPageData } from "@/server/overview-page"
import { overviewDestination, portalSession, portalShell } from "@/server/portal-session"
import { workspaceCookie } from "@/server/workspace-session"
import { portalData } from "./portal-data.server"

export const readOverview = createServerFn()
  .validator(overviewSearch)
  .handler(({ data }) =>
    portalData(async (user) => {
      const result = await portalSession(user, getCookie(workspaceCookie), overviewHref(data))
      if (result.redirect) {
        throw redirect({ href: result.redirect })
      }
      const { session } = result
      const destination = overviewDestination(session)
      if (destination) {
        throw redirect({ href: destination })
      }
      const t = createTranslator(await localization())
      try {
        return {
          shell: portalShell(session, getCookie("sidebar_state")),
          page: await overviewPageData(session, data),
          title: `${t("overview.title")} | Copacker`
        }
      } catch (error) {
        if (!(error instanceof AccessError)) {
          throw error
        }
        setResponseStatus(403)
        return {
          shell: portalShell(session, getCookie("sidebar_state")),
          forbidden: await failureMessage(error),
          title: `${t("common.pages.forbidden.title")} | Copacker`
        }
      }
    })
  )
