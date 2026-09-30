"use client"

import { useLocale } from "next-intl"
import Link from "next/link"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// Tabs that change the URL: a list's saved views, or a record's sections. Each is a link, the current one marked with
// aria-current, and a count shows only when it's more than zero. A row too wide for the screen scrolls sideways and keeps
// the current tab in view.
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
        "flex h-10 max-w-full items-stretch gap-5 overflow-x-auto border-b [scrollbar-width:none]",
        className
      )}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50",
            tab.current && "border-foreground text-foreground"
          )}
        >
          {tab.label}
          {tab.count ? (
            <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
              {tab.count.toLocaleString(locale)}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
