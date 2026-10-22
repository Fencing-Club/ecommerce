import { notFound, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { match } from "ts-pattern"
import { homeFor } from "@/lib/navigation"
import { unsubscribeSearch } from "@/lib/page-search"
import { session, signedInUser } from "@/server/auth"
import { canUnsubscribe } from "@/server/mailing-list"
import { maintenanceActive } from "@/server/maintenance"
import { titleFor } from "@/server/page-result"

export const readHome = createServerFn().handler(async () => {
  if (await signedInUser()) {
    const s = await session()
    throw redirect({ href: homeFor(s.org.kind, s) })
  }
})
export const readMaintenance = createServerFn().handler(async () => {
  if (!maintenanceActive()) {
    throw notFound()
  }
  return { title: await titleFor("common.pages.maintenance.title") }
})
export const readUnsubscribe = createServerFn()
  .validator(unsubscribeSearch)
  .handler(async ({ data }) => {
    const email = data.email ?? ""
    const token = data.token ?? ""
    const state = match({
      valid: Boolean(email) && canUnsubscribe(email, token),
      done: Boolean(data.done),
      failed: Boolean(data.failed)
    })
      .with({ valid: false }, () => "invalid" as const)
      .with({ done: true }, () => "done" as const)
      .with({ failed: true }, () => "failed" as const)
      .otherwise(() => "confirm" as const)
    return { page: { email, token, state }, title: await titleFor("marketing.unsubscribe.metaTitle") }
  })
