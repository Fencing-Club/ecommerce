import { withAuth } from "@workos-inc/authkit-nextjs"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"
import type { MessageKeys, NestedKeyOf } from "use-intl"
import type { Messages } from "@/i18n/messages"
import { type AccessLevel, type Area, can, type Grant, type Permissions } from "@/lib/access"
import { appUrl, returnPath } from "@/server/security"
import { workspaceCookie, workspaceSession } from "./workspace-session"

export async function setWorkspace(id: string) {
  ;(await cookies()).set(workspaceCookie, id, {
    httpOnly: true,
    secure: appUrl().startsWith("https:"),
    sameSite: "lax",
    path: "/"
  })
}

export async function signedInUser() {
  if (!process.env.WORKOS_CLIENT_ID) {
    return null
  }
  return (await withAuth()).user
}

// Next's remaining request boundary. Workspace lookup and authorization are independent of this framework.
export async function identity(returnTo?: string) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const { user } = await withAuth()
  if (!user) {
    const url = (await headers()).get("x-url")
    const requested = returnTo ?? (url && URL.canParse(url) ? `${new URL(url).pathname}${new URL(url).search}` : null)
    redirect(`/login?next=${encodeURIComponent(returnPath(requested, "/"))}`)
  }
  return user
}

export async function session() {
  const user = await identity()
  const active = (await cookies()).get(workspaceCookie)?.value
  const current = await workspaceSession(user, active)
  if (!current) {
    redirect("/onboarding")
  }
  return current
}

// Next titles a page whose metadata throws forbidden() as not found, so inaccessible metadata returns this title.
export async function noAccessTitle(): Promise<Metadata> {
  const t = await getTranslations("common.pages.forbidden")
  return { title: t("title") }
}
export type TitleKey = MessageKeys<Messages, NestedKeyOf<Messages>>
export function titleFor(title: TitleKey, area: Area, level: AccessLevel = "view") {
  return async (): Promise<Metadata> => {
    if (!can(await session(), area, level)) {
      return noAccessTitle()
    }
    const t = await getTranslations()
    return { title: t(title) }
  }
}
export function requirePage(s: Permissions, grant: Grant, level: AccessLevel = "view") {
  if (!can(s, grant, level)) {
    forbidden()
  }
}
