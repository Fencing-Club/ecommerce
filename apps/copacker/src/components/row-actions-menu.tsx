import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, Spinner } from "@buildkitgg/shadcn-baseui-kit"
import { Ellipsis } from "lucide-react"

// A list row's actions behind its ⋯ button, such as Edit and Remove. While one of them runs, a spinner takes the
// button's place.
export function RowActionsMenu({
  label,
  pending = false,
  pendingLabel = label,
  className = "w-36",
  children
}: {
  // The button's name, with the row's, such as "More actions for Yiwu warehouse".
  label: string
  pending?: boolean
  // The spinner's name, such as "Removing Yiwu warehouse".
  pendingLabel?: string
  // The menu's width.
  className?: string
  // The menu's items.
  children: React.ReactNode
}) {
  if (pending) {
    return (
      <Button variant="ghost" size="icon-sm" disabled aria-busy aria-label={pendingLabel}>
        <Spinner aria-hidden />
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={className}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
