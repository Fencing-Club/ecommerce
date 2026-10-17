import { getCookie } from "@tanstack/react-start/server"
import { identity } from "@/server/auth"
import { workspaceCookie, workspaceMemberships } from "@/server/workspace-session"

// Available even when the portal cannot resolve its saved workspace.
export async function GET() {
  const user = await identity("/workspaces")
  const active = getCookie(workspaceCookie)
  const available = await workspaceMemberships(user.id)
  const current = available.find(({ org }) => org.id === active)
  const headers = { "Cache-Control": "no-store" }
  if (current) {
    return Response.json({ id: current.org.id }, { headers })
  }
  if (!available.length) {
    return Response.json({ redirect: "/onboarding" }, { headers })
  }
  return Response.json({ redirect: active ? "/workspaces?unavailable=1" : "/workspaces" }, { headers })
}
