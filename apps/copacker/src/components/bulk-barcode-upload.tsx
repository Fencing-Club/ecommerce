"use client"

import { CircleCheck, UploadCloud } from "lucide-react"
import { useState } from "react"
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
import { errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { BarcodeTarget } from "@/server/product-barcodes"
import { WarningNote } from "./common"
import { useUploadBarcodeMutation } from "./product-barcodes"

// One chosen file and what happened to it. A file whose SKU matched no single variation can be retried with a SKU.
type Result =
  | { status: "waiting" | "uploading"; file: File }
  | { status: "saved"; file: File; target: BarcodeTarget; replaced: boolean }
  | { status: "failed"; file: File; message: string; retry: boolean }

function targetLabel(target: BarcodeTarget) {
  const name = target.variant ? `${target.product}, ${target.variant}` : target.product
  return target.sku ? `${name} (${target.sku})` : name
}

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name)

function Retry({ result, onRetry }: { result: Extract<Result, { status: "failed" }>; onRetry: (sku: string) => void }) {
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
          SKU for {result.file.name}
        </FieldLabel>
        <Input id={id} value={sku} onChange={(event) => setSku(event.target.value)} autoComplete="off" />
      </Field>
      <Button type="submit" variant="outline" disabled={!sku.trim()}>
        Save
      </Button>
    </form>
  )
}

function ResultRow({ result, onRetry }: { result: Result; onRetry: (sku: string) => void }) {
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <span className="text-sm font-medium [overflow-wrap:anywhere]">{result.file.name}</span>
      {result.status === "waiting" && <span className="text-xs text-muted-foreground">Waiting</span>}
      {result.status === "uploading" && <span className="text-xs text-muted-foreground">Uploading…</span>}
      {result.status === "saved" && (
        <span className="inline-flex items-start gap-1 text-xs">
          <CircleCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
          <span>
            {result.replaced ? "Replaced for " : "Saved for "}
            {targetLabel(result.target)}
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
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Changing it clears the file picker once its files are uploaded.
  const [picker, setPicker] = useState(0)
  const [upload] = useUploadBarcodeMutation()

  const choose = (chosen: File[]) => {
    setFiles(chosen.filter(isPdf))
    setResults([])
  }
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
        message: errorMessage(error, "The barcode couldn't be uploaded. Try again."),
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
    setPicker((key) => key + 1)
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
  const uploadLabel = files.length > 1 ? `Upload ${files.length} files` : "Upload file"

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!running) {
          setOpen(next)
          if (!next) {
            setResults([])
            setFiles([])
          }
        }
      }}
    >
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <UploadCloud data-icon="inline-start" />
        Upload barcodes
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Upload barcodes</SheetTitle>
          <SheetDescription>Name each PDF after its SKU, such as ABC-123.pdf</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* The file input covers the whole zone, so a click opens the picker and dropped files land in it. */}
          <div
            className={cn(
              "relative flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors hover:bg-muted/50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              dragging && "border-ring bg-muted/50",
              running && "opacity-50"
            )}
          >
            <UploadCloud className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">
              {files.length
                ? `${files.length} ${files.length === 1 ? "PDF" : "PDFs"} chosen`
                : "Choose PDFs or drop them here"}
            </span>
            <span className="text-xs text-muted-foreground">Up to 32 MB each</span>
            <input
              key={picker}
              type="file"
              accept="application/pdf"
              multiple
              disabled={running}
              aria-label="Barcode PDFs"
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
              onDragEnter={() => setDragging(true)}
              onDragLeave={() => setDragging(false)}
              onDrop={() => setDragging(false)}
              onChange={(event) => choose([...(event.target.files ?? [])])}
            />
          </div>
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {running
                  ? `Uploading ${Math.min(done + 1, results.length)} of ${results.length}…`
                  : `${results.length - failed} of ${results.length} saved`}
              </p>
              <ul className="divide-y rounded-lg border" aria-label="Upload results">
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
            {running ? "Uploading…" : uploadLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
