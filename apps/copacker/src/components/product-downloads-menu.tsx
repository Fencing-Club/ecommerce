import { ChevronDown, Download } from "lucide-react"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./ui/dropdown-menu"

export type ProductDownload = { id: string; label: string; unavailable?: string }

/** Callbacks receive only label types available to the current PO or shipment. */
export function ProductDownloadsMenu({
  items,
  onDownload,
  busy = false
}: {
  items: ProductDownload[]
  onDownload: (ids: string[]) => void
  busy?: boolean
}) {
  const available = items.filter((item) => !item.unavailable)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" disabled={busy || !items.length} />}>
        Product labels
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        {items.map((item) => (
          <DropdownMenuItem key={item.id} disabled={Boolean(item.unavailable)} onClick={() => onDownload([item.id])}>
            <span>
              {item.label}
              {item.unavailable && <span className="block text-xs text-muted-foreground">{item.unavailable}</span>}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!available.length} onClick={() => onDownload(available.map((item) => item.id))}>
          <Download />
          Download all product labels
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
