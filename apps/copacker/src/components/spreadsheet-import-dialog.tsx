import { CircleAlert, Download } from "lucide-react"
import { type ReactNode, useId, useReducer } from "react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { downloadSpreadsheet } from "@/lib/spreadsheet-import"
import { cn } from "@/lib/utils"
import { FileDropzone } from "./file-dropzone"

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
export const scrollList = "focus-ring overflow-y-auto focus-visible:ring-inset"
const fileTypes = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"]
}

// Where the import is: choosing a file, which it reads once chosen, then reviewing what the file holds, importing it, or
// failed to. Whether to add or replace stays as chosen until the dialog closes, and the template downloads alongside.
type ImportState<T> = (
  | { step: "upload"; file: File | null; result: T | null }
  | { step: "review" | "loading" | "failed"; file: File; result: T }
) & { mode: ImportMode; template: "idle" | "downloading" | "failed" }
type ImportAction<T> =
  | { type: "choose"; file: File | null }
  | { type: "read"; file: File; result: T }
  | { type: "mode"; mode: ImportMode }
  | { type: "review" | "back" | "import" | "failed" | "reset" | "download" }
  | { type: "downloaded"; failed: boolean }

const startImport = { step: "upload", file: null, result: null, mode: "add", template: "idle" } as const
// A template download that failed says so until the next file or the dialog closes.
const keepDownload = (template: ImportState<unknown>["template"]) => (template === "failed" ? "idle" : template)

function importReducer<T>(state: ImportState<T>, action: ImportAction<T>): ImportState<T> {
  switch (action.type) {
    case "choose":
      return { ...state, step: "upload", file: action.file, result: null, template: keepDownload(state.template) }
    case "read":
      // A file read after another was chosen, or the dialog closed, is out of date.
      return state.step === "upload" && state.file === action.file ? { ...state, result: action.result } : state
    case "mode":
      return { ...state, mode: action.mode }
    case "review":
      return state.step === "upload" && state.file && state.result !== null
        ? { ...state, step: "review", file: state.file, result: state.result }
        : state
    case "back":
      return state.step === "review" ? { ...state, step: "upload" } : state
    case "import":
      return state.step === "review" ? { ...state, step: "loading" } : state
    case "failed":
      return state.step === "loading" ? { ...state, step: "failed" } : state
    case "reset":
      return { ...startImport, template: keepDownload(state.template) }
    case "download":
      return { ...state, template: "downloading" }
    case "downloaded":
      return { ...state, template: action.failed ? "failed" : "idle" }
  }
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
  const [state, dispatch] = useReducer(importReducer<T>, startImport)
  const { step, file, result, mode } = state
  const isReading = step === "upload" && file !== null && result === null
  const isBusy = isReading || step === "loading"
  const isDownloading = state.template === "downloading"
  const checked = result === null ? null : check(result, mode)
  const messages = checked ? [...checked.fileIssues, ...checked.issues] : []
  const submitLabel = step === "review" ? text[mode === "replace" ? "replace" : "import"] : text.review
  const hasTemplateError = checked && !checked.templateMatches

  function close() {
    if (!isBusy) {
      dispatch({ type: "reset" })
      onOpenChange(false)
    }
  }

  async function choose(next: File | null) {
    dispatch({ type: "choose", file: next })
    if (next) {
      dispatch({ type: "read", file: next, result: await read(next) })
    }
  }

  async function download() {
    dispatch({ type: "download" })
    // No finally clause: the React Compiler can't compile a component with one.
    try {
      downloadSpreadsheet(await template.build(), [template.title, reference, shipmentName])
      dispatch({ type: "downloaded", failed: false })
    } catch {
      dispatch({ type: "downloaded", failed: true })
    }
  }

  async function commit() {
    if (isBusy || messages.length || !checked?.rows || result === null) {
      return
    }
    dispatch({ type: "import" })
    try {
      await onImport(result, mode)
      dispatch({ type: "reset" })
      onOpenChange(false)
    } catch {
      dispatch({ type: "failed" })
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
              {isDownloading ? <Spinner /> : <Download aria-hidden />}
              {t("downloadTemplate")}
            </Button>
            {state.template === "failed" && (
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
            <Spinner className="size-5" />
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
                dispatch({ type: "mode", mode: value })
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
        {!isBusy && step !== "failed" && (hasTemplateError || (step === "review" && messages.length > 0)) && (
          // A long list scrolls inside its box, keeping the title, choice and buttons in view. Below a few rows' height
          // the dialog scrolls instead.
          <div
            role="alert"
            className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border", messages.length > 3 && "min-h-48")}
          >
            <h3 id={`${id}-issues`} className="shrink-0 border-b bg-muted px-3 py-2 text-meta font-semibold">
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
                  onClick={() => (step === "review" ? dispatch({ type: "back" }) : close())}
                >
                  {step === "review" ? t("back") : t("cancel")}
                </Button>
              )}
              <Button
                type="button"
                disabled={
                  isBusy || !checked?.templateMatches || (step === "review" && (messages.length > 0 || !checked.rows))
                }
                onClick={() => (step === "review" ? void commit() : dispatch({ type: "review" }))}
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
