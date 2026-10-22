import { useWindowEvent } from "@mantine/hooks"
import { useEffect, useEffectEvent } from "react"
import { z } from "zod"

const workspaceStatus = z.union([
  z.object({ id: z.string() }),
  z.object({ redirect: z.enum(["/workspaces", "/workspaces?unavailable=1", "/onboarding"]) })
])

// Tabs of this browser tell each other when the workspace changes.
const channel = "copacker-workspace"

// Set once this tab switches workspaces: it's on its way to the new workspace's home, so its own announcement, which it
// hears too, mustn't reload the page it's leaving.
let switching = false

export function announceWorkspace(id: string) {
  switching = true
  const broadcast = new BroadcastChannel(channel)
  broadcast.postMessage(id)
  broadcast.close()
}

// The workspace is kept in a cookie every tab shares, and the portal's shell (its sidebar and header) doesn't render
// again on navigation. After another tab switches workspaces, a page opened here would show that workspace's data
// under this one's name. So the shell reloads when another tab announces a switch, and checks the active workspace
// whenever the page changes or the window comes back into focus. `id` is the workspace the shell was rendered for, if
// any; `pathname` is the page.
export function useWorkspaceWatch({ id, pathname }: { id?: string; pathname?: string } = {}) {
  async function check() {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" })
      // AuthKit may have ended a session tied to a deleted organization. A fetch follows the sign-in redirect,
      // but doesn't navigate the document, so do that explicitly rather than attempting to parse its HTML.
      if (response.redirected) {
        if (id && new URL(response.url).pathname === "/login") {
          window.location.assign("/login?next=%2Fworkspaces")
        }
        // The outer error boundary also covers public pages. Without a rendered workspace, leave those errors
        // alone; its Switch workspace link can start sign-in if needed.
        return
      }
      if (!response.ok) {
        return
      }
      const current = workspaceStatus.parse(await response.json())
      if ("redirect" in current) {
        window.location.assign(current.redirect)
      } else if (id && current.id !== id) {
        window.location.reload()
      }
    } catch {
      // Offline: the next navigation checks again.
    }
  }
  const pageChanged = useEffectEvent(() => void check())

  useEffect(() => {
    const broadcast = new BroadcastChannel(channel)
    broadcast.onmessage = (event: MessageEvent<string>) => {
      if (!switching && (!id || event.data !== id)) {
        window.location.reload()
      }
    }
    return () => broadcast.close()
  }, [id])

  // Checks on every page change.
  useEffect(() => {
    pageChanged()
  }, [pathname])

  useWindowEvent("focus", () => void check())
  useWindowEvent("pageshow", (event) => {
    if (event.persisted) {
      window.location.reload()
    }
  })
}
