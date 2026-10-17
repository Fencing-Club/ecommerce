import { notFound, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { match } from "ts-pattern"
import { homeFor } from "@/lib/navigation"
import { urlQuery } from "@/lib/url-query"
import { session, signedInUser } from "@/server/auth"
import { canUnsubscribe } from "@/server/mailing-list"
import { maintenanceActive } from "@/server/maintenance"

export const readHome = createServerFn().handler(async () => {
  if (await signedInUser()) {
    const s = await session()
    throw redirect({ href: homeFor(s.org.kind, s) })
  }
})
export const readMaintenance = createServerFn().handler(() => {
  if (!maintenanceActive()) {
    throw notFound()
  }
})
export const readUnsubscribe = createServerFn()
  .validator(urlQuery)
  .handler(({ data }) => {
    const read = (name: string) => (typeof data[name] === "string" ? data[name] : "")
    const email = read("email"),
      token = read("token")
    const state = match({
      valid: Boolean(email) && canUnsubscribe(email, token),
      done: Boolean(read("done")),
      failed: Boolean(read("failed"))
    })
      .with({ valid: false }, () => "invalid" as const)
      .with({ done: true }, () => "done" as const)
      .with({ failed: true }, () => "failed" as const)
      .otherwise(() => "confirm" as const)
    return { email, token, state }
  })
