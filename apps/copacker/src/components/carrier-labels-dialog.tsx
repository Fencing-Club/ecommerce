import { Toast } from "@base-ui/react/toast"
import type { Packing } from "@repo/aisle"
import { useRouter } from "@tanstack/react-router"
import { useDropzone } from "@uploadcn/react"
import { ArrowDownToLine, Barcode, CircleAlert, LoaderCircle, Replace, Upload, X } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useSaveCarrierLabelsMutation } from "@/lib/api"
import { cartonGroupLabel, groupCartons } from "@/lib/carton-groups"
import { readPdfText } from "@/lib/pdf-preview"
import { readTrackingNumber, trackingNumberSchema } from "@/lib/tracking-numbers"
import { cn } from "@/lib/utils"
import { FieldError, useMeasure } from "./packing-fields"
import { scrollList } from "./spreadsheet-import-dialog"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

// A carton's carrier label as it's saved: the label document, its tracking number, and the file and page it came from.
export type SavedCarrierLabel = {
  cartonId: string
  documentId: string
  trackingNumber: string | null
  sourceName: string | null
  sourcePage: number | null
}
// What Save labels sends for each carton with a label: a page of one of the files sent with it, or the label it had.
export type CarrierLabelInput = { cartonId: string; trackingNumber: string } & (
  | { file: number; page: number }
  | { documentId: string }
)

type Label = {
  source: { file: File; page: number } | { documentId: string }
  name: string | null
  page: number | null
  trackingNumber: string
  // Whether the tracking number was read from the page. One that wasn't is typed in a field.
  read: boolean
}
// A row's label, what it's reading while PDFs dropped on it are read, and why the last ones added nothing.
type Row = { label: Label | null; reading?: string; problem?: string }
const byName = new Intl.Collator(undefined, { numeric: true })

// The shipment page's primary action while a carton lacks its carrier label: opens the dialog with the labels saved so
// far, and saves what it holds. Once every carton has one, saving sends the labels to the supplier.
export function UploadCarrierLabels({
  shipmentId,
  revision,
  ...dialog
}: {
  shipmentId: string
  revision: number
} & Pick<
  React.ComponentProps<typeof CarrierLabelsDialog>,
  "reference" | "shipmentName" | "cartons" | "saved" | "readPages"
>) {
  const t = useTranslations("shipments.carrierLabels")
  const router = useRouter()
  const toast = Toast.useToastManager()
  const errorMessage = useErrorMessage()
  const [saveLabels] = useSaveCarrierLabelsMutation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload data-icon="inline-start" />
        {t("upload")}
      </Button>
      <CarrierLabelsDialog
        {...dialog}
        open={open}
        onOpenChange={setOpen}
        onSave={async (labels, files) => {
          const body = new FormData()
          body.set("revision", String(revision))
          body.set("labels", JSON.stringify(labels))
          for (const file of files) {
            body.append("file", file)
          }
          try {
            const { sent } = await saveLabels({ id: shipmentId, body }).unwrap()
            toast.add({ title: sent ? t("sent") : t("saved") })
          } catch (e) {
            throw new Error(errorMessage(e, t("failed")))
          }
          await router.invalidate()
        }}
      />
    </>
  )
}

