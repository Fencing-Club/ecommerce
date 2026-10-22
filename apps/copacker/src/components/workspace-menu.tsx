import { Toast } from "@base-ui/react/toast"
import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react"
import { useTranslations } from "use-intl"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace"
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

// The same identity in the sidebar menu and in the recovery picker.
export function WorkspaceIdentity({ workspace }: { workspace: Workspace }) {
  const t = useTranslations("navigation.workspaceMenu")
  return (
    <>
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
      <span className="flex min-w-0 flex-1 flex-col gap-px text-start">
        <span className="truncate font-medium">{workspace.name}</span>
        {isKind(workspace.kind) && (
          <span className="truncate text-xs text-muted-foreground">{t(`kinds.${workspace.kind}`)}</span>
        )}
      </span>
    </>
  )
}

// The workspace switcher at the top of the sidebar: the open workspace's kind tile and its name. Collapsed to the rail,
// only its tile. Copacker's own mark and name are in the top bar. The trigger doesn't name the kind, since most people
// have one workspace; the menu names each workspace's kind. Switching reloads, as WorkspaceWatch needs. The menu has
// closed by the time a switch fails, so the failure shows as a toast.
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
  const toast = Toast.useToastManager()
  const { switchTo } = useSwitchWorkspace({ onError: (message) => toast.add({ title: message, type: "error" }) })
  const open = workspaces.find((workspace) => workspace.id === active)
  const current = open?.name ?? fallbackName

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-ring flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-sm font-semibold hover:bg-muted aria-expanded:bg-muted group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        aria-label={t("label", { name: current })}
      >
        <span
          aria-hidden
          className={cn(
            tile,
            "text-xs font-semibold",
            open && isKind(open.kind) ? kinds[open.kind] : "bg-muted text-muted-foreground"
          )}
        >
          {initials(current)}
        </span>
        <span className="min-w-0 flex-1 truncate text-start group-data-[collapsible=icon]:hidden">{current}</span>
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-[264px] gap-0.5 rounded-[10px] p-1 ring-border">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => void switchTo(workspace.id)}
            className={cn(item, workspace.id === active && "bg-muted")}
          >
            <WorkspaceIdentity workspace={workspace} />
            {workspace.id === active && <Check className="ms-auto text-foreground" aria-label={t("current")} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="mx-1 my-1" />
        {/* Another company, or another role for this one, such as a buyer that also supplies. */}
        <DropdownMenuItem render={<a href="/workspaces/new" aria-label={t("newWorkspace")} />} className={item}>
          <span className={cn(tile, "border bg-background text-muted-foreground")} aria-hidden>
            <Plus className="size-3.5" />
          </span>
          {t("newWorkspace")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href="/settings" aria-label={t("workspaceSettings")} />} className={item}>
          <span className={cn(tile, "border bg-background text-muted-foreground")} aria-hidden>
            <Settings className="size-3.5" />
          </span>
          {t("workspaceSettings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
