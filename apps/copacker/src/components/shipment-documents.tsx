import { Attachment } from "./attachment"
import { ProductDownloadsMenu, type ProductDownload } from "./product-downloads-menu"

export type ShipmentDownload = { id: string; label: string; fileName?: string }

export function ShipmentDocuments({
  documents,
  productLabels,
  onDownload,
  onProductDownload,
  onDownloadPacket,
  busy = false
}: {
  documents: ShipmentDownload[]
  productLabels: ProductDownload[]
  onDownload: (id: string) => void
  onProductDownload: (ids: string[]) => void
  onDownloadPacket?: () => void
  busy?: boolean
}) {
  return (
    <section aria-label="Shipment documents" className="space-y-3">
      <h2 className="text-sm font-semibold">Documents</h2>
      {onDownloadPacket && (
        <Attachment
          kind="packet"
          label="Shipment packet"
          description="All shipment documents"
          downloadLabel="Download shipment packet"
          busy={busy}
          onDownload={onDownloadPacket}
        />
      )}
      <div className="space-y-2">
        <ProductDownloadsMenu attachment items={productLabels} onDownload={onProductDownload} busy={busy} />
        {documents.map((doc) => (
          <Attachment
            key={doc.id}
            label={doc.label}
            fileName={doc.fileName}
            downloadLabel={`Download ${doc.label.toLowerCase()}`}
            busy={busy}
            onDownload={() => onDownload(doc.id)}
          />
        ))}
      </div>
    </section>
  )
}
