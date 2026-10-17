import { useLocalStorage } from "@mantine/hooks"
import { ChevronDown, Download, LoaderCircle, ZoomIn, ZoomOut } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { shippingCopy } from "@/documents/shipping-copy"
import {
  documentSettingsForLocale,
  documentIssues,
  documentSettingsSchema,
  shippingPdfFilename,
  type DocumentKind,
  type DocumentSettings,
  type ShippingDocumentData
} from "@/documents/shipping-model"
import { renderShippingDocument, ShippingPdf } from "@/documents/shipping-pdf"
import { localeNames } from "@/i18n/locales"
import { readPdfPages, type PagePreview } from "@/lib/pdf-preview"
import { Button } from "./ui/button"
import { ButtonGroup, ButtonGroupSeparator } from "./ui/button-group"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

export const shippingSettingsKey = "copacker.shipping-document-settings"

type Props = {
  data: ShippingDocumentData
  embedded?: boolean
  shipments?: ShippingDocumentData[]
  initialKind?: DocumentKind
  initialSettings?: DocumentSettings
  settingsKey?: string
  renderPdf?: typeof renderShippingPdf
  beforeDownload?: () => Promise<void>
  downloadPacket?: (settings: DocumentSettings) => Promise<void>
}

async function renderShippingPdf(
  data: ShippingDocumentData,
  kind: DocumentKind,
  settings: DocumentSettings,
  shipments?: ShippingDocumentData[]
) {
  return renderShippingDocument(<ShippingPdf data={data} kind={kind} settings={settings} shipments={shipments} />)
}

