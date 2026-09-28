import Link from "next/link"
import { BrandMark } from "./auth/stage"
import { NotificationsMenu } from "./notifications-menu"
import { SearchCommand } from "./search-command"

// The app header across the top of every portal page, like Shopify's: Copacker's logo and name, search in the middle,
// and notifications on the right. With room, the outer columns share it equally, so the search is centered in the
// window. Narrower, they shrink to the logo and the bell, and the search fills the space between them with equal gaps.
// On a phone the search becomes a button beside the notifications.
export function SiteHeader({ kind }: { kind: string }) {
  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/80 min-[30rem]:grid min-[30rem]:grid-cols-[1fr_minmax(0,36rem)_1fr] min-[30rem]:gap-4">
      <Link
        href="/"
        className="shrink-0 justify-self-start rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BrandMark flat />
      </Link>
      <div className="ms-auto min-[30rem]:ms-0 min-[30rem]:w-full">
        <SearchCommand kind={kind} />
      </div>
      <div className="flex items-center justify-end">
        <NotificationsMenu />
      </div>
    </header>
  )
}
