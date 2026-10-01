"use client"

import { Menu } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { CopackerMark } from "@/components/auth/stage"
import { useSidebar } from "@/components/ui/sidebar"
import { AccountMenu } from "./account-menu"
import { CreateMenu } from "./create-menu"
import { NotificationsMenu } from "./notifications-menu"
import { SearchCommand } from "./search-command"

export type TopBarProps = {
  // The signed-in person's name; their email shows until they give one.
  userName: string | null
  email: string
  kind: string
}

// The bar across the top of every portal page: Copacker's mark and name, search in the middle, then Create, the Inbox
// and the person's account. The outer columns share the width equally, so the search is centered in the window; when
// the window is too narrow for that, the search narrows rather than covering either side. The workspace switcher is at
// the top of the sidebar, which collapses from its rail or Ctrl+B on a computer. On a phone the bar is the menu button
// that opens the sidebar as a sheet, Copacker, then search and the Inbox as buttons; the account is in the sheet.
export function TopBar({ userName, email, kind }: TopBarProps) {
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
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:gap-2.5 md:px-2 md:text-sm"
        >
          <CopackerMark className="size-6 rounded-[6px] md:size-7 md:rounded-[7px] [&>svg]:size-3.5 md:[&>svg]:size-4" />
          Copacker
        </Link>
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
