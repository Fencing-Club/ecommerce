"use client"

import Link from "next/link"
import { createContext, use } from "react"
import { type AccessLevel, can, canOpen, type Grant, isAdmin, type Permissions } from "@/lib/access"
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

// Whether the person can open a page, or with "edit", change what's on it; for "prices", whether they see money.
export function useCan(grant: Grant, level: AccessLevel = "view") {
  return can(use(AccessContext), grant, level)
}

// Whether the person is the workspace's owner or an admin, who fix its store connections and settings.
export function useIsAdmin() {
  return isAdmin(use(AccessContext))
}

// Shows its children, such as a link to fix a store connection in Settings, to the owner and admins, and `fallback`
// to everyone else.
export function ForAdmins({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return useIsAdmin() ? children : fallback
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
