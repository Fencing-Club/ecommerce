import { type OrderInput, validatePacking } from "@repo/aisle"
import { CircleAlert, Download, LoaderCircle } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { cartonTotals, expandCartonGroups, type CartonGroup } from "@/lib/carton-groups"
import { cartonTemplate, readCartonFile, type CartonImportResult } from "@/lib/carton-import"
import { FileDropzone } from "./file-dropzone"
import { ProductIdentity } from "./product-identity"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"

export type CartonImportMode = "add" | "replace"
export const cartonFileTypes = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"]
}

export function CartonImportDialog({
  open,
  onOpenChange,
  order,
  shipmentName,
  existing,
  availablePieces,
  onImport
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OrderInput
  shipmentName: string
  existing: CartonGroup[]
  availablePieces: Record<string, number>
  onImport: (groups: CartonGroup[], mode: CartonImportMode) => Promise<void>
}) {
  const t = useTranslations("orders.cartonImport")
  const rules = useTranslations("server.readiness.packing")
  const editor = useTranslations("orders.cartonEditor")
  const format = useFormatter()
  const id = useId()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<CartonImportResult | null>(null)
  const [step, setStep] = useState<"upload" | "review" | "loading" | "failed">("upload")
  const [mode, setMode] = useState<CartonImportMode>("add")
  const [isReading, setReading] = useState(false)
  const [isDownloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const operation = useRef(0)
  const isBusy = isReading || step === "loading"
  const groups = result?.groups ?? []
  const totals = cartonTotals(groups)
  const combined = mode === "add" ? [...existing, ...groups] : groups
  const tooMany = cartonTotals(combined).cartons > 1000
  const checked =
    result?.templateMatches && !result.issues.length && !tooMany
      ? validatePacking(
          order,
          { cartons: expandCartonGroups(combined), changes: [] },
          Object.fromEntries(
            order.items.map((item) => [item.id, Math.max(0, item.pieces - (availablePieces[item.id] ?? 0))])
          )
        ).issues
      : []
  const messages = [
    ...(result?.issues ?? []).map((issue) => ({
      location: issue.row
        ? [t("row", { row: issue.row }), issue.carton ? editor("carton", { carton: issue.carton }) : ""]
            .filter(Boolean)
            .join(" / ")
        : "",
      message: t(`errors.${issue.code}`, { value: issue.value ?? "" })
    })),
    ...checked.map((issue) => ({
      location: issue.cartonId ? editor("carton", { carton: issue.cartonId }) : "",
      message: "values" in issue ? rules(issue.code, issue.values) : rules(issue.code)
    })),
    ...(tooMany ? [{ location: "", message: t("errors.limit") }] : [])
  ]
  const submitLabel = step === "review" ? t(mode === "replace" ? "replace" : "import") : t("review")
  const hasTemplateError = result && !result.templateMatches

  function reset() {
    operation.current++
    setFile(null)
    setResult(null)
    setStep("upload")
    setReading(false)
    setMode("add")
    setDownloadError(false)
  }
  function close() {
    if (!isBusy) {
      reset()
      onOpenChange(false)
    }
  }

  async function choose(next: File | null) {
    const ticket = ++operation.current
    setFile(next)
    setResult(null)
    setStep("upload")
    setDownloadError(false)
    if (!next) {
      setReading(false)
      return
    }
    setReading(true)
    const parsed = await readCartonFile(next, order.items)
    if (ticket !== operation.current) {
      return
    }
    setResult(parsed)
    setReading(false)
  }

  async function download() {
    setDownloading(true)
    setDownloadError(false)
    try {
      const bytes = await cartonTemplate(order.items)
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      )
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "carton-template.xlsx"
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  async function commit() {
    if (isBusy || messages.length || !groups.length) {
      return
    }
    setStep("loading")
    try {
      await onImport(groups, mode)
      reset()
      onOpenChange(false)
    } catch {
      setStep("failed")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <DialogContent
        showCloseButton={!isBusy}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 overflow-y-auto p-5 sm:max-w-2xl sm:p-6"
      >
        <DialogHeader>
          <DialogTitle>{step === "review" ? t("reviewTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {order.reference} / {shipmentName}
          </DialogDescription>
        </DialogHeader>
        {step === "upload" && (
          <div className="flex flex-col items-start gap-2">
            <Button type="button" variant="outline" disabled={isDownloading || isBusy} onClick={() => void download()}>
              {isDownloading ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
              {t("downloadTemplate")}
            </Button>
            {downloadError && (
              <p role="alert" className="text-xs text-destructive">
                {t("downloadFailed")}
              </p>
            )}
          </div>
        )}
        <FileDropzone
          accept={cartonFileTypes}
          maxBytes={10 * 1024 * 1024}
          file={file}
          onFileChange={(next) => void choose(next)}
          disabled={isBusy}
          hint={t("formats")}
        />
        {isBusy && (
          <output className="flex items-center gap-3 py-4">
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
            <span>{isReading ? t("checking") : t("importing")}</span>
          </output>
        )}
        {step === "failed" && (
          <div role="alert" className="flex gap-2 rounded-lg border border-destructive p-3 text-destructive">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <p>{t("failed")}</p>
          </div>
        )}
        {!isBusy && step !== "failed" && (hasTemplateError || (step === "review" && messages.length > 0)) && (
          <div role="alert" className="overflow-hidden rounded-lg border border-destructive">
            <h3 className="bg-destructive/5 px-3 py-2 font-medium text-destructive">
              {hasTemplateError ? t("templateMismatch") : t("issues", { count: messages.length })}
            </h3>
            <ul className="divide-y">
              {messages.map((issue, index) => (
                <li key={`${issue.location}-${index}`} className="flex flex-col gap-1 p-3 text-xs">
                  {issue.location && <p className="font-medium">{issue.location}</p>}
                  <p className="flex gap-2 text-destructive">
                    <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span className="whitespace-pre-line">{issue.message}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {step === "review" && result?.templateMatches && (
          <>
            {existing.length > 0 && !messages.length && (
              <RadioGroup
                value={mode}
                onValueChange={(value) => {
                  if (value === "add" || value === "replace") {
                    setMode(value)
                  }
                }}
                aria-label={t("mode")}
                className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-5"
              >
                {(["add", "replace"] as const).map((option) => (
                  <label key={option} htmlFor={`${id}-${option}`} className="flex items-center gap-2">
                    <RadioGroupItem id={`${id}-${option}`} value={option} />
                    {t(option)}
                  </label>
                ))}
              </RadioGroup>
            )}
            {!messages.length && (
              <>
                <div className="flex justify-between gap-3 text-xs font-medium">
                  <span>{t("cartonCount", { count: totals.cartons })}</span>
                  <span>
                    {t("productCount", {
                      count: new Set(groups.flatMap((carton) => carton.items.map((item) => item.itemId))).size
                    })}
                  </span>
                  <span>{editor("unitCount", { count: totals.pieces })}</span>
                </div>
                <Accordion
                  defaultValue={groups[0] ? [groups[0].cartonId] : []}
                  className="overflow-hidden rounded-lg border"
                >
                  {groups.map((carton) => (
                    <AccordionItem key={carton.cartonId} value={carton.cartonId}>
                      <AccordionTrigger className="items-center gap-3 rounded-none bg-muted/50 px-3 hover:no-underline">
                        <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                          <span className="flex justify-between gap-3">
                            <span>{editor("carton", { carton: carton.cartonId })}</span>
                            <span>
                              {editor("unitCount", {
                                count: carton.items.reduce((sum, item) => sum + item.pieces, 0) * carton.count
                              })}
                            </span>
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {carton.count > 1 && <>{t("cartonCount", { count: carton.count })} / </>}
                            {t("measurements", {
                              count: carton.count,
                              length: format.number(carton.length),
                              width: format.number(carton.width),
                              height: format.number(carton.height),
                              weight: format.number(carton.weight)
                            })}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-0 [&_p:not(:last-child)]:mb-0">
                        {carton.items.map((content) => {
                          const product = order.items.find((item) => item.id === content.itemId)
                          return product ? (
                            <div key={content.itemId} className="flex items-center gap-3 border-t p-3">
                              <div className="min-w-0 flex-1">
                                <ProductIdentity item={product} />
                              </div>
                              <div className="text-end tabular-nums">
                                <p>{format.number(content.pieces / product.piecesPerSet)}</p>
                                {product.piecesPerSet > 1 && (
                                  <p className="text-xs text-muted-foreground">
                                    {editor("unitCount", { count: content.pieces })}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : null
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </>
            )}
          </>
        )}
        <div className="mt-auto flex justify-end gap-2 pt-1">
          {step === "failed" ? (
            <Button type="button" variant="outline" onClick={close}>
              {t("close")}
            </Button>
          ) : (
            <>
              {step !== "loading" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => (step === "review" ? setStep("upload") : close())}
                >
                  {step === "review" ? t("back") : t("cancel")}
                </Button>
              )}
              <Button
                type="button"
                disabled={
                  isBusy || !result?.templateMatches || (step === "review" && (messages.length > 0 || !groups.length))
                }
                onClick={() => (step === "review" ? void commit() : setStep("review"))}
              >
                {step === "loading" ? t("importingButton") : submitLabel}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
