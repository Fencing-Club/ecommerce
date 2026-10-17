import { redirect } from "@tanstack/react-router"
import { createTranslator } from "use-intl"
import { identity, setWorkspace } from "./auth"
import { localization } from "./localization"
import { workspaceMemberships } from "./workspace-session"

export async function readWorkspacesData() {
  const user = await identity("/workspaces")
  const available = await workspaceMemberships(user.id)
  if (!available.length) {
    throw redirect({ href: "/onboarding" })
  }
  if (available.length === 1) {
    // This is a server-only route that writes the cookie, including when recovery starts during client navigation.
    throw redirect({ href: "/workspaces/recover", reloadDocument: true })
  }
  const t = createTranslator(await localization())
  return {
    title: t("navigation.workspacePicker.title"),
    workspaces: available.map(({ org }) => ({ id: org.id, name: org.name, kind: org.kind }))
  }
}

// Recheck at the cookie-writing boundary: memberships can change after the picker loader ran.
export async function recoverWorkspace(): Promise<never> {
  const user = await identity("/workspaces")
  const available = await workspaceMemberships(user.id)
  if (!available.length) {
    throw redirect({ href: "/onboarding" })
  }
  if (available.length !== 1) {
    throw redirect({ href: "/workspaces" })
  }
  setWorkspace(available[0]!.org.id)
  throw redirect({ href: "/" })
}
