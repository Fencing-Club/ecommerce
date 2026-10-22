import { Toast } from "@base-ui/react/toast"
import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core"
import type { Packing } from "@repo/copacker-shipments"
import { cartonGroupLabel } from "@repo/copacker-shipments/shipping-model"
import { useRouter } from "@tanstack/react-router"
import {
  ArrowDownToLine,
  ArrowLeft,
  Barcode,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileUp,
  GripVertical,
  Info,
  ListOrdered,
  LoaderCircle,
  TriangleAlert,
  Upload,
  X
} from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import { getTracking } from "ts-tracking-number"
import { useTranslations } from "use-intl"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useSaveCarrierLabelsMutation } from "@/lib/api"
import { type CartonGroup, groupCartons } from "@/lib/carton-groups"
import { fitsConfiguration, type LabelMeasurements, readLabelMeasurements } from "@/lib/label-measurements"
import { readPictureText } from "@/lib/label-text"
import { preloadPdfReading, readPdfPages, type TextLine } from "@/lib/pdf-preview"
import { readTrackingFromBarcodes, readTrackingNumber, trackingNumberSchema } from "@/lib/tracking-numbers"
import { cn } from "@/lib/utils"
import { SelectControl } from "./form-select"
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
// A page of a carrier's PDF as the dialog reads it: its text, to find the tracking number, weight and size, where that
// text is printed, a picture of it, and the values of its barcodes when its text has no tracking number.
export type CarrierLabelPage = { text: string; lines?: TextLine[]; image?: string; barcodes?: string[] }
// The text on a page that's only a picture, read when its preview first opens.
export type ReadPictureText = (file: File, page: number) => Promise<{ text: string; lines: TextLine[] }>

// Each page of a PDF, with its barcodes read when its text gives no tracking number, as on UPS labels that are
// pictures.
export const readLabelPages = (file: File) => readPdfPages(file, undefined, (text) => !readTrackingNumber(text))

type CarrierLabel = {
  id: string
  source: { file: File; page: number } | { documentId: string }
  name: string | null
  // The page it came from, unless its file had only this one.
  page: number | null
  image?: string
  trackingNumber: string
  // Whether the tracking number was read from the page. One that wasn't is typed in a field.
  read: boolean
  // The weight and size the page prints, which place the label on its carton configuration when they fit only one.
  measured: LabelMeasurements
  // Where the page's text is printed, to select and copy it from the preview's picture.
  lines: TextLine[]
  // A page with no text of its own is a picture, whose text is read when its preview first opens.
  picture?: "unread" | "reading" | "read" | "unreadable"
}
// A carton configuration and its cartons' IDs.
type Configuration = { ids: string[]; group: CartonGroup }

// The shipment's carton configurations, each with its own cartons.
function configurations(cartons: Packing["cartons"]) {
  const cartonIds = cartons.map((carton) => carton.cartonId)
  const found: Configuration[] = []
  for (const group of groupCartons(cartons)) {
    const first = found.reduce((sum, entry) => sum + entry.ids.length, 0)
    found.push({ ids: cartonIds.slice(first, first + group.count), group })
  }
  return found
}

// Puts each label whose weight and size fit exactly one carton configuration on that configuration's first empty
// carton, in order. The rest stay in Not placed.
function placeByMeasurements(placed: Record<string, string>, labels: CarrierLabel[], groups: Configuration[]) {
  const next = { ...placed }
  for (const label of labels) {
    const fitting = groups.filter(({ group }) => fitsConfiguration(label.measured, group))
    const free = fitting.length === 1 ? fitting[0]?.ids.find((cartonId) => !next[cartonId]) : undefined
    if (free) {
      next[free] = label.id
    }
  }
  return next
}
const byName = new Intl.Collator(undefined, { numeric: true })
const isPdf = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
const valid = (value: string) => trackingNumberSchema.safeParse(value).success
// A label whose tracking number couldn't be read and hasn't been typed yet stands out until it has one.
const needsTracking = (label: CarrierLabel) => !label.read && !valid(label.trackingNumber)

// The carrier a tracking number belongs to, known from its format and check digit.
function carrierOf(trackingNumber: string) {
  const found = trackingNumber ? getTracking(trackingNumber.replace(/\s+/g, "").toUpperCase()) : undefined
  if (!found || found.courier.code === "s10") {
    return null
  }
  return found.courier.code === "usps" ? "USPS" : found.courier.name
}

// A drop target for PDFs dragged in from the computer, lit with how many there are. It stays lit while the drag
// crosses its children, and goes out when the drag leaves it, or ends or drops anywhere else.
function useFileDrop(enabled: boolean, onDrop: (files: File[]) => void) {
  const [over, setOver] = useState<number | null>(null)
  useEffect(() => {
    if (over === null) {
      return
    }
    const clear = () => setOver(null)
    window.addEventListener("dragend", clear)
    window.addEventListener("drop", clear)
    return () => {
      window.removeEventListener("dragend", clear)
      window.removeEventListener("drop", clear)
    }
  }, [over])
  const files = (event: React.DragEvent) => enabled && event.dataTransfer.types.includes("Files")
  const enter = (event: React.DragEvent) => {
    if (files(event)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
      const count = event.dataTransfer.items.length
      setOver((current) => current ?? count)
    }
  }
  return {
    over,
    handlers: {
      onDragEnter: enter,
      onDragOver: enter,
      onDragLeave: (event: React.DragEvent) => {
        const to = event.relatedTarget
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) {
          setOver(null)
        }
      },
      onDrop: (event: React.DragEvent) => {
        setOver(null)
        if (files(event)) {
          event.preventDefault()
          onDrop(Array.from(event.dataTransfer.files))
        }
      }
    }
  }
}

