import { ChevronDown, Download, MoreHorizontal } from "lucide-react"
import { Attachment, AttachmentContent, attachmentClassName } from "./attachment"
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
  busy = false,
  productName,
  attachment = false
}: {
  items: ProductDownload[]
  onDownload: (ids: string[]) => void
  busy?: boolean
  productName?: string
  attachment?: boolean
}) {
  const available = items.filter((item) => !item.unavailable)
  if (attachment && available.length === 0) {
    return null
  }
  const single = available.length === 1 ? available[0] : undefined
  if (single) {
    const downloadLabel = `Download ${single.label.toLowerCase()}${productName ? ` for ${productName}` : ""}`
    return attachment ? (
      <Attachment
        label={single.label}
        downloadLabel={downloadLabel}
        busy={busy}
        onDownload={() => onDownload([single.id])}
      />
    ) : (
      <Button
        variant={productName ? "ghost" : "outline"}
        size={productName ? "icon-sm" : "default"}
        aria-label={downloadLabel}
        disabled={busy}
        onClick={() => onDownload([single.id])}
      >
        <Download />
        {!productName && single.label}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={productName ? "ghost" : "outline"}
            size={productName ? "icon-sm" : "default"}
            aria-label={productName ? `Labels for ${productName}` : undefined}
            className={attachment && !productName ? attachmentClassName : undefined}
            disabled={busy || !items.length}
          />
        }
      >
        {productName && <MoreHorizontal />}
        {!productName && attachment && <AttachmentContent label="Product labels" expandable />}
        {!productName && !attachment && (
          <>
            <Download />
            <span className="flex-1 text-start">Product labels</span>
            <ChevronDown />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        {(attachment ? available : items).map((item) => (
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
