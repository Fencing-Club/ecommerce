"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
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

// The bar across the top of every portal page: the sidebar's button and the workspace menu, search in the middle, then
// Create, the Inbox and the person's account. With room, the outer columns share the width equally, so the search is
// centered in the window. On a phone the sidebar's button opens it as a sheet and the search becomes a button.
export function TopBar({ name, userName, email, kind, active, workspaces }: TopBarProps) {
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm supports-backdrop-filter:bg-background/80 min-[30rem]:grid min-[30rem]:grid-cols-[1fr_minmax(0,36rem)_1fr] min-[30rem]:gap-4 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <SidebarTrigger className="shrink-0" />
        <WorkspaceMenu active={active} fallbackName={name} workspaces={workspaces} />
      </div>
      <div className="min-[30rem]:w-full">
        <SearchCommand kind={kind} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <CreateMenu kind={kind} />
        <NotificationsMenu />
        <AccountMenu name={userName ?? email} email={email} />
      </div>
    </header>
  )
}
