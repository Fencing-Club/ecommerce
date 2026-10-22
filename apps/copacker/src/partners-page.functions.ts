import { createServerFn } from "@tanstack/react-start"
import { partnersSearch } from "@/lib/page-search"
import { pageResult } from "@/server/page-result"
import { partnersPage } from "@/server/partners-page"
export const readPartners = createServerFn()
  .validator(partnersSearch.pick({ type: true, q: true }))
  .handler(({ data }) => pageResult(() => partnersPage(data), "partners.page.title"))
