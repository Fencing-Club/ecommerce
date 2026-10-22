import { ChevronDown, Download, MoreHorizontal } from "lucide-react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Attachment, AttachmentContent, attachmentClassName } from "./attachment"

// A label type to download: a file at href, or one the onDownload callback makes.
export type ProductDownload = { id: string; label: string; href?: string; unavailable?: string }

/** Callbacks receive only label types available to the current PO or shipment. */
export function ProductDownloadsMenu({
  items,
  onDownload,
  allHref,
  busy = false,
  productName,
  attachment = false
}: {
  items: ProductDownload[]
  onDownload?: (ids: string[]) => void
  // Every available label in one file, where items link to files.
  allHref?: string
  busy?: boolean
  productName?: string
  attachment?: boolean
}) {
  const t = useTranslations("shipments.labels")
  const available = items.filter((item) => !item.unavailable)
  if (attachment && available.length === 0) {
    return null
  }
  // A product row always offers its labels from a menu; the documents list links a lone label directly.
  const single = available.length === 1 && !productName ? available[0] : undefined
  if (single) {
    const downloadLabel = t("download", { label: single.label })
    return attachment ? (
      <Attachment
        label={single.label}
        downloadLabel={downloadLabel}
        busy={busy}
        href={single.href}
        onDownload={single.href ? undefined : () => onDownload?.([single.id])}
      />
    ) : (
      <Button
        variant="outline"
        aria-label={downloadLabel}
        disabled={busy}
        nativeButton={!single.href}
        render={single.href ? <a href={single.href} download aria-label={downloadLabel} /> : undefined}
        onClick={single.href ? undefined : () => onDownload?.([single.id])}
      >
        <Download />
        {single.label}
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
            aria-label={productName ? t("labelsFor", { name: productName }) : undefined}
            className={attachment && !productName ? attachmentClassName : undefined}
            disabled={busy || !items.length}
          />
        }
      >
        {productName && <MoreHorizontal />}
        {!productName && attachment && <AttachmentContent label={t("productLabels")} expandable />}
        {!productName && !attachment && (
          <>
            <Download />
            <span className="flex-1 text-start">{t("productLabels")}</span>
            <ChevronDown />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        {(attachment ? available : items).map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={Boolean(item.unavailable)}
            render={
              item.href && !item.unavailable ? <a href={item.href} download aria-label={item.label} /> : undefined
            }
            onClick={item.href ? undefined : () => onDownload?.([item.id])}
          >
            <span>
              {item.label}
              {item.unavailable && <span className="block text-xs text-muted-foreground">{item.unavailable}</span>}
            </span>
          </DropdownMenuItem>
        ))}
        {available.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={allHref ? <a href={allHref} download aria-label={t("downloadAll")} /> : undefined}
              onClick={allHref ? undefined : () => onDownload?.(available.map((item) => item.id))}
            >
              <Download />
              {t("downloadAll")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
