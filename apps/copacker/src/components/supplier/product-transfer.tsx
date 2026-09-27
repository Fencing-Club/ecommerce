"use client"

import { ChevronDown, Download, FileSpreadsheet, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

// Every product in the product template, as an Excel workbook or CSV.
export function ProductExportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download data-icon="inline-start" />
        Export
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          render={<a href="/api/supplier-catalog/export?format=xlsx" download aria-label="Export to Excel" />}
        >
          <FileSpreadsheet />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<a href="/api/supplier-catalog/export?format=csv" download aria-label="Export to CSV" />}
        >
          <FileSpreadsheet />
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type Preview = {
  products: number
  createdProducts: number
  variants: { created: number; updated: number; unchanged: number }
  sample: Array<{ handle: string; title: string; variants: number; isNew: boolean }>
  revisionHash: string
  fileHash: string
}

// Imports the product template, CSV or Excel: pick a file, check what it will change, then import.
export function ProductImportDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function send(mode: "preview" | "commit") {
    if (!file) {
      return
    }
    setPending(true)
    setError("")
    try {
      const body = new FormData()
      body.set("file", file)
      body.set("mode", mode)
      if (mode === "commit" && preview) {
        body.set("revisionHash", preview.revisionHash)
        body.set("fileHash", preview.fileHash)
      }
      const response = await fetch("/api/supplier-catalog/import", { method: "POST", body })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error ?? "Import failed. Try again.")
      }
      if (mode === "preview") {
        setPreview(result)
        return
      }
      if (!result.imported) {
        throw new Error("This file was already imported.")
      }
      setOpen(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed. Try again.")
    } finally {
      setPending(false)
    }
  }

  const changes = preview ? preview.variants.created + preview.variants.updated : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next)
          if (!next) {
            setFile(null)
            setPreview(null)
            setError("")
          }
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload data-icon="inline-start" />
        Import
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Use the product template: one row per variant. Matching SKUs are updated and new ones added. Products left
            out of the file don’t change.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href="/api/supplier-catalog/template?format=xlsx" download className="underline underline-offset-4">
              Excel template
            </a>
            <a href="/api/supplier-catalog/template?format=csv" download className="underline underline-offset-4">
              CSV template
            </a>
            <a href="/api/supplier-catalog/export?format=xlsx" download className="underline underline-offset-4">
              Your products in Excel
            </a>
          </div>
          <Input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Product file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setPreview(null)
              setError("")
            }}
          />
          {preview && (
            <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["New", preview.variants.created],
                  ["Updated", preview.variants.updated],
                  ["Unchanged", preview.variants.unchanged]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-muted/50 px-2 py-1.5">
                    <dt className="text-xs text-muted-foreground">{label} variants</dt>
                    <dd className="text-lg font-semibold tabular-nums">{Number(value).toLocaleString("en-US")}</dd>
                  </div>
                ))}
              </dl>
              <ul className="flex flex-col gap-1">
                {preview.sample.map((row) => (
                  <li key={row.handle} className="flex items-center justify-between gap-2">
                    <span className="truncate">{row.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {row.variants} variant{row.variants === 1 ? "" : "s"}
                      {row.isNew && <Badge variant="secondary">New</Badge>}
                    </span>
                  </li>
                ))}
                {preview.products > preview.sample.length && (
                  <li className="text-xs text-muted-foreground">
                    And {(preview.products - preview.sample.length).toLocaleString("en-US")} more products
                  </li>
                )}
              </ul>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {preview ? (
            <Button disabled={pending || !changes} onClick={() => void send("commit")}>
              {changes ? `Import ${changes.toLocaleString("en-US")} variants` : "Nothing to import"}
            </Button>
          ) : (
            <Button disabled={pending || !file} onClick={() => void send("preview")}>
              Preview
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
