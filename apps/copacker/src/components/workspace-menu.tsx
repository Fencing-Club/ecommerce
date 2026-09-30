"use client"

import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { CopackerMark } from "@/components/auth/stage"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { announceWorkspace } from "@/components/workspace-watch"
import { useActionMutation } from "@/lib/api"
import { cn } from "@/lib/utils"

export type Workspace = { id: string; name: string; kind: string }

// Each kind's mark: its soft tile with its initials in the kind's color, and its name under the "navigation" messages'
// `workspaceMenu.kinds`. The kind colors show here and nowhere else, never on an action.
const kinds = {
  buyer: "bg-kind-buyer-soft text-kind-buyer",
  supplier: "bg-kind-supplier-soft text-kind-supplier",
  forwarder: "bg-kind-forwarder-soft text-kind-forwarder"
} as const

function isKind(kind: string): kind is keyof typeof kinds {
  return Object.hasOwn(kinds, kind)
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// A 28px tile at the start of each of the menu's items.
const tile = "flex size-7 shrink-0 items-center justify-center rounded-[7px]"
const item = "gap-2.5 rounded-[6px] px-2 py-1.5"

// The top bar's workspace switcher: Copacker's mark and the open workspace's name. The bar doesn't name the kind, since
// most people have one workspace; the menu names each workspace's kind. Switching reloads, as WorkspaceWatch needs.
export function WorkspaceMenu({
  active,
  fallbackName,
  workspaces
}: {
  active: string
  // The workspace's name as the session gave it, until the workspace list has it.
  fallbackName: string
  workspaces: ReadonlyArray<Workspace>
}) {
  const t = useTranslations("navigation.workspaceMenu")
  const [run] = useActionMutation()
  const current = workspaces.find((workspace) => workspace.id === active)?.name ?? fallbackName

  async function switchTo(id: string) {
    if (id === active) {
      return
    }
    await run({ action: "workspace.switch", data: { id } }).unwrap()
    announceWorkspace(id)
    // A full load re-renders the shared portal layout, which a client navigation keeps from the old workspace.
    window.location.assign("/")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-[15px] font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted md:gap-2.5 md:px-2 md:text-sm"
        aria-label={t("label", { name: current })}
      >
        <CopackerMark className="size-6 rounded-[6px] md:size-7 md:rounded-[7px] [&>svg]:size-3.5 md:[&>svg]:size-4" />
        <span className="truncate">{current}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground max-md:hidden" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-[264px] gap-0.5 rounded-[10px] p-1 shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-border"
      >
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => void switchTo(workspace.id)}
            className={cn(item, workspace.id === active && "bg-muted")}
          >
            <span
              aria-hidden
              className={cn(
                tile,
                "text-xs font-semibold",
                isKind(workspace.kind) ? kinds[workspace.kind] : "bg-muted text-muted-foreground"
              )}
            >
              {initials(workspace.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate font-medium">{workspace.name}</span>
              {isKind(workspace.kind) && (
                <span className="truncate text-xs text-muted-foreground">{t(`kinds.${workspace.kind}`)}</span>
              )}
            </span>
            {workspace.id === active && <Check className="ms-auto text-foreground" aria-label={t("current")} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="mx-1 my-1" />
        {/* Another company, or another role for this one, such as a buyer that also supplies. */}
        <DropdownMenuItem render={<Link href="/workspaces/new" />} className={item}>
          <span className={cn(tile, "border bg-background text-muted-foreground")} aria-hidden>
            <Plus className="size-3.5" />
          </span>
          {t("newWorkspace")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />} className={item}>
          <span className={cn(tile, "border bg-background text-muted-foreground")} aria-hidden>
            <Settings className="size-3.5" />
          </span>
          {t("workspaceSettings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