// Labels are dragged with the pointer rather than the browser's drag and drop, so the card itself moves with it. A
// drag starts once the pointer has moved a little, or after a short press on a touch screen, so clicks and scrolling
// still work.
const notPlacedId = "not-placed"
// The drop target under the pointer, found from the page as it is now, so the carton list can scroll during a drag.
const underPointer: CollisionDetection = ({ droppableContainers, pointerCoordinates }) => {
  if (!pointerCoordinates) {
    return []
  }
  const under = document.elementsFromPoint(pointerCoordinates.x, pointerCoordinates.y)
  const found = droppableContainers.find(
    (container) => container.node.current && under.includes(container.node.current)
  )
  return found ? [{ id: found.id }] : []
}
// Nothing is announced for a drag: the Carton field in a label's preview places it without one, and the cartons' count
// is announced as it changes.
const quiet = {
  announcements: {
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined
  },
  screenReaderInstructions: { draggable: "" }
}
// A list scrolls while a label is held near its top or bottom edge, so a carton out of sight can be reached.
function useEdgeScroll(list: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) {
      return
    }
    let pointer: { x: number; y: number } | null = null
    let frame = 0
    const move = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
    }
    const step = () => {
      const element = list.current
      if (element && pointer) {
        const rect = element.getBoundingClientRect()
        const edge = Math.min(48, rect.height / 4)
        if (pointer.x >= rect.left && pointer.x <= rect.right) {
          if (pointer.y < rect.top + edge) {
            element.scrollTop -= Math.min(20, Math.ceil((rect.top + edge - pointer.y) / 3))
          } else if (pointer.y > rect.bottom - edge) {
            element.scrollTop += Math.min(20, Math.ceil((pointer.y - rect.bottom + edge) / 3))
          }
        }
      }
      frame = requestAnimationFrame(step)
    }
    window.addEventListener("pointermove", move)
    frame = requestAnimationFrame(step)
    return () => {
      window.removeEventListener("pointermove", move)
      cancelAnimationFrame(frame)
    }
  }, [list, active])
}

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
  "reference" | "shipmentName" | "cartons" | "saved" | "readPages" | "readPicture"
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

