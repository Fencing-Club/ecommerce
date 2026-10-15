"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { useLocale } from "use-intl"
import { cn } from "@/lib/utils"

type Tab = {
  label: string
  href: string
  current: boolean
  count?: number
  // The count is work waiting on the viewer, such as a list's Needs you view, so it takes the primary tint.
  attention?: boolean
}

// Tabs that change the URL: a list's saved views, or a record's sections. Each is a link, the current one marked with
// aria-current and a 2px underline, and a count shows only when it's more than zero. A row too wide for the screen
// scrolls sideways and keeps the current tab in view.
export function TabLinks({ label, tabs, className }: { label: string; tabs: ReadonlyArray<Tab>; className?: string }) {
  const locale = useLocale()
  const nav = useRef<HTMLElement>(null)
  const currentHref = tabs.find((tab) => tab.current)?.href
  useEffect(() => {
    nav.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [currentHref])
  return (
    <nav
      ref={nav}
      aria-label={label}
      data-slot="tab-links"
      className={cn(
        "flex max-w-full items-stretch gap-5 overflow-x-auto border-b [scrollbar-width:none] md:gap-6",
        className
      )}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50",
            tab.current && "border-foreground text-foreground"
          )}
        >
          {tab.label}
          {tab.count ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-xs font-medium tabular-nums",
                tab.attention ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {tab.count.toLocaleString(locale)}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
