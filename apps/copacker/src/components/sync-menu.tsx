"use client"

import { Ellipsis } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// A store's sync in its settings: Sync now, and Reconnect when signing in again would fix a failed sync. Syncs run on
// their own (webhooks, and every account again each night), so this is only for catching up at once.
export function SyncMenu({
  label,
  syncing,
  onSync,
  reconnect
}: {
  label: string
  syncing: boolean
  onSync: () => void
  // Where signing in again starts, when that's what the last sync needs.
  reconnect?: string | null
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${label} actions`} />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={syncing} onClick={onSync}>
          {syncing ? "Syncing…" : "Sync now"}
        </DropdownMenuItem>
        {reconnect && <DropdownMenuItem render={<a href={reconnect}>Reconnect</a>} />}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// When a sync last finished, as "Synced Sep 27, 12:00 AM", with the full date on hover.
export function SyncedAt({ at }: { at: string }) {
  return (
    <>
      Synced{" "}
      <time dateTime={at} title={new Date(at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}>
        {new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </time>
    </>
  )
}
