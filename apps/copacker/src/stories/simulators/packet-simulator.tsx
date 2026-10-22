import { shippingCopy, shippingMessage } from "@repo/copacker-shipments/shipping-copy"
import {
  type DocumentLanguage,
  documentSettingsSchema,
  groupProductRequirements,
  type DocumentSettings,
  type ShippingDocumentData
} from "@repo/copacker-shipments/shipping-model"
import { productChecks, shipmentDocumentChecks } from "@repo/copacker-shipments/shipping-rules"
import { Download } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { renderSupplierPacket } from "@/documents/supplier-packet"
import { localeNames } from "@/i18n/locales"
import { readPdfPages, type PagePreview } from "@/lib/pdf-preview"
import {
  type Arrangement,
  arrangementOptions,
  isPacketDataSet,
  packetDataSets,
  type PacketDataSetId,
  sampleLabels,
  simulatePacket
} from "./packet-data"
import { Setting } from "./simulator-parts"

const languages = documentSettingsSchema.shape.language
  .unwrap()
  .options.map((value) => ({ value, label: localeNames[value] }))
const papers = documentSettingsSchema.shape.paper.unwrap().options.map((value) => ({ value, label: value }))

// The checklist's sections as the packet prints them, in the packet's language: each product group's preparation,
// then the cartons, the pallets and the handoff.
function checklistSections(data: ShippingDocumentData, language: DocumentLanguage) {
  const t = shippingCopy[language]
  const checks = shipmentDocumentChecks(data)
  return [
    ...groupProductRequirements(data.products).map((products) => ({
      title: `${t.preparation} / ${products.map((product) => product.supplierSku).join(" / ")}`,
      checks: productChecks(products[0]!, language)
    })),
    { title: data.network === "forwarder" ? t.prepareTransfer : t.cartonRequirements, checks: checks.cartons },
    { title: t.pallets, checks: checks.pallets },
    { title: t.handoff, checks: checks.handoff }
  ].filter((section) => section.checks.length > 0)
}

// A rendered packet, or why it failed, with the data and settings it was rendered from.
type Rendered = { data: ShippingDocumentData; settings: DocumentSettings } & (
  | { url: string; pages: PagePreview[] }
  | { error: string }
)

// The supplier packet as production builds it: shippingDocumentSnapshot from the shipment, the checklist rules and the
// PDF renderer, with sample labels in Amazon's and the carrier's page sizes. Pick a data set, how it ships, and the
// packet's language and paper; the checklist and every page follow.
export function PacketSimulator({ dataSet: initial, ...arranged }: { dataSet: string } & Partial<Arrangement>) {
  const [dataSet, setDataSet] = useState<PacketDataSetId>(isPacketDataSet(initial) ? initial : "fbaParcel")
  const chosen = packetDataSets[dataSet]
  const [arrangement, setArrangement] = useState<Arrangement>({ ...chosen.arrangement, ...arranged })
  const [settings, setSettings] = useState<DocumentSettings>({ language: "en", paper: "A4" })
  const packet = useMemo(() => simulatePacket(chosen, arrangement), [chosen, arrangement])
  const [result, setResult] = useState<Rendered>()
  // A packet rendered for other inputs is stale: the new one is on its way.
  const rendered = result?.data === packet.data && result.settings === settings ? result : undefined
  useEffect(() => {
    let active = true
    let url: string | undefined
    void (async () => {
      try {
        const bytes = await renderSupplierPacket(packet.data, settings, await sampleLabels(packet.data))
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" })
        const pages = await readPdfPages(blob, () => active)
        if (active) {
          url = URL.createObjectURL(blob)
          setResult({ data: packet.data, settings, url, pages })
        }
      } catch (error) {
        if (active) {
          setResult({ data: packet.data, settings, error: error instanceof Error ? error.message : String(error) })
        }
      }
    })()
    return () => {
      active = false
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [packet, settings])
  const t = shippingCopy[settings.language]
  const arrange = <Key extends keyof Arrangement>(key: Key) => ({
    value: arrangement[key],
    options: arrangementOptions[key],
    onChange: (value: Arrangement[Key]) => setArrangement((current) => ({ ...current, [key]: value }))
  })
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Supplier packet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The real packet: production’s shipment snapshot, the checklist rules and the PDF renderer, with sample
            labels in Amazon’s and the carrier’s page sizes. Pick a data set and how it ships, and the checklist and
            every page follow.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Setting
            label="Data set"
            value={dataSet}
            options={Object.keys(packetDataSets)
              .filter(isPacketDataSet)
              .map((value) => ({ value, label: packetDataSets[value].name }))}
            onChange={(key) => {
              setDataSet(key)
              setArrangement(packetDataSets[key].arrangement)
            }}
          />
          <Setting label="Service" {...arrange("service")} />
          <Setting label="Handoff" {...arrange("handoff")} />
          <Setting label="Collection" {...arrange("collection")} />
          <Setting label="Carrier labels" {...arrange("carrierLabels")} />
          <Setting
            label="Language"
            value={settings.language}
            options={languages}
            onChange={(language) => setSettings((current) => ({ ...current, language }))}
          />
          <Setting
            label="Paper"
            value={settings.paper}
            options={papers}
            onChange={(paper) => setSettings((current) => ({ ...current, paper }))}
          />
        </div>
        <p className="text-sm">{chosen.note}</p>
      </header>
      <section
        aria-label="Production export"
        className={
          packet.refusal
            ? "rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            : "rounded-lg border bg-card p-4 text-sm"
        }
      >
        {packet.refusal ? (
          <>
            <p className="font-semibold">Production can’t export this packet yet</p>
            <p className="mt-1">
              shippingDocumentSnapshot refuses it: “{packet.refusal}” Below is what the documents would print, from the
              packing list snapshot with the packet’s labels and address.
            </p>
          </>
        ) : (
          <p>Production exports this packet: shippingDocumentSnapshot builds it from the shipment.</p>
        )}
      </section>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section
          aria-label="Checklist"
          dir={settings.language === "ur" ? "rtl" : "ltr"}
          className="flex flex-col gap-4 self-start rounded-lg border bg-card p-4 text-sm"
        >
          <h2 className="font-semibold">{t.checklist}</h2>
          {checklistSections(packet.data, settings.language).map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-medium text-muted-foreground">{section.title}</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {section.checks.map((check) => (
                  <li key={check.title + check.detail}>
                    <p className="font-medium">{t[check.title]}</p>
                    <p className="text-muted-foreground">
                      {shippingMessage(settings.language, check.detail, check.values)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section aria-label="Packet" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {rendered && "pages" in rendered
                ? `${rendered.pages.length} pages: packing list, checklist, then the labels`
                : "Packet"}
            </h2>
            {rendered && "url" in rendered && (
              <a
                href={rendered.url}
                download={`Supplier-packet-${dataSet}.pdf`}
                className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
              >
                <Download className="size-4" aria-hidden />
                Download PDF
              </a>
            )}
          </div>
          {!rendered && <p className="text-sm text-muted-foreground">Rendering the packet…</p>}
          {rendered && "error" in rendered && (
            <p role="alert" className="text-sm text-destructive">
              {rendered.error}
            </p>
          )}
          {rendered && "pages" in rendered && (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rendered.pages.map((page, index) => (
                <li key={index}>
                  <figure aria-label={`Packet page ${index + 1}`} className="flex flex-col gap-1">
                    <img
                      src={page.image}
                      alt={page.text.slice(0, 120)}
                      className="w-full rounded border bg-white shadow-xs"
                    />
                    <figcaption className="text-xs text-muted-foreground">Page {index + 1}</figcaption>
                  </figure>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
