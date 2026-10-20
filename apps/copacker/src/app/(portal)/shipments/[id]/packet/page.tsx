import { Download } from "lucide-react"
import { useTranslations } from "use-intl"
import { PageHeader } from "@/components/common"
import { ShippingDocumentPreview } from "@/components/shipping-document-preview"
import { Button } from "@/components/ui/button"
import { type DocumentSettings } from "@/documents/shipping-model"
import { type PacketLabels, renderSupplierPacket } from "@/documents/supplier-packet"
import { usePackingListDownload } from "@/hooks/use-packing-list-download"
import type { shipmentPacketPage, shipmentPacketResult } from "@/server/shipment-packet"

const labelNames = {
  carton_labels: "cartonLabels",
  carrier_labels: "carrierLabels",
  product_labels: "unitLabels"
} as const

export default function ShipmentPacketPage({ page }: { page: Awaited<ReturnType<typeof shipmentPacketResult>> }) {
  const t = useTranslations("shipments.detail.packet")
  if ("unavailable" in page) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("incompleteTitle")} />
        <p role="alert">{page.message}</p>
        <div className="flex flex-wrap gap-2">
          {/* The packing list needs no destination address or label assignments, so it prints anyway. */}
          <PackingListButton id={page.id} />
          {page.labelSections.map((section) => (
            <Button
              key={section}
              variant="outline"
              nativeButton={false}
              render={
                <a
                  download
                  aria-label={t(labelNames[section])}
                  href={`/api/shipments/${page.id}/packet?section=${section}`}
                />
              }
            >
              <Download />
              {t(labelNames[section])}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/shipments/${page.id}`} aria-label={t("backToShipment")} />}
        >
          {t("backToShipment")}
        </Button>
      </div>
    )
  }
  return <ReadyPacketPage page={page} />
}
function PackingListButton({ id }: { id: string }) {
  const t = useTranslations("shipments.detail.documents")
  const { download, busy } = usePackingListDownload(id)
  return (
    <Button variant="outline" aria-label={t("downloadPackingList")} disabled={busy} onClick={download}>
      <Download />
      {t("packingList")}
    </Button>
  )
}
function ReadyPacketPage({ page }: { page: Awaited<ReturnType<typeof shipmentPacketPage>> }) {
  const t = useTranslations("shipments.detail.packet")
  const url = (section: string) => `/api/shipments/${page.id}/packet?section=${section}&version=${page.version}`
  // In the packet’s order: the units’ labels, then the cartons’.
  const sections = [
    ...(page.hasProductLabels ? [{ section: "product_labels", kind: "product", label: t("unitLabels") } as const] : []),
    ...(page.data.network === "awd" || page.data.network === "fba"
      ? [{ section: "carton_labels", kind: "carton", label: t("cartonLabels") } as const]
      : []),
    ...(page.data.transport.carrierLabels
      ? [{ section: "carrier_labels", kind: "carrier", label: t("carrierLabels") } as const]
      : [])
  ]
  async function verify() {
    const response = await fetch(url("verify"), { cache: "no-store", redirect: "error" })
    if (!response.ok) {
      throw new Error("Packet changed")
    }
  }
  async function downloadPacket(settings: DocumentSettings) {
    await verify()
    const labels: PacketLabels = {}
    for (const { section, kind } of sections) {
      const response = await fetch(url(section), { cache: "no-store", redirect: "error" })
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/pdf")) {
        throw new Error("Labels unavailable")
      }
      labels[kind] = [new Uint8Array(await response.arrayBuffer())]
    }
    const bytes = await renderSupplierPacket(page.data, settings, labels)
    await verify()
    const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }))
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download =
      `Supplier-packet-${page.data.order}-${page.data.shipment}-r${page.data.revision}-${settings.language}-${settings.paper}.pdf`.replace(
        /[<>:"/\\|?*\p{Cc}]/gu,
        "-"
      )
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("title")}
        parents={[
          { label: page.data.order, href: `/orders/${page.orderId}` },
          { label: page.data.shipment, href: `/shipments/${page.id}` }
        ]}
      >
        {sections.map(({ section, label }) => (
          <Button
            key={section}
            variant="outline"
            nativeButton={false}
            render={<a href={url(section)} download aria-label={label} />}
          >
            <Download />
            {label}
          </Button>
        ))}
      </PageHeader>
      <ShippingDocumentPreview embedded data={page.data} beforeDownload={verify} downloadPacket={downloadPacket} />
    </div>
  )
}
