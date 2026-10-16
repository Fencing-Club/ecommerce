import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { localizedPage } from "@/server/page-result"
import { settingsPage } from "@/server/settings-page"
export const readSettings = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) => localizedPage(() => settingsPage(data), "settings.title"))
