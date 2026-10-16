import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { pageResult } from "@/server/page-result"
import { settingsPage } from "@/server/settings-page"
export const readSettings = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) => pageResult(() => settingsPage(data)))
