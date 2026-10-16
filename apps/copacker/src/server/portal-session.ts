import { can } from "@/lib/access"
import { homeFor } from "@/lib/navigation"
import { ownProfile } from "./profile"
import { returnPath } from "./security"
import { workspaceSession } from "./workspace-session"

type User = Parameters<typeof workspaceSession>[0]

// Every protected operation resolves current memberships. This result is never itself sent to the browser.
export async function portalSession(user: User | null, active: string | undefined, requested: string) {
  const next = returnPath(requested, "/")
  if (!user) {
    return { redirect: `/login?next=${encodeURIComponent(next)}` } as const
  }
  const session = await workspaceSession(user, active)
  if (!session) {
    return { redirect: "/onboarding" } as const
  }
  if (!(await ownProfile(user.id)).complete) {
    return { redirect: `/onboarding?next=${encodeURIComponent(next)}` } as const
  }
  return { session } as const
}

export function overviewDestination(session: NonNullable<Awaited<ReturnType<typeof workspaceSession>>>) {
  return !can(session, "overview") || session.org.kind === "forwarder" ? homeFor(session.org.kind, session) : null
}

// An explicit shell DTO: connection credentials and other organization settings remain on the server.
export function portalShell(
  session: NonNullable<Awaited<ReturnType<typeof workspaceSession>>>,
  sidebar: string | undefined
) {
  return {
    name: session.org.name,
    kind: session.org.kind,
    active: session.org.id,
    userName: session.user.name,
    email: session.user.email,
    workspaces: session.workspaces,
    defaultOpen: sidebar !== "false",
    permissions: { role: session.role, access: session.access }
  }
}
