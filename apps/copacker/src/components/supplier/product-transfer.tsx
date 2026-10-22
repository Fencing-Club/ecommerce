import { Download, Ellipsis, FileSpreadsheet, Upload } from "lucide-react"
import { parseAsBoolean, useQueryState } from "nuqs"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
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
import { useErrorMessage } from "@/hooks/use-error-text"
import { type ImportPreview, useImportProductsMutation, usePreviewProductImportMutation } from "@/lib/supplier-api"

// The Products page's less common actions in one menu, like Shopify's More actions: import, export and the template.
// `?import=true` opens the import, so the top bar's Create menu can link straight to it.
export function ProductActions({ onImported }: { onImported: () => void }) {
  const [importing, setImporting] = useQueryState("import", parseAsBoolean.withDefault(false))
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
              <DropdownMenuItem onClick={() => void setImporting(true)}>
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
      {editable && (
        <ProductImportDialog
          onImported={onImported}
          open={importing}
          onOpenChange={(open) => void setImporting(open)}
        />
      )}
    </>
  )
}

// Imports the product template, CSV or Excel: pick a file, check what it will change, then import.
function ProductImportDialog({
  open,
  onOpenChange: setOpen,
  onImported
}: {
  onImported: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const prices = useCan("prices")
  const [file, setFile] = useState<File | null>(null)
  const [previewImport, previewing] = usePreviewProductImportMutation()
  const [importProducts, importing] = useImportProductsMutation()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState("")
  const t = useTranslations("supplier.productTransfer")
  const shared = useTranslations("supplier.shared")
  const errorMessage = useErrorMessage()
  const locale = useLocale()
  const pending = previewing.isLoading || importing.isLoading

  // Closing, however it's done, starts the next import afresh.
  function close() {
    setOpen(false)
    setFile(null)
    setPreview(null)
    setError("")
  }

  // What the file would change, checked before anything is imported.
  async function check() {
    if (!file) {
      return
    }
    setError("")
    try {
      setPreview(await previewImport(file).unwrap())
    } catch (caught) {
      setError(errorMessage(caught, t("importFailed")))
    }
  }

  // Imports the previewed file, which its hashes guard against changes made since.
  async function commit() {
    if (!file || !preview) {
      return
    }
    setError("")
    try {
      const { imported } = await importProducts({
        file,
        revisionHash: preview.revisionHash,
        fileHash: preview.fileHash
      }).unwrap()
      if (!imported) {
        setError(t("alreadyImported"))
        return
      }
      close()
      onImported()
    } catch (caught) {
      setError(errorMessage(caught, t("importFailed")))
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
            <a href="/api/supplier-catalog/template?format=xlsx" download className="text-link">
              {t("excelTemplate")}
            </a>
            <a href="/api/supplier-catalog/template?format=csv" download className="text-link">
              {t("csvTemplate")}
            </a>
            {prices && (
              <a href="/api/supplier-catalog/export?format=xlsx" download className="text-link">
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
            <Button disabled={pending || !changes} onClick={() => void commit()}>
              {changes ? t("importVariants", { count: changes }) : t("nothingToImport")}
            </Button>
          ) : (
            <Button disabled={pending || !file} onClick={() => void check()}>
              {t("preview")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
