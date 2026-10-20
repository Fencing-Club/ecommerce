import { CircleAlert, Download, LoaderCircle } from "lucide-react"
import { type ReactNode, useId, useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { downloadSpreadsheet } from "@/lib/spreadsheet-import"
import { cn } from "@/lib/utils"
import { FileDropzone } from "./file-dropzone"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"

export type ImportMode = "add" | "replace"
export type ImportMessage = { location: string; message: string }
// A file read and checked: whether it matches the template, the file's own issues, the issues of adding it to what's
// there or putting it in its place, a line above the issues saying what they have in common, and how many rows it
// would import.
export type ImportCheck = {
  templateMatches: boolean
  fileIssues: ImportMessage[]
  issues: ImportMessage[]
  hint?: string
  rows: number
}
// A list that scrolls inside the dialog, focusable so it scrolls from the keyboard too.
export const scrollList =
  "overflow-y-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
const fileTypes = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"]
}

// The spreadsheet import that cartons and pallets share (section 07): download the template, upload a file, review what
// it holds, then add it to what's there or replace it. The file's own issues hide the choice, since the other mode
// won't fix them; issues from adding to what's there keep it, so Replace stays a way out.
export function SpreadsheetImportDialog<T>({
  open,
  onOpenChange,
  reference,
  shipmentName,
  text,
  hasExisting,
  read,
  check,
  template,
  renderReview,
  onImport
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The order and shipment, shown under the title and in the template's file name.
  reference: string
  shipmentName: string
  text: Record<"title" | "review" | "reviewTitle" | "failed" | "add" | "replace" | "import" | "importing", string>
  hasExisting: boolean
  read: (file: File) => Promise<T>
  check: (result: T, mode: ImportMode) => ImportCheck
  // The template, named like the app's other downloads: "Pallet template - PO38 - Shipment 1.xlsx".
  template: { title: string; build: () => Promise<BlobPart> }
  renderReview: (result: T) => ReactNode
  onImport: (result: T, mode: ImportMode) => Promise<void>
}) {
  // The dialog's own copy is the carton import's, where it began.
  const t = useTranslations("orders.cartonImport")
  const id = useId()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<T | null>(null)
  const [step, setStep] = useState<"upload" | "review" | "loading" | "failed">("upload")
  const [mode, setMode] = useState<ImportMode>("add")
  const [isReading, setReading] = useState(false)
  const [isDownloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const operation = useRef(0)
  const isBusy = isReading || step === "loading"
  const checked = result === null ? null : check(result, mode)
  const messages = checked ? [...checked.fileIssues, ...checked.issues] : []
  const submitLabel = step === "review" ? text[mode === "replace" ? "replace" : "import"] : text.review
  const hasTemplateError = checked && !checked.templateMatches

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
    const parsed = await read(next)
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
      downloadSpreadsheet(await template.build(), [template.title, reference, shipmentName])
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  async function commit() {
    if (isBusy || messages.length || !checked?.rows || result === null) {
      return
    }
    setStep("loading")
    try {
      await onImport(result, mode)
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
          <DialogTitle>{step === "review" ? text.reviewTitle : text.title}</DialogTitle>
          <DialogDescription>
            {reference} / {shipmentName}
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
          accept={fileTypes}
          maxBytes={10 * 1024 * 1024}
          file={file}
          onFileChange={(next) => void choose(next)}
          disabled={isBusy}
          hint={t("formats")}
        />
        {isBusy && (
          <output className="flex items-center gap-3 py-4">
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
            <span>{isReading ? t("checking") : text.importing}</span>
          </output>
        )}
        {step === "failed" && (
          <div role="alert" className="flex gap-2 rounded-lg border border-destructive p-3 text-destructive">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <p>{text.failed}</p>
          </div>
        )}
        {step === "review" && checked?.templateMatches && hasExisting && !checked.fileIssues.length && (
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
                {text[option]}
              </label>
            ))}
          </RadioGroup>
        )}
        {!isBusy &&
          step !== "failed" &&
          (hasTemplateError || (step === "review" && messages.length > 0)) && (
            // A long list scrolls inside its box, keeping the title, choice and buttons in view. Below a few rows' height
            // the dialog scrolls instead.
            <div
              role="alert"
              className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-lg border",
                messages.length > 3 && "min-h-48"
              )}
            >
              <h3 id={`${id}-issues`} className="shrink-0 border-b bg-muted px-3 py-2 text-[13px] font-semibold">
                {hasTemplateError ? t("templateMismatch") : t("issues", { count: messages.length })}
              </h3>
              {!hasTemplateError && checked?.hint && (
                <p className="shrink-0 border-b px-3 py-2 text-xs">{checked.hint}</p>
              )}
              <ul
                aria-labelledby={`${id}-issues`}
                // The list scrolls and holds nothing focusable, so it takes focus for the keyboard to scroll it.
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className={cn("min-h-0 divide-y", scrollList)}
              >
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
        {step === "review" && result !== null && checked?.templateMatches && !messages.length && renderReview(result)}
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
                  isBusy || !checked?.templateMatches || (step === "review" && (messages.length > 0 || !checked.rows))
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
