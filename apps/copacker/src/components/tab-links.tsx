import Link from "next/link"
import { cn } from "@/lib/utils"

// Tabs that filter a list through the URL, such as a status, as links styled as a segmented control.
export function TabLinks({
  label,
  tabs,
  className
}: {
  label: string
  tabs: ReadonlyArray<{ label: string; href: string; current: boolean }>
  className?: string
}) {
  return (
    <nav aria-label={label} className={cn("flex gap-1 overflow-x-auto", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            tab.current && "bg-muted text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
