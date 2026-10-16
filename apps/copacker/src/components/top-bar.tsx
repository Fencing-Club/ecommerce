"use client"

import { Menu } from "lucide-react"
import { useTranslations } from "use-intl"
import { CopackerMark } from "@/components/auth/stage"
import { useSidebar } from "@/components/ui/sidebar"
import { CreateMenu } from "./create-menu"
import { NotificationsMenu } from "./notifications-menu"
import { SearchCommand } from "./search-command"

export type TopBarProps = {
  kind: string
  navigate: (href: string) => void
}

// The bar across the top of every portal page: Copacker's mark and name, search in the middle, then Create and the
// Inbox. The outer columns share the width equally, so the search is centered in the window; when the window is too
// narrow for that, the search narrows rather than covering either side. The workspace switcher is at the top of the
// sidebar and the person's account at its bottom; on a computer the sidebar's toggle is in the page's corner. On a phone
// the bar starts with the menu button that opens the sidebar as a sheet, and Create isn't shown since each list's own
// action covers it.
export function TopBar({ kind, navigate }: TopBarProps) {
  const t = useTranslations("common.ui")
  const { toggleSidebar } = useSidebar()
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-0.5 border-b bg-background ps-1 pe-1.5 md:grid md:grid-cols-[minmax(max-content,1fr)_minmax(0,30rem)_minmax(max-content,1fr)] md:gap-4 md:px-4">
      <div className="flex min-w-0 flex-1 items-center">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t("toggleSidebar")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <a
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:gap-2.5 md:px-2 md:text-sm"
        >
          <CopackerMark className="size-6 rounded-[6px] md:size-7 md:rounded-[7px] [&>svg]:size-3.5 md:[&>svg]:size-4" />
          Copacker
        </a>
      </div>
      <div className="md:w-full">
        <SearchCommand kind={kind} navigate={navigate} />
      </div>
      <div className="flex items-center justify-end gap-2 max-md:gap-0">
        <span className="max-md:hidden">
          <CreateMenu kind={kind} />
        </span>
        <NotificationsMenu />
      </div>
    </header>
  )
}
