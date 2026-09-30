"use client"

import { Menu } from "lucide-react"
import { useTranslations } from "next-intl"
import { useSidebar } from "@/components/ui/sidebar"
import { AccountMenu } from "./account-menu"
import { CreateMenu } from "./create-menu"
import { NotificationsMenu } from "./notifications-menu"
import { SearchCommand } from "./search-command"
import { type Workspace, WorkspaceMenu } from "./workspace-menu"

export type TopBarProps = {
  // The workspace's name, shown until the workspace list has it.
  name: string
  // The signed-in person's name; their email shows until they give one.
  userName: string | null
  email: string
  kind: string
  active: string
  workspaces: ReadonlyArray<Workspace>
}

// The bar across the top of every portal page: the workspace menu, search in the middle, then Create, the Inbox and the
// person's account. The outer columns share the width equally, so the search is centered in the window. On a computer
// the sidebar collapses from its rail or Ctrl+B. On a phone the bar is the menu button that opens the sidebar as a sheet,
// the workspace, then search and the Inbox as buttons; Create and the account are in the sheet.
export function TopBar({ name, userName, email, kind, active, workspaces }: TopBarProps) {
  const t = useTranslations("common.ui")
  const { toggleSidebar } = useSidebar()
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-0.5 border-b bg-background ps-1 pe-1.5 md:grid md:grid-cols-[1fr_minmax(0,30rem)_1fr] md:gap-4 md:px-4">
      <div className="flex min-w-0 flex-1 items-center">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t("toggleSidebar")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <WorkspaceMenu active={active} fallbackName={name} workspaces={workspaces} />
      </div>
      <div className="md:w-full">
        <SearchCommand kind={kind} />
      </div>
      <div className="flex items-center justify-end gap-2 max-md:gap-0">
        <span className="max-md:hidden">
          <CreateMenu kind={kind} />
        </span>
        <NotificationsMenu />
        <span className="max-md:hidden">
          <AccountMenu name={userName ?? email} email={email} />
        </span>
      </div>
    </header>
  )
}
