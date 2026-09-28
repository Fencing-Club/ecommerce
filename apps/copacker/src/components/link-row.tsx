"use client"

import { useRouter } from "next/navigation"
import { TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// Whether a click lands on the row itself: not on one of its links, buttons or menus, not the end of selecting text,
// and not inside a dialog or menu opened from the row, whose clicks React passes up to it from their portals.
export function isRowClick(event: React.MouseEvent<HTMLElement>) {
  const target = event.target
  return (
    target instanceof Element &&
    event.currentTarget.contains(target) &&
    !target.closest("a, button, input, select, textarea, label, [role='menuitem']") &&
    !window.getSelection()?.toString()
  )
}

// A table row that opens `href` from anywhere on it, like Shopify's lists. The link inside the row stays the way in
// for keyboards and screen readers; Ctrl or Cmd, or the middle button, opens a new tab as a link would.
export function LinkRow({ href, className, ...props }: React.ComponentProps<typeof TableRow> & { href: string }) {
  const router = useRouter()
  return (
    <TableRow
      {...props}
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if (!isRowClick(event)) {
          return
        }
        if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank", "noopener")
        } else {
          router.push(href)
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 1 && isRowClick(event)) {
          window.open(href, "_blank", "noopener")
        }
      }}
    />
  )
}
