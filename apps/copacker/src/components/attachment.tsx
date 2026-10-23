import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Download, FileArchive, FileText } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The same downloadable file card for stored attachments and generated documents. */
export function Attachment({
  label,
  fileName,
  description,
  kind = "file",
  downloadLabel,
  href,
  onDownload,
  busy = false
}: {
  label: ReactNode
  fileName?: string
  description?: string
  kind?: "file" | "packet"
  downloadLabel: string
  href?: string
  onDownload?: () => void
  busy?: boolean
}) {
  return (
    <Button
      variant="outline"
      className={cn(attachmentClassName, kind === "packet" && "bg-muted/50")}
      aria-label={downloadLabel}
      disabled={busy}
      role={href ? "link" : undefined}
      nativeButton={!href}
      render={href ? <a href={href} aria-label={downloadLabel} /> : undefined}
      onClick={onDownload}
    >
      <AttachmentContent label={label} fileName={fileName} description={description} kind={kind} />
    </Button>
  )
}

export const attachmentClassName =
  "h-auto min-h-14 w-full justify-start gap-3 whitespace-normal p-3 text-start font-normal"

export function AttachmentContent({
  label,
  fileName,
  description,
  kind = "file",
  expandable = false
}: {
  label: ReactNode
  fileName?: string
  description?: string
  kind?: "file" | "packet"
  expandable?: boolean
}) {
  return (
    <>
      {kind === "packet" ? (
        <FileArchive aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      ) : (
        <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
        {fileName && (
          <span className="truncate text-xs text-muted-foreground">
            <span dir="ltr" title={fileName}>
              {fileName}
            </span>
          </span>
        )}
      </span>
      {expandable ? (
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Download aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
    </>
  )
}
