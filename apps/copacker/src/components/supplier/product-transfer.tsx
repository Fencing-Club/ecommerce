"use client"

import { Download, Ellipsis, FileSpreadsheet, Upload } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useCan } from "@/components/access"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

// The Products page's less common actions in one menu, like Shopify's More actions: import, export and the template.
export function ProductActions() {
  const [importing, setImporting] = useState(false)
  // Importing changes products; exporting only reads them, prices included.
  const editable = useCan("products", "edit")
  const prices = useCan("prices")
  const t = useTranslations("supplier.productTransfer")
  const shared = useTranslations("supplier.shared")
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={shared("moreActions")} />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {editable && (
            <>
              <DropdownMenuItem onClick={() => setImporting(true)}>
                <Upload />
                {t("importProducts")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {prices && (
            <>
              <DropdownMenuItem
                render={
                  <a href="/api/supplier-catalog/export?format=xlsx" download aria-label={shared("exportExcel")} />
                }
              >
                <Download />
                {shared("exportExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<a href="/api/supplier-catalog/export?format=csv" download aria-label={t("exportCsv")} />}
              >
                <Download />
                {t("exportCsv")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            render={<a href="/api/supplier-catalog/template?format=xlsx" download aria-label={t("downloadTemplate")} />}
          >
            <FileSpreadsheet />
            {t("downloadTemplate")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editable && <ProductImportDialog open={importing} onOpenChange={setImporting} />}
    </>
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
function ProductImportDialog({
  open,
  onOpenChange: setOpen
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const prices = useCan("prices")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const t = useTranslations("supplier.productTransfer")
  const shared = useTranslations("supplier.shared")
  const locale = useLocale()

  // Closing, however it's done, starts the next import afresh.
  function close() {
    setOpen(false)
    setFile(null)
    setPreview(null)
    setError("")
  }

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
        throw new Error(result.error ?? t("importFailed"))
      }
      if (mode === "preview") {
        setPreview(result)
        return
      }
      if (!result.imported) {
        throw new Error(t("alreadyImported"))
      }
      close()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("importFailed"))
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
          if (next) {
            setOpen(true)
          } else {
            close()
          }
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importProducts")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a href="/api/supplier-catalog/template?format=xlsx" download className="underline underline-offset-4">
              {t("excelTemplate")}
            </a>
            <a href="/api/supplier-catalog/template?format=csv" download className="underline underline-offset-4">
              {t("csvTemplate")}
            </a>
            {prices && (
              <a href="/api/supplier-catalog/export?format=xlsx" download className="underline underline-offset-4">
                {t("yourProducts")}
              </a>
            )}
          </div>
          <Input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label={t("productFile")}
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
                  { label: t("newVariants"), value: preview.variants.created },
                  { label: t("updatedVariants"), value: preview.variants.updated },
                  { label: t("unchangedVariants"), value: preview.variants.unchanged }
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md bg-muted/50 px-2 py-1.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString(locale)}</dd>
                  </div>
                ))}
              </dl>
              <ul className="flex flex-col gap-1">
                {preview.sample.map((row) => (
                  <li key={row.handle} className="flex items-center justify-between gap-2">
                    <span className="truncate">{row.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {shared("variantCount", { count: row.variants })}
                      {row.isNew && <Badge variant="secondary">{t("new")}</Badge>}
                    </span>
                  </li>
                ))}
                {preview.products > preview.sample.length && (
                  <li className="text-xs text-muted-foreground">
                    {t("moreProducts", { count: preview.products - preview.sample.length })}
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
          <Button variant="outline" disabled={pending} onClick={close}>
            {shared("cancel")}
          </Button>
          {preview ? (
            <Button disabled={pending || !changes} onClick={() => void send("commit")}>
              {changes ? t("importVariants", { count: changes }) : t("nothingToImport")}
            </Button>
          ) : (
            <Button disabled={pending || !file} onClick={() => void send("preview")}>
              {t("preview")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
