"use client"

import Link from "next/link"
import { createContext, use } from "react"
import { type AccessLevel, type Area, can, canOpen, type Permissions } from "@/lib/access"
import { cn } from "@/lib/utils"

// What the signed-in person can do in the open workspace, for the portal's client components: the sidebar, the header's
// search, and the controls a page shows only to people who can use them. The server checks every request as well.
const AccessContext = createContext<Permissions>({ role: "member", access: {} })

export function AccessProvider({ permissions, children }: { permissions: Permissions; children: React.ReactNode }) {
  return <AccessContext value={permissions}>{children}</AccessContext>
}

export function usePermissions() {
  return use(AccessContext)
}

// Whether the person can open a page, or with "edit", change what's on it.
export function useCan(area: Area, level: AccessLevel = "view") {
  return can(use(AccessContext), area, level)
}

// Whether a link in the portal leads somewhere the person can open, such as "/restock?status=order".
export function useCanOpen(href: string) {
  return canOpen(use(AccessContext), href)
}

// A link to a portal page, which stays as plain text for someone who can't open that page, such as an Overview row
// that leads to Restock for a member without it.
export function PageLink({
  href,
  className,
  title,
  children
}: {
  href: string
  className?: string
  title?: string
  children: React.ReactNode
}) {
  if (!useCanOpen(href)) {
    return (
      <span title={title} className={cn(className, "pointer-events-none")}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} title={title} className={className}>
      {children}
    </Link>
  )
}

// Shows its children, such as a card's link to its whole list, only to someone who can open the page.
export function IfCanOpen({ href, children }: { href: string; children: React.ReactNode }) {
  return useCanOpen(href) ? children : null
}
