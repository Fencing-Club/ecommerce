import { Box } from "lucide-react"
import Link from "next/link"
import { NotificationsMenu } from "./notifications-menu"
import { SearchCommand } from "./search-command"

// The app header across the top of every portal page, like Shopify's: Copacker's logo and name, search in the middle,
// and notifications on the right. The two outer columns always match, so the search stays centered in the window and
// shrinks as it narrows; on a phone it becomes a button beside the notifications.
export function SiteHeader({ kind, preview }: { kind: string; preview: boolean }) {
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/80 min-[30rem]:grid min-[30rem]:grid-cols-[minmax(8rem,1fr)_minmax(0,36rem)_minmax(8rem,1fr)]">
      <Link
        href={preview ? "/preview" : "/"}
        className="flex shrink-0 items-center gap-2 justify-self-start rounded-md font-semibold tracking-tight whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Box className="size-4" />
        </span>
        Copacker
      </Link>
      <div className="ml-auto min-[30rem]:ml-0 min-[30rem]:w-full">
        <SearchCommand kind={kind} preview={preview} />
      </div>
      <div className="flex items-center justify-end">
        <NotificationsMenu />
      </div>
    </header>
  )
}
