"use client"

import { useWindowEvent } from "@mantine/hooks"
import { usePathname } from "next/navigation"
import { useEffect } from "react"

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
// whenever the page changes or the window comes back into focus.
export function WorkspaceWatch({ id }: { id: string }) {
  const pathname = usePathname()

  async function check() {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" })
      const current = response.ok ? ((await response.json()) as { id: string }).id : id
      if (current !== id) {
        window.location.reload()
      }
    } catch {
      // Offline: the next navigation checks again.
    }
  }

  useEffect(() => {
    const broadcast = new BroadcastChannel(channel)
    broadcast.onmessage = (event: MessageEvent<string>) => {
      if (!switching && event.data !== id) {
        window.location.reload()
      }
    }
    return () => broadcast.close()
  }, [id])

  useEffect(() => {
    void check()
    // Checks on every page change; check only reads the id this shell was rendered for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useWindowEvent("focus", () => void check())
  return null
}
