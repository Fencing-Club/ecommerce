import { createServerFn } from "@tanstack/react-start"
import { requirePage, session } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { pageResult } from "@/server/page-result"
export const readImport = createServerFn().handler(() =>
  pageResult(async () => {
    const s = await session()
    requireBuyer(s)
    requirePage(s, "orders", "edit")
    requirePage(s, "prices")
  })
)
