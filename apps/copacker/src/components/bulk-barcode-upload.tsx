"use client"

import { CircleCheck, UploadCloud } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
import { useErrorMessage } from "@/hooks/use-error-text"
import { cn } from "@/lib/utils"
import type { BarcodeTarget } from "@/server/product-barcodes"
import { WarningNote } from "./common"
import { pdfFiles } from "./file-dropzone"
import { useUploadBarcodeMutation } from "./product-barcodes"

// One chosen file and what happened to it. A file whose SKU matched no single variation can be retried with a SKU.
type Result =
  | { status: "waiting" | "uploading"; file: File }
  | { status: "saved"; file: File; target: BarcodeTarget; replaced: boolean }
  | { status: "failed"; file: File; message: string; retry: boolean }

// The most a barcode PDF may weigh, as the upload takes it.
const maxBytes = 32 * 1024 * 1024

function Retry({ result, onRetry }: { result: Extract<Result, { status: "failed" }>; onRetry: (sku: string) => void }) {
  const t = useTranslations("products.bulkUpload")
  const [sku, setSku] = useState("")
  const id = `retry-${result.file.name}`
  return (
    <form
      className="mt-1 flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (sku.trim()) {
          onRetry(sku.trim())
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor={id} className="text-xs font-normal text-muted-foreground">
          {t("skuFor", { file: result.file.name })}
        </FieldLabel>
        <Input id={id} value={sku} onChange={(event) => setSku(event.target.value)} autoComplete="off" />
      </Field>
      <Button type="submit" variant="outline" disabled={!sku.trim()}>
        {t("save")}
      </Button>
    </form>
  )
}

function ResultRow({ result, onRetry }: { result: Result; onRetry: (sku: string) => void }) {
  const t = useTranslations("products.bulkUpload")
  // The variation a file was saved to, such as "Tee, Large (TEE-L)".
  const targetLabel = (target: BarcodeTarget) => {
    const name = target.variant
      ? t("productVariant", { product: target.product, variant: target.variant })
      : target.product
    return target.sku ? t("nameSku", { name, sku: target.sku }) : name
  }
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <span className="text-sm font-medium [overflow-wrap:anywhere]">{result.file.name}</span>
      {result.status === "waiting" && <span className="text-xs text-muted-foreground">{t("waiting")}</span>}
      {result.status === "uploading" && <span className="text-xs text-muted-foreground">{t("uploading")}</span>}
      {result.status === "saved" && (
        <span className="inline-flex items-start gap-1 text-xs">
          <CircleCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
          <span>
            {result.replaced
              ? t("replacedFor", { target: targetLabel(result.target) })
              : t("savedFor", { target: targetLabel(result.target) })}
          </span>
        </span>
      )}
      {result.status === "failed" && (
        <>
          <WarningNote>{result.message}</WarningNote>
          {result.retry && <Retry result={result} onRetry={onRetry} />}
        </>
      )}
    </li>
  )
}

// Uploads many barcode PDFs at once, matching each to a variation by the SKU in its file name.
export function BulkBarcodeUpload({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("products.bulkUpload")
  const errorMessage = useErrorMessage()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  // How many of the last files dropped or chosen weren't PDFs within the size limit.
  const [skipped, setSkipped] = useState(0)
  const [upload] = useUploadBarcodeMutation()
  // Drop, paste or click the zone to choose PDFs; react-dropzone leaves out anything else.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: pdfFiles,
    maxSize: maxBytes,
    disabled: running,
    onDrop: (accepted, rejected) => {
      setFiles(accepted)
      setSkipped(rejected.length)
      setResults([])
    }
  })
  const update = (index: number, result: Result) =>
    setResults((current) => current.map((item, at) => (at === index ? result : item)))

  async function send(file: File, index: number, sku?: string) {
    update(index, { status: "uploading", file })
    const data = new FormData()
    data.set("file", file)
    if (sku) {
      data.set("sku", sku)
    }
    try {
      const saved = await upload(data).unwrap()
      update(index, { status: "saved", file, target: saved.target, replaced: saved.replaced })
      return true
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? error.status : null
      update(index, {
        status: "failed",
        file,
        message: errorMessage(error, t("uploadFailed")),
        // No variation, or several, have that SKU; another SKU may match.
        retry: status === 404 || status === 409
      })
      return false
    }
  }

  async function start() {
    setRunning(true)
    setResults(files.map((file) => ({ status: "waiting", file })))
    let saved = 0
    // One at a time, so each request stays small and the list shows progress.
    for (const [index, file] of files.entries()) {
      if (await send(file, index)) {
        saved++
      }
    }
    setRunning(false)
    setFiles([])
    if (saved) {
      onChanged()
    }
  }

  async function retry(index: number, sku: string) {
    const result = results[index]
    if (result && (await send(result.file, index, sku))) {
      onChanged()
    }
  }

  const done = results.filter((result) => result.status === "saved" || result.status === "failed").length
  const failed = results.filter((result) => result.status === "failed").length
  const uploadLabel = t("uploadFiles", { count: files.length })

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!running) {
          setOpen(next)
          if (!next) {
            setResults([])
            setFiles([])
            setSkipped(0)
          }
        }
      }}
    >
      <SheetTrigger render={<Button variant="outline" />}>
        <UploadCloud data-icon="inline-start" />
        {t("title")}
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div
            {...getRootProps({ role: "button", "aria-label": t("choose") })}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              isDragActive && "border-ring bg-muted/50",
              running && "cursor-default opacity-50"
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{files.length ? t("chosen", { count: files.length }) : t("dropHere")}</span>
            <span className="text-xs text-muted-foreground">{t("sizeLimit")}</span>
          </div>
          {skipped > 0 && <WarningNote>{t("skipped", { count: skipped })}</WarningNote>}
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {running
                  ? t("progress", { current: Math.min(done + 1, results.length), total: results.length })
                  : t("savedCount", { saved: results.length - failed, total: results.length })}
              </p>
              <ul className="divide-y rounded-lg border" aria-label={t("results")}>
                {results.map((result, index) => (
                  <ResultRow
                    key={`${result.file.name}-${index}`}
                    result={result}
                    onRetry={(sku) => void retry(index, sku)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
        <SheetFooter className="border-t sm:flex-row sm:justify-end">
          <Button type="button" disabled={running || !files.length} onClick={() => void start()}>
            {running ? t("uploading") : uploadLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