// The buyer's carrier labels from the PDFs their own carrier gave them (10.11 to 10.13). PDFs dropped on Not placed are
// split into labels that wait there until they're on a carton: dragged onto one, put on the empty cartons in order, or
// given a carton in the preview. A label's tracking number is read from its page, or typed when it can't be. Nothing is
// saved until Save labels, which keeps the labels that are on cartons.
export function CarrierLabelsDialog({
  open,
  onOpenChange,
  reference,
  shipmentName,
  cartons,
  saved,
  readPages = readLabelPages,
  readPicture = readPictureText,
  onSave
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The order and shipment, shown under the title.
  reference: string
  shipmentName: string
  cartons: Packing["cartons"]
  saved: SavedCarrierLabel[]
  // Each page of a PDF, to split it into labels, show them and read their tracking numbers.
  readPages?: (file: File) => Promise<CarrierLabelPage[]>
  readPicture?: ReadPictureText
  onSave: (labels: CarrierLabelInput[], files: File[]) => Promise<void>
}) {
  const t = useTranslations("shipments.carrierLabels")
  // Focus starts on the title, not on the first control.
  const title = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={title}
        className="flex h-[calc(100dvh-2rem)] flex-col gap-4 p-5 sm:h-[min(54rem,calc(100dvh-4rem))] sm:max-w-[min(72rem,calc(100%-2rem))] sm:p-6"
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
          readPicture={readPicture}
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
  readPicture,
  onSave,
  onClose
}: {
  cartons: Packing["cartons"]
  saved: SavedCarrierLabel[]
  readPages: (file: File) => Promise<CarrierLabelPage[]>
  readPicture: ReadPictureText
  onSave: (labels: CarrierLabelInput[], files: File[]) => Promise<void>
  onClose: () => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const measure = useMeasure()
  const id = useId()
  const cartonIds = cartons.map((carton) => carton.cartonId)
  const groups = configurations(cartons)
  const kept = saved.filter((label) => cartonIds.includes(label.cartonId))
  const [labels, setLabels] = useState<CarrierLabel[]>(() =>
    kept.map((label) => ({
      id: label.documentId,
      source: { documentId: label.documentId },
      name: label.sourceName,
      page: label.sourcePage,
      trackingNumber: label.trackingNumber ?? "",
      read: !!label.trackingNumber,
      measured: {},
      lines: []
    }))
  )
  // Each carton's label, by carton ID.
  const [placed, setPlaced] = useState<Record<string, string>>(() =>
    Object.fromEntries(kept.map((label) => [label.cartonId, label.documentId]))
  )
  // The browser's PDF and barcode readers start loading as the dialog opens, so the first PDF dropped doesn't wait for
  // them. Tesseract waits for a picture's preview.
  useEffect(() => {
    if (readPages === readLabelPages) {
      preloadPdfReading()
    }
  }, [readPages])
  const [reading, setReading] = useState("")
  // Why a dropped file added no labels.
  const [error, setError] = useState("")
  // Labels a dropped file had that were already here.
  const [notice, setNotice] = useState("")
  // The label being dragged, which a carton or Not placed names when it's held over them.
  const [dragging, setDragging] = useState<string | null>(null)
  // The dragged label leaves its place a frame after the drag starts, once dnd-kit has measured it for the card that
  // follows the pointer: hidden sooner, it would measure as nothing.
  const [lifted, setLifted] = useState<string | null>(null)
  useEffect(() => {
    if (!dragging) {
      return
    }
    const frame = requestAnimationFrame(() => setLifted(dragging))
    return () => cancelAnimationFrame(frame)
  }, [dragging])
  const endDrag = () => {
    setDragging(null)
    setLifted(null)
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState("")
  const [submitted, setSubmitted] = useState(false)
  // Leaves the preview for the lists, and focuses a control there once they've rendered.
  const showLists = (focus: string) => {
    flushSync(() => setPreview(null))
    document.getElementById(focus)?.focus()
  }
  // Opens a label's preview. A picture's text is read the first time, which gives what the page didn't: its tracking
  // number when it has none yet, its weight and size, and text to copy.
  const openPreview = (labelId: string) => {
    setPreview(labelId)
    readPictureOf(labelId)
  }
  const addTracking = (labelId: string) => {
    flushSync(() => setPreview(labelId))
    document.getElementById(`${id}-${labelId}-tracking`)?.focus()
    readPictureOf(labelId)
  }
  const change = (labelId: string, changed: (label: CarrierLabel) => Partial<CarrierLabel>) =>
    setLabels((current) => current.map((label) => (label.id === labelId ? { ...label, ...changed(label) } : label)))
  function readPictureOf(labelId: string) {
    const label = labels.find((each) => each.id === labelId)
    if (label?.picture !== "unread" || !("file" in label.source)) {
      return
    }
    change(labelId, () => ({ picture: "reading" }))
    readPicture(label.source.file, label.source.page).then(
      ({ text, lines }) =>
        change(labelId, (current) => ({
          picture: "read",
          lines,
          trackingNumber: current.trackingNumber || (readTrackingNumber(text) ?? ""),
          measured: { ...readLabelMeasurements(text), ...current.measured }
        })),
      () => change(labelId, () => ({ picture: "unreadable" }))
    )
  }

  const byId = new Map(labels.map((label) => [label.id, label]))
  const cartonOf = new Map(Object.entries(placed).map(([cartonId, labelId]) => [labelId, cartonId]))
  const notPlaced = labels.filter((label) => !cartonOf.has(label.id))
  const onCartons = cartonIds.flatMap((cartonId) => {
    const label = byId.get(placed[cartonId] ?? "")
    return label ? [{ cartonId, label }] : []
  })
  const name = (label: CarrierLabel) =>
    label.name && label.page ? t("source", { name: label.name, page: label.page }) : (label.name ?? t("savedLabel"))
  // What a label is known by: its tracking number, or its file and page until the number is typed.
  const title = (label: CarrierLabel) => (label.read ? label.trackingNumber : name(label))
  // The weight and dimensions a label prints, written as the cartons' are, or nothing when it doesn't print them.
  const printedWeight = ({ measured: { weight } }: CarrierLabel) =>
    weight === undefined ? "" : measure.weight(Math.round(weight * 10) / 10)
  const printedDimensions = ({ measured: { dimensions } }: CarrierLabel) =>
    dimensions
      ? measure.dimensions({
          length: Math.round(dimensions[0]),
          width: Math.round(dimensions[1]),
          height: Math.round(dimensions[2])
        })
      : ""
  const measurements = (label: CarrierLabel) =>
    [printedDimensions(label), printedWeight(label)].filter(Boolean).join(", ")
  const fieldId = (label: CarrierLabel) => `${id}-${label.id}-tracking`
  const previewId = (label: CarrierLabel) => `${id}-${label.id}-preview`

  async function add(dropped: File[]) {
    setError("")
    setNotice("")
    const files = dropped.toSorted((a, b) => byName.compare(a.name, b.name))
    const notPdf = files.find((file) => !isPdf(file))
    if (notPdf) {
      setError(t("notPdf", { name: notPdf.name }))
      return
    }
    if (!files.length) {
      return
    }
    setReading(t("reading", { files: files.length, name: files[0]!.name }))
    const added: CarrierLabel[] = []
    // A page whose tracking number is already here is a label added before, and is left out.
    const tracked = new Set(labels.flatMap((label) => (label.trackingNumber ? [label.trackingNumber] : [])))
    let repeated = 0
    for (const file of files) {
      let pages: CarrierLabelPage[]
      try {
        pages = await readPages(file)
      } catch {
        setError(t("unreadable", { name: file.name }))
        continue
      }
      pages.forEach((page, index) => {
        const trackingNumber = readTrackingNumber(page.text) ?? readTrackingFromBarcodes(page.barcodes ?? [])
        if (trackingNumber && tracked.has(trackingNumber)) {
          repeated += 1
          return
        }
        if (trackingNumber) {
          tracked.add(trackingNumber)
        }
        added.push({
          measured: readLabelMeasurements(page.text),
          id: crypto.randomUUID(),
          source: { file, page: index + 1 },
          name: file.name,
          page: pages.length > 1 ? index + 1 : null,
          image: page.image,
          trackingNumber: trackingNumber ?? "",
          read: !!trackingNumber,
          lines: page.lines ?? [],
          picture: page.text.trim() ? undefined : "unread"
        })
      })
    }
    setReading("")
    if (repeated) {
      setNotice(t("alreadyAdded", { labels: repeated }))
    }
    setLabels((current) => [...current, ...added])
    setPlaced((current) =>
      placeByMeasurements(
        current,
        added.filter((label) => !needsTracking(label)),
        groups
      )
    )
  }
  // The label that last went back to Not placed, which opens a gap for itself there.
  const [returned, setReturned] = useState<string | null>(null)
  // Puts a label on a carton, or takes it off with null. A label the carton had goes back to Not placed.
  const place = (labelId: string, cartonId: string | null) => {
    setReturned(cartonId ? (placed[cartonId] ?? null) : labelId)
    setPlaced((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([, labelOn]) => labelOn !== labelId))
      if (cartonId) {
        next[cartonId] = labelId
      }
      return next
    })
  }
  // Every label in Not placed onto the empty cartons, in order. A label without a tracking number waits for one, here
  // as everywhere a label goes on a carton.
  const fill = () =>
    setPlaced((current) => {
      const next = { ...current }
      const used = new Set(Object.values(next))
      const waiting = labels.filter((label) => !used.has(label.id) && !needsTracking(label))
      for (const cartonId of cartonIds) {
        const label = next[cartonId] ? undefined : waiting.shift()
        if (label) {
          next[cartonId] = label.id
        }
      }
      return next
    })
  const setTracking = (labelId: string, trackingNumber: string) => change(labelId, () => ({ trackingNumber }))

  async function save() {
    setSubmitted(true)
    const missing = onCartons.find(({ label }) => !valid(label.trackingNumber))
    if (missing) {
      addTracking(missing.label.id)
      return
    }
    const files = [...new Set(onCartons.flatMap(({ label }) => ("file" in label.source ? [label.source.file] : [])))]
    const inputs = onCartons.map(({ cartonId, label }): CarrierLabelInput => {
      const trackingNumber = trackingNumberSchema.parse(label.trackingNumber)
      return "file" in label.source
        ? { cartonId, trackingNumber, file: files.indexOf(label.source.file), page: label.source.page }
        : { cartonId, trackingNumber, documentId: label.source.documentId }
    })
    setSaving(true)
    setFailure("")
    try {
      await onSave(inputs, files)
      onClose()
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : t("failed"))
    } finally {
      setSaving(false)
    }
  }

  const row = {
    disabled: saving,
    submitted,
    name,
    title,
    measurements,
    printedWeight,
    printedDimensions,
    fieldId,
    previewId,
    dragging: dragging ? (byId.get(dragging) ?? null) : null,
    lifted,
    onPreview: openPreview,
    onAddTracking: addTracking,
    onTracking: setTracking
  }
  const shown = preview ? byId.get(preview) : undefined
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {shown ? (
        <LabelPreview
          {...row}
          label={shown}
          // The arrows step through the list the label is in.
          list={(cartonOf.has(shown.id) ? onCartons.map(({ label }) => label) : notPlaced).map((label) => label.id)}
          cartonId={cartonOf.get(shown.id) ?? null}
          cartonIds={cartonIds}
          taken={new Set(Object.keys(placed))}
          onCarton={(cartonId) => place(shown.id, cartonId)}
          onBack={() => showLists(previewId(shown))}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={underPointer}
          autoScroll={false}
          accessibility={quiet}
          onDragStart={({ active }) => {
            setLifted(null)
            setDragging(String(active.id))
          }}
          onDragCancel={endDrag}
          onDragEnd={({ active, over }) => {
            endDrag()
            if (over) {
              place(String(active.id), over.id === notPlacedId ? null : String(over.id))
            }
          }}
        >
          <div className="grid min-h-0 flex-1 gap-4 max-md:overflow-y-auto md:grid-cols-2">
            <NotPlaced
              {...row}
              labels={notPlaced}
              returned={returned}
              files={new Set(labels.flatMap((label) => ("file" in label.source ? [label.source.file] : []))).size}
              reading={reading}
              canFill={notPlaced.some((label) => !needsTracking(label)) && onCartons.length < cartonIds.length}
              onAdd={(files) => void add(files)}
              onFill={fill}
            />
            <Cartons
              {...row}
              cartons={cartons}
              placed={(cartonId) => byId.get(placed[cartonId] ?? "")}
              count={onCartons.length}
              onPlace={place}
            />
          </div>
          {/* Over the page rather than in the dialog, whose transform would shift it from the pointer. */}
          {createPortal(
            <DragOverlay dropAnimation={null} className="pointer-events-none">
              {row.dragging && <DragCard {...row} label={row.dragging} />}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      )}
      {/* What went wrong with a drop or a save, and labels a drop skipped, go above the buttons. */}
      {error && <Problem>{error}</Problem>}
      {failure && <Problem>{failure}</Problem>}
      {notice && (
        <output className="flex gap-2 text-sm text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {notice}
        </output>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          disabled={saving || !!reading || (!onCartons.length && !kept.length)}
          onClick={() => void save()}
        >
          {saving && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex gap-2 text-sm text-destructive">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

// What every label row needs from the form.
type RowProps = {
  disabled: boolean
  submitted: boolean
  name: (label: CarrierLabel) => string
  title: (label: CarrierLabel) => string
  // The weight and size a label prints, written as the cartons' are, or nothing when it prints neither.
  measurements: (label: CarrierLabel) => string
  printedWeight: (label: CarrierLabel) => string
  printedDimensions: (label: CarrierLabel) => string
  fieldId: (label: CarrierLabel) => string
  previewId: (label: CarrierLabel) => string
  dragging: CarrierLabel | null
  // The dragged label once it's out of its place, which hides it there until the drag ends.
  lifted: string | null
  onPreview: (labelId: string) => void
  // Opens a label's preview at its tracking number field, to type the number from its picture.
  onAddTracking: (labelId: string) => void
  onTracking: (labelId: string, trackingNumber: string) => void
}

// Where PDFs go, and where labels wait until they're on a carton. Dropping PDFs anywhere on it adds their pages, and
// dropping a carton's label on it takes the label off.
function NotPlaced({
  labels,
  returned,
  files,
  reading,
  canFill,
  onAdd,
  onFill,
  ...row
}: RowProps & {
  labels: CarrierLabel[]
  returned: string | null
  files: number
  reading: string
  canFill: boolean
  onAdd: (files: File[]) => void
  onFill: () => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const heading = useId()
  const input = useRef<HTMLInputElement>(null)
  const fileDrop = useFileDrop(!row.disabled, onAdd)
  // Takes labels from cartons: a label already here has nowhere to go.
  const { setNodeRef, isOver } = useDroppable({
    id: notPlacedId,
    disabled: row.disabled || !row.dragging || labels.some((label) => label.id === row.dragging?.id)
  })
  const browse = (chunks: React.ReactNode) => (
    <button
      type="button"
      disabled={row.disabled}
      onClick={() => input.current?.click()}
      className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {chunks}
    </button>
  )
  // What dropping here does, over the list, which stays as it is underneath so the drag doesn't lose its place.
  function overlay() {
    let message: React.ReactNode = null
    if (fileDrop.over !== null) {
      message = (
        <>
          <p className="font-medium">{t("dropFiles", { count: fileDrop.over })}</p>
          <p className="text-xs">{t("dropFilesNote")}</p>
        </>
      )
    } else if (isOver && row.dragging) {
      message = <p className="font-medium">{t("dropToTakeOff", { name: row.title(row.dragging) })}</p>
    }
    return (
      message && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/95 p-6 text-center text-primary">
          <ArrowDownToLine aria-hidden className="size-5" />
          {message}
        </div>
      )
    )
  }
  // With no labels waiting, before any PDF or once every label is on a carton, it asks for PDFs.
  function body() {
    if (!labels.length && !reading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted">
            <FileUp aria-hidden className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">{t("dropTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("dropNote")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={row.disabled}
            onClick={() => input.current?.click()}
          >
            {t("browse")}
          </Button>
        </div>
      )
    }
    return (
      <>
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
          {reading ? (
            <output className="flex flex-1 items-center gap-2">
              <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
              {reading}
            </output>
          ) : (
            <>
              <Upload aria-hidden className="size-3.5" />
              <span className="flex-1">{t.rich("dropMore", { browse })}</span>
              <span>{t("files", { count: files })}</span>
            </>
          )}
        </div>
        {!!labels.length && (
          <ul className={cn("min-h-0 flex-1", scrollList)}>
            {labels.map((label) => (
              <LabelRow key={label.id} {...row} label={label} returning={label.id === returned} />
            ))}
          </ul>
        )}
      </>
    )
  }
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={heading}
      {...fileDrop.handlers}
      className={cn(
        "flex min-h-72 flex-col overflow-hidden rounded-lg border max-md:max-h-[28rem] md:min-h-0",
        (fileDrop.over !== null || isOver) && "border-primary"
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/50 py-2 pr-2 pl-3">
        <h3 id={heading} className="text-sm font-semibold">
          {t("notPlaced")}
        </h3>
        {!!labels.length && <span className="text-sm text-muted-foreground">{labels.length}</span>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={row.disabled || !canFill}
          onClick={onFill}
        >
          <ListOrdered data-icon="inline-start" />
          {t("fill")}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          onAdd(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ""
        }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {body()}
        {overlay()}
      </div>
    </section>
  )
}

// A label waiting in Not placed, and its picture opens the preview. Dragging it lifts it out of the list, whose rows
// close the gap it leaves, and open one again when it comes back. One without a tracking number can't be dragged, and
// its grip is dimmed, until it has one.
function LabelRow({ label, returning, ...row }: RowProps & { label: CarrierLabel; returning: boolean }) {
  const fixed = needsTracking(label)
  const { setNodeRef, listeners } = useDraggable({ id: label.id, disabled: row.disabled || fixed })
  const lifted = row.lifted === label.id
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-hidden={lifted || undefined}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        !fixed && "cursor-grab",
        lifted ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
        returning && "starting:grid-rows-[0fr] starting:opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex items-center gap-3 border-b px-3 py-2">
          <GripVertical
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground", fixed && "cursor-not-allowed opacity-30")}
          />
          <PreviewButton {...row} label={label} />
          <LabelText {...row} label={label} />
          <AddTracking {...row} label={label} />
        </div>
      </div>
    </li>
  )
}

// The label under the pointer while it's dragged, at the size of the row or carton it came from.
function DragCard({ label, ...row }: RowProps & { label: CarrierLabel }) {
  return (
    <div className="flex size-full cursor-grabbing items-center gap-3 rounded-md border bg-background px-3 py-2 text-foreground shadow-lg">
      <GripVertical aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Thumbnail image={label.image} className="h-9 w-6" />
      <LabelText {...row} label={label} />
    </div>
  )
}

function PreviewButton({ label, title, previewId, onPreview }: RowProps & { label: CarrierLabel }) {
  const t = useTranslations("shipments.carrierLabels")
  return (
    <button
      id={previewId(label)}
      type="button"
      aria-label={t("preview", { name: title(label) })}
      onClick={() => onPreview(label.id)}
      className="shrink-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Thumbnail image={label.image} className="h-9 w-6" />
    </button>
  )
}

function Thumbnail({ image, className }: { image?: string; className?: string }) {
  return image ? (
    <img src={image} alt="" draggable={false} className={cn("rounded-sm border bg-white object-contain", className)} />
  ) : (
    <span className={cn("flex items-center justify-center rounded-sm border bg-muted", className)}>
      <Barcode aria-hidden className="size-3.5 text-muted-foreground" />
    </span>
  )
}

// A label's tracking number, or a warning that it has none yet, red once Save is tried. Below it, the weight and size
// the label prints, to check against its carton configuration, or its file and page when it prints neither.
function LabelText({ label, ...row }: RowProps & { label: CarrierLabel }) {
  const t = useTranslations("shipments.carrierLabels")
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {needsTracking(label) ? (
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-sm font-medium",
            row.submitted ? "text-destructive" : "text-warning-foreground"
          )}
        >
          <TriangleAlert aria-hidden className={cn("size-3.5 shrink-0", !row.submitted && "text-warning")} />
          {label.trackingNumber ? <span className="truncate font-mono">{label.trackingNumber}</span> : t("noTracking")}
        </span>
      ) : (
        <span className="font-mono text-sm break-all">{label.trackingNumber}</span>
      )}
      <span className="truncate text-xs text-muted-foreground">{row.measurements(label) || row.name(label)}</span>
    </div>
  )
}

// For a label without a valid tracking number: opens its preview, where the number is typed from its picture.
function AddTracking({ label, ...row }: RowProps & { label: CarrierLabel }) {
  const t = useTranslations("shipments.carrierLabels")
  return (
    needsTracking(label) && (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={row.disabled}
        aria-label={t("addTrackingFor", { name: row.name(label) })}
        onClick={() => row.onAddTracking(label.id)}
      >
        {t("addTracking")}
      </Button>
    )
  )
}

// The preview's field for a tracking number that couldn't be read, checked as it's typed. A number whose carrier format
// and check digit hold says it's recognized, and Carrier names its carrier. One that doesn't is still taken, as some
// carriers' aren't known, but once the field is left it says to check it against the label. Empty, it says the label
// wasn't recognized, and a mistyped number says how to type it once the field is left. Both warn until Save is tried,
// when they're errors.
function TrackingField({ label, name, fieldId, submitted, disabled, onTracking }: RowProps & { label: CarrierLabel }) {
  const t = useTranslations("shipments.carrierLabels")
  const [left, setLeft] = useState(false)
  const value = label.trackingNumber
  const carrier = carrierOf(value)
  let problem = ""
  if (!value.trim()) {
    problem = t("trackingNotRead")
  } else if (!valid(value) && (left || submitted)) {
    problem = t("trackingInvalid")
  }
  const error = submitted ? problem : ""
  let warning = submitted ? "" : problem
  if (!problem && !carrier && (left || submitted)) {
    warning = t("trackingUnknown")
  }
  const note = `${fieldId(label)}-note`
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id={fieldId(label)}
        value={value}
        disabled={disabled}
        aria-label={t("trackingFor", { name: name(label) })}
        aria-invalid={!!error || undefined}
        aria-describedby={note}
        placeholder={t("enterTracking")}
        autoComplete="off"
        spellCheck={false}
        className="font-mono placeholder:font-sans"
        // Kept as it's stored, without the spaces labels print between groups, so a pasted number reads as one.
        onChange={(event) => onTracking(label.id, event.currentTarget.value.replace(/\s+/g, "").toUpperCase())}
        onBlur={() => setLeft(true)}
      />
      <div id={note} aria-live="polite">
        {error && <FieldError>{error}</FieldError>}
        {!error && carrier && (
          <p className="flex gap-1.5 text-xs text-success">
            <CircleCheck aria-hidden className="mt-px size-3.5 shrink-0" />
            {t("trackingRecognized")}
          </p>
        )}
        {!error && !carrier && warning && (
          <p className="flex gap-1.5 text-xs text-warning-foreground">
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warning" />
            {warning}
          </p>
        )}
      </div>
    </div>
  )
}

// The shipment's cartons, grouped by carton configuration, each a drop target for a label.
function Cartons({
  cartons,
  placed,
  count,
  onPlace,
  ...row
}: RowProps & {
  cartons: Packing["cartons"]
  placed: (cartonId: string) => CarrierLabel | undefined
  count: number
  onPlace: (labelId: string, cartonId: string | null) => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const measure = useMeasure()
  const heading = useId()
  const list = useRef<HTMLDivElement>(null)
  useEdgeScroll(list, !!row.dragging)
  const cartonIds = cartons.map((carton) => carton.cartonId)
  const groups = configurations(cartons)
  return (
    <section
      aria-labelledby={heading}
      className="flex min-h-72 flex-col overflow-hidden rounded-lg border max-md:max-h-[28rem] md:min-h-0"
    >
      <div className="flex min-h-12 items-center gap-2 border-b bg-muted/50 px-3">
        <h3 id={heading} className="text-sm font-semibold">
          {t("cartons")}
        </h3>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {t("cartonsLabelled", { count, total: cartonIds.length })}
        </span>
      </div>
      <div ref={list} className={cn("min-h-0 flex-1", scrollList)}>
        {groups.map((configuration) => {
          const { ids, group } = configuration
          return (
            <div key={ids[0]}>
              <h4
                id={`${heading}-${ids[0]}`}
                className="flex flex-wrap items-baseline gap-x-2 border-b bg-muted/50 px-3 py-2 text-xs"
              >
                <span className="font-semibold">{cartonGroupLabel(ids.map((cartonId) => ({ id: cartonId })))}</span>
                <span className="text-muted-foreground">
                  {measure.dimensions(group)}, {measure.weight(group.weight)}
                </span>
              </h4>
              <ul aria-labelledby={`${heading}-${ids[0]}`} className="divide-y border-b">
                {ids.map((cartonId) => (
                  <CartonRow
                    key={cartonId}
                    {...row}
                    cartonId={cartonId}
                    configuration={configuration}
                    label={placed(cartonId)}
                    onTakeOff={(labelId) => onPlace(labelId, null)}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CartonRow({
  cartonId,
  configuration,
  label,
  onTakeOff,
  ...row
}: RowProps & {
  cartonId: string
  configuration: Configuration
  label: CarrierLabel | undefined
  onTakeOff: (labelId: string) => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const { setNodeRef, isOver } = useDroppable({ id: cartonId, disabled: row.disabled })
  const coming = isOver ? row.dragging : null
  // Every state is as tall as a carton with a label, so a drop doesn't move the rows below it.
  const slot = "flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md border px-3 py-2 text-xs"
  return (
    // Each carton is its own list item, all of it a slot that takes drops.
    <li className="flex px-3 py-1.5">
      <div ref={setNodeRef} className="flex min-w-0 flex-1">
        {label && (
          <PlacedLabel
            key={label.id}
            {...row}
            label={label}
            hidden={!!coming}
            cartonId={cartonId}
            configuration={configuration}
            onTakeOff={onTakeOff}
          />
        )}
        {coming ? (
          <div className={cn(slot, "border-primary bg-primary/5 font-medium text-primary")}>
            <CartonId cartonId={cartonId} />
            <ArrowDownToLine aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{t("dropOnCarton", { name: row.title(coming), carton: cartonId })}</span>
          </div>
        ) : (
          (!label || row.lifted === label.id) && (
            <div className={cn(slot, "border-dashed bg-muted/50 text-muted-foreground")}>
              <CartonId cartonId={cartonId} />
              <ArrowDownToLine aria-hidden className="size-3.5 shrink-0" />
              {t("dragHere")}
            </div>
          )
        )}
      </div>
    </li>
  )
}

// An empty carton's ID, at the right of its drop zone, its letters pressed into it: shaded along their top edges and
// lit along their bottom ones. It comes first for screen readers.
const CartonId = ({ cartonId }: { cartonId: string }) => (
  <span className="order-last ml-auto shrink-0 text-base font-bold text-muted-foreground/60 [text-shadow:0_-1px_0_rgb(0_0_0/0.25),0_1px_0_rgb(255_255_255/0.9)] dark:[text-shadow:0_-1px_0_rgb(0_0_0/0.8),0_1px_0_rgb(255_255_255/0.08)]">
    {cartonId}
  </span>
)

// A carton's label, which covers the carton's ID: the ID is only in an empty carton's drop zone, and read out here.
// Dragging the label lifts it off, leaving the carton empty until it's dropped.
function PlacedLabel({
  label,
  hidden,
  cartonId,
  configuration,
  onTakeOff,
  ...row
}: RowProps & {
  label: CarrierLabel
  hidden: boolean
  cartonId: string
  configuration: Configuration
  onTakeOff: (labelId: string) => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  // A label whose printed weight or size doesn't fit the carton's configuration says so.
  const printed = label.measured.weight !== undefined || !!label.measured.dimensions
  const fits = fitsConfiguration(label.measured, configuration.group)
  const cartons = cartonGroupLabel(configuration.ids.map((id) => ({ id })))
  // A label whose tracking number was cleared stays put until it has one again, or its X takes it off.
  const fixed = needsTracking(label)
  const { setNodeRef, listeners } = useDraggable({ id: label.id, disabled: row.disabled || fixed })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md border bg-background px-3 py-2",
        !fixed && "cursor-grab",
        (hidden || row.lifted === label.id) && "hidden"
      )}
    >
      <span className="sr-only">{cartonId}</span>
      <GripVertical
        aria-hidden
        className={cn("size-4 shrink-0 text-muted-foreground", fixed && "cursor-not-allowed opacity-30")}
      />
      <PreviewButton {...row} label={label} />
      <LabelText {...row} label={label} />
      <AddTracking {...row} label={label} />
      {printed && !fits && (
        <span title={t("doesNotFit", { cartons })} className="shrink-0">
          <TriangleAlert aria-hidden className="size-4 text-warning" />
          <span className="sr-only">{t("doesNotFit", { cartons })}</span>
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={row.disabled}
        aria-label={t("takeOff", { carton: cartonId })}
        onClick={() => onTakeOff(label.id)}
      >
        <X />
      </Button>
    </div>
  )
}

// One label at full size, with what was read from it and a Carton field that places it without dragging (10.13).
function LabelPreview({
  label,
  list,
  cartonId,
  cartonIds,
  taken,
  onCarton,
  onBack,
  ...row
}: RowProps & {
  label: CarrierLabel
  list: string[]
  cartonId: string | null
  cartonIds: string[]
  taken: Set<string>
  onCarton: (cartonId: string | null) => void
  onBack: () => void
}) {
  const t = useTranslations("shipments.carrierLabels")
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  // Each label shown, and each step to another, starts at its name.
  useEffect(() => heading.current?.focus(), [label.id])
  const index = list.indexOf(label.id)
  // The carrier of the number read from the label, or of the one typed once it's recognized.
  const carrier = carrierOf(label.trackingNumber)
  return (
    <section aria-labelledby={`${id}-name`} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {t("allLabels")}
        </Button>
        {list.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("previousLabel")}
              disabled={index <= 0}
              onClick={() => row.onPreview(list[index - 1]!)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm text-muted-foreground">
              {t(cartonId ? "positionPlaced" : "positionNotPlaced", { position: index + 1, count: list.length })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("nextLabel")}
              disabled={index >= list.length - 1}
              onClick={() => row.onPreview(list[index + 1]!)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      {/* The picture takes the dialog's height, at a 4 × 6 in label's shape. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 max-md:overflow-y-auto md:flex-row">
        <div className="flex shrink-0 justify-center rounded-lg bg-muted p-3 md:h-full">
          {label.image ? (
            <div className="relative aspect-[2/3] w-full max-w-sm md:h-full md:w-auto md:max-w-none">
              <img
                src={label.image}
                alt={t("pictureOf", { name: row.name(label) })}
                draggable={false}
                className="size-full rounded-sm border bg-white object-contain shadow-xs"
              />
              <PrintedText lines={label.lines} />
              {label.picture === "reading" && (
                <output className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-md bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                  <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
                  {t("readingText")}
                </output>
              )}
            </div>
          ) : (
            <div className="flex aspect-[2/3] w-full max-w-sm flex-col items-center justify-center gap-2 rounded-sm border bg-background p-4 text-center text-xs text-muted-foreground md:h-full md:w-auto md:max-w-none">
              <Barcode aria-hidden className="size-5" />
              {t("noPicture")}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:overflow-y-auto">
          <h3 id={`${id}-name`} ref={heading} tabIndex={-1} className="font-semibold break-words outline-none">
            {row.name(label)}
          </h3>
          <dl className="divide-y rounded-lg border text-sm">
            {/* A number to type gets the row's full width, under its name. */}
            <div
              className={cn(
                "flex flex-col gap-1 px-3 py-2.5",
                label.read ? "sm:flex-row sm:items-center sm:gap-3" : "gap-2"
              )}
            >
              <dt className="w-32 shrink-0 text-muted-foreground">{t("trackingNumber")}</dt>
              <dd className="min-w-0 flex-1">
                {label.read ? (
                  <span className="font-mono text-xs">{label.trackingNumber}</span>
                ) : (
                  <TrackingField key={label.id} {...row} label={label} />
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">{t("carrier")}</dt>
              <dd>{carrier ?? t("unknownCarrier")}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">{t("weight")}</dt>
              <dd>{row.printedWeight(label) || t("notRead")}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <dt className="w-32 shrink-0 text-muted-foreground">{t("dimensions")}</dt>
              <dd>{row.printedDimensions(label) || t("notRead")}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-carton`}>{t("carton")}</Label>
            <SelectControl
              id={`${id}-carton`}
              // A label goes on a carton once it has a tracking number.
              disabled={row.disabled || (!cartonId && needsTracking(label))}
              value={cartonId ?? ""}
              options={[
                { value: "", label: t("notPlaced") },
                ...cartonIds.map((carton) => ({
                  value: carton,
                  label: taken.has(carton) && carton !== cartonId ? t("cartonTaken", { carton }) : carton
                }))
              ]}
              onValueChange={(value) => onCarton(value || null)}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

// The text printed on a label, laid invisibly over its picture where it's printed, to select and copy. Each line is as
// tall as it's printed, in units of the picture's height.
function PrintedText({ lines }: { lines: TextLine[] }) {
  return (
    !!lines.length && (
      <div aria-hidden className="absolute inset-0 overflow-hidden [container-type:size]">
        {lines.map((line) => (
          <span
            key={`${line.x},${line.y},${line.text}`}
            className="absolute cursor-text leading-none whitespace-pre text-transparent selection:bg-primary/30"
            style={{
              left: `${line.x * 100}%`,
              top: `${line.y * 100}%`,
              width: `${line.width * 100}%`,
              height: `${line.height * 100}%`,
              fontSize: `${line.height * 100}cqh`
            }}
          >
            {line.text}
          </span>
        ))}
      </div>
    )
  )
}