// The buyer's carrier label for each carton, from the PDFs their own carrier gave them (10.06 to 10.10). Each carton is
// a drop target, grouped by carton configuration like the cartons table. Several labels dropped at once, as separate
// PDFs or the pages of one, fill the cartons in order from the one they're dropped on; a label's tracking number is read
// from its page, or typed when it can't be.
// Nothing is saved until Save labels, which keeps whatever is there.
export function CarrierLabelsDialog({
  open,
  onOpenChange,
  reference,
  shipmentName,
  cartons,
  saved,
  readPages = readPdfText,
  onSave
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The order and shipment, shown under the title.
  reference: string
  shipmentName: string
  cartons: Packing["cartons"]
  saved: SavedCarrierLabel[]
  // Each page's text, to count a PDF's labels and read their tracking numbers.
  readPages?: (file: File) => Promise<string[]>
  onSave: (labels: CarrierLabelInput[], files: File[]) => Promise<void>
}) {
  const t = useTranslations("shipments.carrierLabels")
  // Focus starts on the title, not on the first carton's Remove.
  const title = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={title}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 p-5 sm:max-w-3xl sm:p-6"
      >
        <DialogHeader>
          <DialogTitle ref={title} tabIndex={-1} className="outline-none">
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {reference} / {shipmentName}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted while open, so each opening starts from the saved labels. */}
        <CarrierLabelsForm
          cartons={cartons}
          saved={saved}
          readPages={readPages}
          onSave={onSave}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function CarrierLabelsForm({
  cartons,
  saved,
  readPages,
  onSave,
  onClose
}: {
  cartons: Packing["cartons"]
  saved: SavedCarrierLabel[]
  readPages: (file: File) => Promise<string[]>
  onSave: (labels: CarrierLabelInput[], files: File[]) => Promise<void>
  onClose: () => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const measure = useMeasure()
  const id = useId()
  const cartonIds = cartons.map((carton) => carton.cartonId)
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      cartonIds.map((cartonId) => {
        const label = saved.find((entry) => entry.cartonId === cartonId)
        return [
          cartonId,
          {
            label: label
              ? {
                  source: { documentId: label.documentId },
                  name: label.sourceName,
                  page: label.sourcePage,
                  trackingNumber: label.trackingNumber ?? "",
                  read: !!label.trackingNumber
                }
              : null
          }
        ]
      })
    )
  )
  // Why a PDF dropped on a carton added nothing, shown above the cartons.
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const update = (cartonId: string, row: Partial<Row>) =>
    setRows((current) => ({ ...current, [cartonId]: { ...current[cartonId]!, ...row } }))

  // Carriers give one PDF per label or one with a page per label, so several PDFs can be dropped at once. They're taken
  // in name order, which keeps numbered files in their numbers' order.
  async function drop(index: number, dropped: File[]) {
    const cartonId = cartonIds[index]!
    setError("")
    const files = dropped.toSorted((a, b) => byName.compare(a.name, b.name))
    const notPdf = files.find((file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    if (!files.length || notPdf) {
      update(cartonId, { problem: t("notPdf", { name: notPdf?.name ?? "" }) })
      return
    }
    update(cartonId, { reading: t("reading", { files: files.length, name: files[0]!.name }), problem: undefined })
    const labels: Array<{ file: File; page: number; text: string; only: boolean }> = []
    for (const file of files) {
      try {
        const pages = await readPages(file)
        labels.push(...pages.map((text, page) => ({ file, page: page + 1, text, only: pages.length === 1 })))
      } catch {
        update(cartonId, { reading: undefined, problem: t("unreadable", { name: file.name }) })
        return
      }
    }
    const left = cartonIds.length - index
    if (!labels.length || labels.length > left) {
      update(cartonId, { reading: undefined })
      setError(t("tooManyLabels", { labels: labels.length, cartons: left, carton: cartonId }))
      return
    }
    setRows((current) => {
      const next = { ...current }
      labels.forEach(({ file, page, text, only }, offset) => {
        const trackingNumber = readTrackingNumber(text)
        next[cartonIds[index + offset]!] = {
          label: {
            source: { file, page },
            name: file.name,
            // A file of one label has no page to name.
            page: only ? null : page,
            trackingNumber: trackingNumber ?? "",
            read: !!trackingNumber
          }
        }
      })
      return next
    })
  }

  const labelled = cartonIds.flatMap((cartonId) => {
    const label = rows[cartonId]?.label
    return label ? [{ cartonId, label }] : []
  })
  const reading = cartonIds.some((cartonId) => rows[cartonId]?.reading)
  const valid = (value: string) => trackingNumberSchema.safeParse(value).success

  async function save() {
    setSubmitted(true)
    const missing = labelled.find(({ label }) => !valid(label.trackingNumber))
    if (missing) {
      document.getElementById(`${id}-${missing.cartonId}-tracking`)?.focus()
      return
    }
    const files = [...new Set(labelled.flatMap(({ label }) => ("file" in label.source ? [label.source.file] : [])))]
    const labels = labelled.map(({ cartonId, label }): CarrierLabelInput => {
      const trackingNumber = trackingNumberSchema.parse(label.trackingNumber)
      return "file" in label.source
        ? { cartonId, trackingNumber, file: files.indexOf(label.source.file), page: label.source.page }
        : { cartonId, trackingNumber, documentId: label.source.documentId }
    })
    setSaving(true)
    setFailure("")
    try {
      await onSave(labels, files)
      onClose()
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : t("failed"))
    } finally {
      setSaving(false)
    }
  }

  // Each carton configuration's cartons, and where they start among all of them.
  const groups: Array<{ ids: string[]; first: number; group: ReturnType<typeof groupCartons>[number] }> = []
  for (const group of groupCartons(cartons)) {
    const first = groups.reduce((sum, entry) => sum + entry.ids.length, 0)
    groups.push({ ids: cartonIds.slice(first, first + group.count), first, group })
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {error && (
        <p
          role="alert"
          className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {/* The cartons scroll inside the dialog, keeping the title and buttons in view. */}
      <div className={cn("min-h-0 flex-1 rounded-lg border", scrollList)}>
        {groups.map(({ ids, first, group }) => (
          <section key={ids[0]} aria-labelledby={`${id}-group-${ids[0]}`} className="not-first:border-t">
            <h3
              id={`${id}-group-${ids[0]}`}
              className="flex flex-wrap items-baseline gap-x-2 border-b bg-muted/50 px-3 py-2 text-xs sm:px-4"
            >
              <span className="font-semibold">{cartonGroupLabel(ids.map((cartonId) => ({ id: cartonId })))}</span>
              <span className="text-muted-foreground">
                {measure.dimensions(group)}, {measure.weight(group.weight)}
              </span>
            </h3>
            <ul className="divide-y">
              {ids.map((cartonId, offset) => (
                <CartonTarget
                  key={cartonId}
                  id={`${id}-${cartonId}`}
                  cartonId={cartonId}
                  row={rows[cartonId]!}
                  disabled={saving}
                  submitted={submitted}
                  onDrop={(files) => void drop(first + offset, files)}
                  onRemove={() => update(cartonId, { label: null, problem: undefined })}
                  onTrackingChange={(trackingNumber) =>
                    setRows((current) => {
                      const label = current[cartonId]!.label!
                      return { ...current, [cartonId]: { ...current[cartonId]!, label: { ...label, trackingNumber } } }
                    })
                  }
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {failure && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {failure}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p
          aria-live="polite"
          className={cn(
            "flex-1 text-sm",
            labelled.length === cartonIds.length ? "font-medium text-success" : "text-muted-foreground"
          )}
        >
          {labelled.length === cartonIds.length
            ? t("complete")
            : t("progress", { count: labelled.length, total: cartonIds.length })}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="button" disabled={saving || reading || !labelled.length} onClick={() => void save()}>
            {saving && <LoaderCircle aria-hidden className="animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </div>
    </>
  )
}

// One carton's drop target: empty, reading a file, or showing its label with the label's tracking number.
function CartonTarget({
  id,
  cartonId,
  row,
  disabled,
  submitted,
  onDrop,
  onRemove,
  onTrackingChange
}: {
  id: string
  cartonId: string
  row: Row
  disabled: boolean
  submitted: boolean
  onDrop: (files: File[]) => void
  onRemove: () => void
  onTrackingChange: (value: string) => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const input = useRef<HTMLInputElement>(null)
  const { handlers, isDragging } = useDropzone({ onDrop, multiple: true, disabled: disabled || !!row.reading })
  const { label, reading, problem } = row
  const browse = (chunks: React.ReactNode) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={t("browseFor", { carton: cartonId })}
      onClick={() => input.current?.click()}
      className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {chunks}
    </button>
  )
  const tracking = label?.trackingNumber ?? ""
  // A number that wasn't read from the page is asked for, and checked once Save is tried.
  let trackingError = ""
  if (label && !label.read && !tracking.trim()) {
    trackingError = t("trackingNotRead")
  } else if (label && !label.read && submitted && !trackingNumberSchema.safeParse(tracking).success) {
    trackingError = t("trackingInvalid")
  }
  const target = "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors"
  function content() {
    if (isDragging) {
      return (
        <div className={cn(target, "border-primary bg-primary/5 font-medium text-primary")}>
          {label ? <Replace aria-hidden className="size-4" /> : <ArrowDownToLine aria-hidden className="size-4" />}
          {label ? t("dropToReplace", { carton: cartonId }) : t("dropToAdd", { carton: cartonId })}
        </div>
      )
    }
    if (reading) {
      return (
        <output className={cn(target, "bg-muted/50 text-muted-foreground")}>
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {reading}
        </output>
      )
    }
    if (label) {
      return (
        <div className={cn(target, "bg-background")}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border">
            <Barcode aria-hidden className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium break-words">
              {label.name && label.page
                ? t("source", { name: label.name, page: label.page })
                : (label.name ?? t("savedLabel"))}
            </span>
            {label.read && (
              <span className="font-mono text-xs text-muted-foreground">
                {t("tracking", { number: label.trackingNumber })}
              </span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={t("remove", { carton: cartonId })}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      )
    }
    if (problem) {
      return (
        <div className={cn(target, "border-destructive/40 bg-destructive/5 text-destructive")}>
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          <span>
            {problem} {t.rich("tryAgain", { browse })}
          </span>
        </div>
      )
    }
    return (
      <div className={cn(target, "bg-muted/50 text-muted-foreground")}>
        <Upload aria-hidden className="size-4 shrink-0" />
        <span>{t.rich("prompt", { browse })}</span>
      </div>
    )
  }
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
      <span className="w-8 shrink-0 pt-3 text-sm font-semibold">{cartonId}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(event) => {
            onDrop(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ""
          }}
        />
        <div {...handlers} data-dragging={isDragging || undefined}>
          {content()}
        </div>
        {label && problem && <FieldError>{problem}</FieldError>}
        {label && !label.read && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-tracking`}>{t("trackingNumber")}</Label>
            <Input
              id={`${id}-tracking`}
              value={tracking}
              disabled={disabled}
              aria-invalid={!!trackingError || undefined}
              aria-describedby={trackingError ? `${id}-tracking-error` : undefined}
              placeholder="1Z 999 AA1 01 2345 6784"
              autoComplete="off"
              spellCheck={false}
              className="font-mono sm:max-w-xs"
              onChange={(event) => onTrackingChange(event.currentTarget.value)}
            />
            {trackingError && <FieldError id={`${id}-tracking-error`}>{trackingError}</FieldError>}
          </div>
        )}
      </div>
    </li>
  )
}
