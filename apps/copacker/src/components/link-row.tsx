import { TableRow } from "@buildkitgg/shadcn"
import { usePermissions } from "@/components/access"
import { canOpen } from "@/lib/access"
import { cn } from "@/lib/utils"

// Whether a click lands on the row itself: not on one of its links, buttons, checkboxes or menus, not the end of
// selecting text, and not inside a dialog or menu opened from the row, whose clicks React passes up to it from their
// portals.
function isRowClick(event: React.MouseEvent<HTMLElement>) {
  const target = event.target
  return (
    target instanceof Element &&
    event.currentTarget.contains(target) &&
    !target.closest("a, button, input, select, textarea, label, [role='menuitem'], [role='checkbox']") &&
    !window.getSelection()?.toString()
  )
}

// What a row opens: a page at `href`, or, with `onOpen`, something on this page, such as a sheet with the record.
type Opens = { href: string; onOpen?: never } | { onOpen: () => void; href?: never }

// The one clickable table row, like Shopify's lists: a click anywhere on it opens what it's for. The link or button
// inside the row stays the way in for keyboards and screen readers. For a page, Ctrl or Cmd, or the middle button,
// opens a new tab as a link would, and a row leading to a page the person can't open stays a plain row.
export function LinkRow({ href, onOpen, className, ...props }: React.ComponentProps<typeof TableRow> & Opens) {
  const permissions = usePermissions()
  if (href !== undefined && !canOpen(permissions, href)) {
    return <TableRow {...props} className={className} />
  }
  return (
    <TableRow
      {...props}
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if (!isRowClick(event)) {
          return
        }
        if (href === undefined) {
          onOpen?.()
        } else if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank", "noopener")
        } else {
          const link = Array.from(event.currentTarget.querySelectorAll("a")).find(
            (anchor) => anchor.getAttribute("href") === href
          )
          if (link) {
            link.click()
          } else {
            window.location.assign(href)
          }
        }
      }}
      onAuxClick={(event) => {
        if (href !== undefined && event.button === 1 && isRowClick(event)) {
          window.open(href, "_blank", "noopener")
        }
      }}
    />
  )
}
