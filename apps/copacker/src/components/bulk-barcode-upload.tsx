"use client"

import { CheckCircle2, UploadCloud } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
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
import type { BarcodeTarget } from "@/server/product-barcodes"
import { WarningNote } from "./common"
import { useUploadBarcodeMutation } from "./product-barcodes"
import * as styles from "./bulk-barcode-upload.css"

// One chosen file and what happened to it. A file whose SKU matched no single variation can be retried with a SKU.
type Result =
  | { status: "waiting" | "uploading"; file: File }
  | { status: "saved"; file: File; target: BarcodeTarget; replaced: boolean }
  | { status: "failed"; file: File; message: string; retry: boolean }

function targetLabel(target: BarcodeTarget) {
  const name = target.variant ? `${target.product}, ${target.variant}` : target.product
  return target.sku ? `${name} (${target.sku})` : name
}

function Retry({ result, onRetry }: { result: Extract<Result, { status: "failed" }>; onRetry: (sku: string) => void }) {
  const [sku, setSku] = useState("")
  const id = `retry-${result.file.name}`
  return (
    <form
      className={styles.retry}
      onSubmit={(event) => {
        event.preventDefault()
        if (sku.trim()) {
          onRetry(sku.trim())
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>SKU for {result.file.name}</FieldLabel>
        <Input id={id} value={sku} onChange={(event) => setSku(event.target.value)} autoComplete="off" />
      </Field>
      <Button type="submit" variant="outline" size="sm" disabled={!sku.trim()}>
        Save
      </Button>
    </form>
  )
}

function ResultRow({ result, onRetry }: { result: Result; onRetry: (sku: string) => void }) {
  return (
    <li className={styles.result}>
      <span className={styles.fileName}>{result.file.name}</span>
      {result.status === "waiting" && <span className={styles.detail}>Waiting</span>}
      {result.status === "uploading" && <span className={styles.detail}>Uploading…</span>}
      {result.status === "saved" && (
        <span className={styles.saved}>
          <CheckCircle2 aria-hidden="true" />
          <span>
            {result.replaced ? "Replaced the barcode for " : "Saved for "}
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
  // Changing it clears the file picker once its files are uploaded.
  const [picker, setPicker] = useState(0)
  const [upload] = useUploadBarcodeMutation()

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
      <SheetContent>
        <div className={styles.panel}>
          <SheetHeader>
            <SheetTitle>Upload barcodes</SheetTitle>
            <SheetDescription>
              Name each one-page PDF after its variation&apos;s SKU, such as ABC-123.pdf. A barcode replaces the
              variation&apos;s saved one. POs that already have a label keep theirs.
            </SheetDescription>
          </SheetHeader>
          <div className={styles.body}>
            <Field>
              <FieldLabel htmlFor="bulk-barcodes">Barcode PDFs</FieldLabel>
              <Input
                key={picker}
                id="bulk-barcodes"
                type="file"
                accept="application/pdf"
                multiple
                disabled={running}
                onChange={(event) => {
                  setFiles([...(event.target.files ?? [])])
                  setResults([])
                }}
              />
              <FieldDescription>
                {files.length
                  ? `${files.length} ${files.length === 1 ? "file" : "files"} chosen.`
                  : "Up to 32 MB each."}
              </FieldDescription>
            </Field>
            {results.length > 0 && (
              <>
                <p className={styles.detail} aria-live="polite">
                  {running
                    ? `Uploading ${Math.min(done + 1, results.length)} of ${results.length}…`
                    : `${results.length - failed} of ${results.length} saved.${failed ? " Check the files below." : ""}`}
                </p>
                <ul className={styles.results} aria-label="Upload results">
                  {results.map((result, index) => (
                    <ResultRow
                      key={`${result.file.name}-${index}`}
                      result={result}
                      onRetry={(sku) => void retry(index, sku)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
          <SheetFooter>
            <Button type="button" disabled={running || !files.length} onClick={() => void start()}>
              {running ? "Uploading…" : uploadLabel}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