function Choice({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Select
        value={value}
        items={options}
        onValueChange={(value) => {
          if (value) {
            onChange(value)
          }
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DownloadSettings({
  settings,
  onChange
}: {
  settings: DocumentSettings
  onChange: (value: DocumentSettings) => void
}) {
  const t = useTranslations("shipments.documentPreview")
  const update = (key: keyof DocumentSettings, value: string) => {
    const parsed = documentSettingsSchema.safeParse({ ...settings, [key]: value })
    if (parsed.success) {
      onChange(parsed.data)
    }
  }
  return (
    <Popover>
      <PopoverTrigger render={<Button size="icon" aria-label={t("settings")} />}>
        <ChevronDown />
      </PopoverTrigger>
      <PopoverContent align="end" className="gap-4 p-4">
        <PopoverTitle>{t("settings")}</PopoverTitle>
        <Choice
          label={t("language")}
          value={settings.language}
          onChange={(value) => update("language", value)}
          options={documentSettingsSchema.shape.language.unwrap().options.map((value) => ({
            value,
            label: localeNames[value]
          }))}
        />
        <Choice
          label={t("paper")}
          value={settings.paper}
          onChange={(value) => update("paper", value)}
          options={[
            { value: "A4", label: "A4" },
            { value: "LETTER", label: "US Letter" }
          ]}
        />
      </PopoverContent>
    </Popover>
  )
}

type PreviewState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; url: string; pages: PagePreview[] }

function DocumentRender({
  data,
  shipments,
  kind,
  settings,
  onSettings,
  renderPdf,
  beforeDownload,
  downloadPacket
}: Props & {
  kind: DocumentKind
  settings: DocumentSettings
  onSettings: (value: DocumentSettings) => void
  renderPdf: typeof renderShippingPdf
}) {
  const t = useTranslations("shipments.documentPreview")
  const identity = JSON.stringify([data, shipments, kind, settings])
  const [zoomed, setZoomed] = useState(false)
  const [isDownloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  async function download(run: () => Promise<void>) {
    setDownloading(true)
    setDownloadError(false)
    try {
      await run()
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }
  const [rendered, setRendered] = useState<{ identity: string; result: PreviewState }>({
    identity: "",
    result: { status: "loading" }
  })
  const result: PreviewState = rendered.identity === identity ? rendered.result : { status: "loading" }
  useEffect(() => {
    let isActive = true
    let url: string | undefined
    async function render() {
      const blob = await renderPdf(data, kind, settings, shipments)
      if (!isActive) {
        return
      }
      const pages = await readPdfPages(blob, () => isActive)
      if (isActive) {
        url = URL.createObjectURL(blob)
        setRendered({ identity, result: { status: "ready", url, pages } })
      }
    }
    render().catch(() => {
      if (isActive) {
        setRendered({ identity, result: { status: "failed" } })
      }
    })
    return () => {
      isActive = false
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [data, shipments, kind, settings, renderPdf, identity])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <output className="text-sm text-muted-foreground" dir="ltr">
          {result.status === "ready" &&
            t("pages", { count: result.pages.length, paper: settings.paper === "LETTER" ? "US Letter" : "A4" })}
          {result.status === "loading" && t("preparing")}
          {result.status === "failed" && t("unavailable")}
        </output>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {downloadPacket && (
            <Button
              variant="outline"
              disabled={isDownloading || result.status !== "ready"}
              onClick={() => download(() => downloadPacket(settings))}
            >
              {t("packet")}
            </Button>
          )}
          {result.status === "ready" && (
            <Button
              variant="outline"
              size="icon"
              aria-label={zoomed ? t("fit") : t("zoom")}
              onClick={() => setZoomed(!zoomed)}
            >
              {zoomed ? <ZoomOut /> : <ZoomIn />}
            </Button>
          )}
          <ButtonGroup aria-label={t("download")}>
            {result.status === "ready" ? (
              <Button
                render={
                  <a
                    aria-label={t("download")}
                    href={result.url}
                    download={shippingPdfFilename(data, kind, settings)}
                  />
                }
                disabled={isDownloading}
                onClick={
                  beforeDownload
                    ? (event) => {
                        event.preventDefault()
                        download(async () => {
                          await beforeDownload()
                          const link = document.createElement("a")
                          link.href = result.url
                          link.download = shippingPdfFilename(data, kind, settings)
                          link.click()
                        })
                      }
                    : undefined
                }
              >
                <Download />
                {t("download")}
              </Button>
            ) : (
              <Button disabled>
                <Download />
                {t("download")}
              </Button>
            )}
            <ButtonGroupSeparator className="bg-primary/60" />
            <DownloadSettings settings={settings} onChange={onSettings} />
          </ButtonGroup>
        </div>
      </div>
      {downloadError && <p role="alert">{t("changed")}</p>}
      {result.status === "loading" && (
        <div className="flex min-h-80 items-center justify-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          {t("previewLoading")}
        </div>
      )}
      {result.status === "failed" && (
        <p role="alert" className="rounded-lg border p-5">
          {t("failed")}
        </p>
      )}
      {result.status === "ready" && (
        <div className="overflow-x-auto rounded-lg bg-muted" aria-label={t("preview")}>
          <div className={`flex flex-col items-center gap-6 p-3 sm:p-6 ${zoomed ? "min-w-[864px]" : ""}`}>
            {result.pages.map((page, index) => (
              <figure key={index} className="w-full max-w-[816px]" aria-label={t("page", { page: index + 1 })}>
                <img
                  src={page.image}
                  alt={t("pageOf", { page: index + 1, total: result.pages.length })}
                  width={page.width}
                  height={page.height}
                  className="h-auto w-full border"
                />
                <figcaption className="sr-only">{page.text}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export function ShippingDocumentPreview({
  data,
  embedded = false,
  shipments,
  initialKind = "packing",
  initialSettings,
  settingsKey = shippingSettingsKey,
  renderPdf = renderShippingPdf,
  beforeDownload,
  downloadPacket
}: Props) {
  const locale = useLocale()
  const t = useTranslations("shipments.documentPreview")
  const [kind, setKind] = useState(initialKind)
  const [storedSettings, setSettings] = useLocalStorage<unknown>({ key: settingsKey })
  const parsed = documentSettingsSchema.safeParse(storedSettings)
  const settings = parsed.success ? parsed.data : (initialSettings ?? documentSettingsForLocale(locale))
  const issues = (kind === "overview" ? (shipments ?? [data]) : [data]).flatMap((shipment) =>
    documentIssues(shipment, kind)
  )
  return (
    <section
      className={`mx-auto flex w-full max-w-5xl flex-col gap-5 ${embedded ? "" : "p-4 sm:p-6"}`}
      aria-label={t("title")}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.order}
              {kind !== "overview" ? ` / ${data.shipment}` : ""}
            </p>
          </div>
        )}
        <Choice
          label={t("document")}
          value={kind}
          onChange={(value) => {
            if (value === "packing" || value === "checklist" || value === "reference" || value === "overview") {
              setKind(value)
            }
          }}
          options={(["packing", "checklist", "reference", "overview"] as const).map((value) => ({
            value,
            label: shippingCopy[documentSettingsForLocale(locale).language][value]
          }))}
        />
      </div>
      {issues.length > 0 ? (
        <>
          <div className="flex justify-end">
            <ButtonGroup aria-label={t("download")}>
              <Button disabled>
                <Download />
                {t("download")}
              </Button>
              <ButtonGroupSeparator className="bg-primary/60" />
              <DownloadSettings settings={settings} onChange={setSettings} />
            </ButtonGroup>
          </div>
          <div role="alert" className="rounded-lg border p-5">
            <p className="mb-3 font-medium">{t("issues")}</p>
            <ul className="list-disc space-y-1 ps-5">
              {issues.map((issue, index) => (
                <li key={index}>
                  {issue.carton}: {shippingCopy[settings.language][issue.code]}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <DocumentRender
          data={data}
          shipments={shipments}
          kind={kind}
          settings={settings}
          onSettings={setSettings}
          renderPdf={renderPdf}
          beforeDownload={beforeDownload}
          downloadPacket={downloadPacket}
        />
      )}
    </section>
  )
}
