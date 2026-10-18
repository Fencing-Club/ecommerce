import { Download, FileText } from "lucide-react"
import { ProductDownloadsMenu, type ProductDownload } from "./product-downloads-menu"
import { Button } from "./ui/button"

export type ShipmentDownload = { id: string; label: string; unavailable?: string }

export function ShipmentDocuments({
  documents,
  productLabels,
  onDownload,
  onProductDownload,
  busy = false
}: {
  documents: ShipmentDownload[]
  productLabels: ProductDownload[]
  onDownload: (id: string) => void
  onProductDownload: (ids: string[]) => void
  busy?: boolean
}) {
  return (
    <section aria-label="Shipment documents" className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <h2 className="text-sm font-semibold">Documents</h2>
        <ProductDownloadsMenu items={productLabels} onDownload={onProductDownload} busy={busy} />
      </div>
      <div className="divide-y">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 p-4 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p>{doc.label}</p>
              {doc.unavailable && <p className="text-xs text-muted-foreground">{doc.unavailable}</p>}
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Download ${doc.label.toLowerCase()}`}
              disabled={busy || Boolean(doc.unavailable)}
              onClick={() => onDownload(doc.id)}
            >
              <Download />
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
