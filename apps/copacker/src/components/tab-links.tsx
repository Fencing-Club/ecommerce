import { useLocale } from "next-intl"
import Link from "next/link"
import { cn } from "@/lib/utils"

// Tabs that filter a list through the URL, such as a status, as links styled like shadcn's Tabs (the segmented control
// the supplier lists use), each with an optional count.
export function TabLinks({
  label,
  tabs,
  className
}: {
  label: string
  tabs: ReadonlyArray<{ label: string; href: string; current: boolean; count?: number }>
  className?: string
}) {
  const locale = useLocale()
  return (
    <nav
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-fit max-w-full items-center overflow-x-auto rounded-lg bg-muted p-[3px] [scrollbar-width:none]",
        className
      )}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "inline-flex h-full shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-muted-foreground dark:hover:text-foreground",
            tab.current &&
              "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="text-xs text-muted-foreground tabular-nums">{tab.count.toLocaleString(locale)}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}
