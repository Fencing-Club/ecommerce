import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { urlQuery } from "@/lib/url-query"
import { pageResult } from "@/server/page-result"
import { partnersPage } from "@/server/partners-page"
export const readPartners = createServerFn()
  .validator(z.object({ query: urlQuery }))
  .handler(({ data }) => pageResult(() => partnersPage(data)))
