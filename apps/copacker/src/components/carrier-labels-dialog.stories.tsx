import type { Packing } from "@repo/copacker-shipments"
import { http, HttpResponse } from "msw/http"
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { readPictureText } from "@/lib/label-text"
import {
  type ExampleLabel,
  exampleBarcodes,
  exampleLines,
  examplePicture,
  examplePrintedText,
  exampleText,
  fewLabels,
  shipmentLabels
} from "@/stories/fixtures/carrier-labels"
import { shipmentId } from "@/stories/fixtures/logistics"
import {
  type CarrierLabelInput,
  type CarrierLabelPage,
  CarrierLabelsDialog,
  readLabelPages,
  type ReadPictureText,
  type SavedCarrierLabel,
  UploadCarrierLabels
} from "./carrier-labels-dialog"

const itemId = "6a1c3e5f-7b9d-4f1a-8c2e-4d6f8a0b2c4e"
const carton = (cartonId: string, height: number, weight: number, pieces: number): Packing["cartons"][number] => ({
  cartonId,
  length: 60,
  width: 40,
  height,
  weight,
  items: [{ itemId, pieces }]
})
const ids = (letter: string, count: number) => Array.from({ length: count }, (_, index) => `${letter}${index + 1}`)
// A large shipment: sixteen cartons of 60 × 40 × 40 cm and 12.4 kg, and eight of 60 × 40 × 50 cm and 15.2 kg.
const cartons = [
  ...ids("A", 16).map((id) => carton(id, 40, 12.4, 24)),
  ...ids("B", 8).map((id) => carton(id, 50, 15.2, 30))
]
// A small one: two cartons of the first configuration and one of the second.
const fewCartons = [carton("A1", 40, 12.4, 24), carton("A2", 40, 12.4, 24), carton("B1", 50, 15.2, 30)]

// The example labels (stories/fixtures/carrier-labels.ts). Stories never read PDFs: the dialog gets each page's text and
// where it's printed, a drawing of it and its barcodes' values through `readPages`, and the text on a picture through
// `readPicture`, except in Example PDFs.
const examples: Record<string, ExampleLabel[]> = { ...shipmentLabels, ...fewLabels }
// A UPS label scanned too faintly for its barcodes or its text to be read, so nothing on it gives its tracking number.
const faint = "faint-ups-label.pdf"
// A UPS label whose barcodes are smudged, though its text can still be read.
const smudged = "smudged-ups-label.pdf"
const scanned: Record<string, string> = { [faint]: "ups-3-day-select-1.pdf", [smudged]: "ups-3-day-select-2.pdf" }
const readPages = async (file: File): Promise<CarrierLabelPage[]> => {
  const found = examples[scanned[file.name] ?? file.name]
  if (!found) {
    throw new Error("Unreadable PDF")
  }
  return found.map((label) => ({
    text: exampleText(label),
    lines: exampleText(label) ? exampleLines(label) : [],
    image: examplePicture(label),
    barcodes: scanned[file.name] ? [] : exampleBarcodes(label)
  }))
}
// Reading a picture's text gives what's printed on it, a moment later, except on the faint scan.
const readPicture: ReadPictureText = async (file, page) => {
  const label = file.name === faint ? undefined : examples[scanned[file.name] ?? file.name]?.[page - 1]
  await new Promise((resolve) => setTimeout(resolve, 300))
  return label ? { text: examplePrintedText(label), lines: exampleLines(label) } : { text: "", lines: [] }
}
const first = "shopify-labels-1.pdf"
const second = "shopify-labels-2.pdf"
// The tracking number on a page of an example file.
const tracking = (file: string, page = 1) => examples[file]?.[page - 1]?.trackingNumber ?? ""
const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" })
// The large shipment's four PDFs, dropped in no particular order.
const shipmentPdfs = () => Object.keys(shipmentLabels).toReversed().map(pdf)
const fewPdfs = () => Object.keys(fewLabels).map(pdf)
const saved = (cartonId: string, page: number): SavedCarrierLabel => ({
  cartonId,
  documentId: `d0c0ca11-0000-4000-8000-0000000000${String(page).padStart(2, "0")}`,
  trackingNumber: tracking(first, page),
  sourceName: first,
  sourcePage: page
})

type Save = (labels: CarrierLabelInput[], files: File[]) => Promise<void>
// What the page's Upload labels posted.
const posted: unknown[] = []

const meta = preview.meta({
  title: "Components/Shipments/Carrier labels dialog",
  component: CarrierLabelsDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    reference: "PO42",
    shipmentName: "Shipment 1",
    cartons,
    saved: [],
    readPages,
    readPicture,
    onSave: fn<Save>(async () => undefined)
  }
})

// The dialog, once it has faded in.
async function shown() {
  const dialog = await screen.findByRole("dialog", { name: "Upload carrier labels" })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}
const notPlaced = () => screen.getByRole("region", { name: "Not placed" })
const cartonList = () => screen.getByRole("region", { name: "Cartons" })
// A label's row in Not placed, found by its tracking number or its file and page, or a carton's row in Cartons.
function labelRow(text: string) {
  const row = within(notPlaced()).getByText(text, { exact: true }).closest("li")
  if (!row) {
    throw new Error(`No row for ${text}`)
  }
  return row
}
function cartonRow(cartonId: string) {
  // A configuration of one carton is headed by its ID too.
  const row = within(cartonList())
    .getAllByText(cartonId, { exact: true })
    .map((element) => element.closest("li"))
    .find(Boolean)
  if (!row) {
    throw new Error(`No row for ${cartonId}`)
  }
  return row
}
// A carton's slot, which takes a dragged label.
const slot = (cartonId: string) => cartonRow(cartonId).querySelector(":scope > div")!
// Drags files from the computer over a target as a browser does, and drops them or holds them there.
function dragFiles(target: Element, files: File[], end: "drop" | "hold" = "drop") {
  const dataTransfer = new DataTransfer()
  for (const file of files) {
    dataTransfer.items.add(file)
  }
  for (const type of ["dragenter", "dragover", ...(end === "drop" ? ["drop"] : [])]) {
    fireEvent(target, new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
  }
}
const dropFiles = (files: File[]) => dragFiles(notPlaced(), files)
// Labels are dragged with the mouse, as dnd-kit hears it: pressed, moved far enough to lift, moved over a target and
// released there.
const center = (element: Element) => {
  const rect = element.getBoundingClientRect()
  return { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
// Where the pointer is. Events go to it and bubble up to the document, where dnd-kit listens, as a browser's do.
let pointer: Element = document.body
async function moveTo(target: Element) {
  target.scrollIntoView({ block: "center" })
  pointer = target
  fireEvent.mouseMove(target, center(target))
  await settle()
}
// Picks up the label showing this text and holds it over a target.
async function pickUp(text: string, target: Element) {
  const card = screen.getByText(text, { exact: true })
  const from = center(card)
  fireEvent.mouseDown(card, { ...from, button: 0 })
  fireEvent.mouseMove(card, { clientX: from.clientX + 8, clientY: from.clientY + 8 })
  await settle()
  await moveTo(target)
}
async function release() {
  fireEvent.mouseUp(pointer, center(pointer))
  await settle()
}
async function dragLabel(text: string, target: Element) {
  await pickUp(text, target)
  await release()
}
// The large shipment's labels, once they're read and the ones that fit are on their cartons.
async function dropShipment() {
  dropFiles(shipmentPdfs())
  await within(cartonList()).findByText("18 of 24 have a label")
}

// 10.11 states: before any PDF, Not placed is where they go, and each carton waits for a label.
export const Empty = meta.story({
  play: async () => {
    const dialog = await shown()
    await expect(within(dialog).getByText("PO42 / Shipment 1")).toBeVisible()
    await expect(within(notPlaced()).getByText("Drop the carrier’s PDFs here")).toBeVisible()
    await expect(within(notPlaced()).getByText("One PDF per label, or one with a page per label")).toBeVisible()
    await expect(within(notPlaced()).getByRole("button", { name: "Browse" })).toBeVisible()
    await expect(within(notPlaced()).getByRole("button", { name: "Fill cartons in order" })).toBeDisabled()
    await expect(within(cartonList()).getByRole("heading", { name: "A1–A16 60 × 40 × 40 cm, 12.4 kg" })).toBeVisible()
    await expect(within(cartonList()).getByRole("heading", { name: "B1–B8 60 × 40 × 50 cm, 15.2 kg" })).toBeVisible()
    await expect(within(cartonList()).getAllByText("Drag a label here")).toHaveLength(24)
    await expect(within(cartonList()).getByText("0 of 24 have a label")).toBeVisible()
    await expect(within(dialog).getByRole("button", { name: "Save labels" })).toBeDisabled()
  }
})

// 10.11 states: PDFs held over Not placed say what dropping them does.
export const DraggingPdfs = meta.story({
  play: async () => {
    await shown()
    dragFiles(notPlaced(), shipmentPdfs().slice(0, 3), "hold")
    await expect(await within(notPlaced()).findByText("Drop to add 3 PDFs")).toBeVisible()
    await expect(within(notPlaced()).getByText("Each page becomes a label")).toBeVisible()
  }
})

// 10.12: 24 labels in four PDFs from FedEx, USPS, DHL and UPS. The 18 whose printed weight or size fit only one carton
// configuration go on its cartons in order of file and page. The six that give neither wait in Not placed: the UPS
// labels, pictures whose tracking numbers come from their barcodes, and the FedEx Ground Economy label. Each label
// shows its tracking number, and below it the weight and size it prints, written as the cartons' are, or else its file
// and page.
export const ManyLabels = meta.story({
  play: async () => {
    await shown()
    await dropShipment()
    await expect(within(cartonRow("A1")).getByText(tracking(first, 1))).toBeVisible()
    await expect(within(cartonRow("A4")).getByText(tracking(first, 5))).toBeVisible()
    await expect(within(cartonRow("A12")).getByText(tracking(first, 16))).toBeVisible()
    await expect(within(cartonRow("B6")).getByText(tracking(second, 6))).toBeVisible()
    await expect(within(cartonRow("A13")).getByText("Drag a label here")).toBeVisible()
    // FedEx prints its weight and size, USPS its pounds and ounces, and DHL whole pounds.
    await expect(within(cartonRow("A1")).getByText("61 × 41 × 41 cm, 12.4 kg")).toBeVisible()
    await expect(within(cartonRow("A2")).getByText("12.4 kg")).toBeVisible()
    await expect(within(cartonRow("A3")).getByText("12.7 kg")).toBeVisible()
    await expect(within(cartonRow("B1")).getByText("61 × 51 × 41 cm, 15.2 kg")).toBeVisible()

    await expect(within(notPlaced()).getAllByRole("listitem")).toHaveLength(6)
    await expect(within(notPlaced()).getByText("4 files")).toBeVisible()
    await expect(within(labelRow(tracking(first, 10))).getByText("shopify-labels-1.pdf, page 10")).toBeVisible()
    await expect(within(labelRow(tracking(first, 4))).getByText("shopify-labels-1.pdf, page 4")).toBeVisible()
    const threeDay = tracking("ups-3-day-select-2.pdf")
    await expect(within(labelRow(threeDay)).getByText("ups-3-day-select-2.pdf")).toBeVisible()
    await expect(within(notPlaced()).queryByRole("textbox")).toBeNull()
  }
})

// A small shipment's labels, a PDF each from FedEx, USPS and DHL. Each fits only one carton configuration, so they go
// straight onto the cartons, and saving sends them to the supplier. A PDF dropped again adds no label.
export const FewLabels = meta.story({
  args: { cartons: fewCartons },
  play: async ({ args }) => {
    const dialog = await shown()
    dropFiles(fewPdfs())
    await expect(await within(cartonRow("A1")).findByText(tracking("fedex-home-delivery.pdf"))).toBeVisible()
    await expect(within(cartonRow("A2")).getByText(tracking("usps-priority-mail.pdf"))).toBeVisible()
    await expect(within(cartonRow("B1")).getByText(tracking("dhl-ecommerce.pdf"))).toBeVisible()
    await expect(within(notPlaced()).getByText("Drop the carrier’s PDFs here")).toBeVisible()
    dropFiles(fewPdfs().slice(0, 1))
    await expect(await within(dialog).findByText("1 label was already added, so it was skipped.")).toBeVisible()
    await expect(within(notPlaced()).getByText("Drop the carrier’s PDFs here")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        [
          { cartonId: "A1", trackingNumber: tracking("fedex-home-delivery.pdf"), file: 0, page: 1 },
          { cartonId: "A2", trackingNumber: tracking("usps-priority-mail.pdf"), file: 1, page: 1 },
          { cartonId: "B1", trackingNumber: tracking("dhl-ecommerce.pdf"), file: 2, page: 1 }
        ],
        ["fedex-home-delivery.pdf", "usps-priority-mail.pdf", "dhl-ecommerce.pdf"].map((name) =>
          expect.objectContaining({ name })
        )
      )
    )
  }
})

// Fill cartons in order puts the six labels left in Not placed on the empty cartons: A13 to A16, then B7 and B8.
// Every carton then has a label, and saving sends them.
export const FillCartonsInOrder = meta.story({
  play: async ({ args }) => {
    const dialog = await shown()
    await dropShipment()
    await userEvent.click(within(notPlaced()).getByRole("button", { name: "Fill cartons in order" }))
    const threeDay = tracking("ups-3-day-select-2.pdf")
    await expect(within(cartonRow("A13")).getByText(tracking(first, 4))).toBeVisible()
    await expect(within(cartonRow("A15")).getByText(tracking(first, 10))).toBeVisible()
    await expect(within(cartonRow("B8")).getByText(threeDay)).toBeVisible()
    await expect(within(cartonList()).getByText("24 of 24 have a label")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          { cartonId: "A13", trackingNumber: tracking(first, 4), file: 0, page: 4 },
          { cartonId: "B8", trackingNumber: threeDay, file: 3, page: 1 }
        ]),
        expect.any(Array)
      )
    )
  }
})

// 10.12: a label picked up leaves Not placed, which has nothing to say about it, and moves with the pointer. Dropped
// on a carton it goes on it, and one dropped on a carton with a label sends that label back to Not placed. A label
// whose weight and size don't fit its carton's configuration says so. A carton is as tall with a label as without
// one. Ends with a label held over A14.
export const DragLabelToCarton = meta.story({
  play: async ({ args }) => {
    const dialog = await shown()
    await dropShipment()
    const economy = tracking(first, 10)
    await pickUp(economy, notPlaced())
    await waitFor(() => expect(labelRow(economy)).not.toBeVisible())
    await expect(within(notPlaced()).queryByText(/Drop to take/)).toBeNull()
    await moveTo(slot("A13"))
    await expect(await within(cartonRow("A13")).findByText(`Drop to put ${economy} on A13`)).toBeVisible()
    await release()
    await expect(await within(cartonRow("A13")).findByText(economy)).toBeVisible()
    await expect(cartonRow("A13").getBoundingClientRect().height).toBe(cartonRow("A14").getBoundingClientRect().height)
    await expect(within(notPlaced()).queryByText(economy)).toBeNull()
    await expect(within(cartonList()).getByText("19 of 24 have a label")).toBeVisible()

    const ups = tracking(first, 4)
    await dragLabel(ups, slot("A1"))
    await expect(await within(cartonRow("A1")).findByText(ups)).toBeVisible()
    await waitFor(() => expect(within(notPlaced()).getByText(tracking(first, 1))).toBeVisible())
    await dragLabel(tracking(first, 1), slot("B7"))
    await expect(await within(cartonRow("B7")).findByText("Weight and size don’t fit B1–B8")).toBeInTheDocument()

    // Saving keeps every label on a carton.
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          { cartonId: "A1", trackingNumber: ups, file: 0, page: 4 },
          { cartonId: "A13", trackingNumber: economy, file: 0, page: 10 },
          { cartonId: "B7", trackingNumber: tracking(first, 1), file: 0, page: 1 }
        ]),
        expect.any(Array)
      )
    )
    await pickUp(tracking(first, 9), slot("A14"))
    await expect(await within(cartonRow("A14")).findByText(`Drop to put ${tracking(first, 9)} on A14`)).toBeVisible()
  }
})

// Saved labels open on their cartons. Taking one off, with its X or by dragging it onto Not placed, sends it back there.
// While a carton's label is dragged, the carton is empty, and a label that crosses Not placed on its way to another
// carton leaves Not placed as it was.
export const TakeLabelOff = meta.story({
  args: { saved: [saved("A1", 1), saved("A2", 2), saved("A3", 3)] },
  play: async () => {
    await shown()
    const label = tracking(first, 2)
    await expect(within(cartonRow("A2")).getByText(label)).toBeVisible()
    await expect(within(cartonRow("A2")).getByText("shopify-labels-1.pdf, page 2")).toBeVisible()
    await expect(within(cartonList()).getByText("3 of 24 have a label")).toBeVisible()
    await userEvent.click(within(cartonList()).getByRole("button", { name: "Take the label off A1" }))
    await expect(within(cartonRow("A1")).getByText("Drag a label here")).toBeVisible()
    await waitFor(() => expect(within(notPlaced()).getByText(tracking(first, 1))).toBeVisible())

    await pickUp(label, notPlaced())
    await expect(await within(notPlaced()).findByText(`Drop to take ${label} off its carton`)).toBeVisible()
    await waitFor(() => expect(within(cartonRow("A2")).getByText(label)).not.toBeVisible())
    await expect(within(cartonRow("A2")).getByText("Drag a label here")).toBeVisible()
    await moveTo(slot("A5"))
    await release()
    await expect(await within(cartonRow("A5")).findByText(label)).toBeVisible()
    await expect(within(notPlaced()).queryByText(/Drop to take/)).toBeNull()

    await dragLabel(label, notPlaced())
    await waitFor(() => expect(within(notPlaced()).getByText(label)).toBeVisible())
    await expect(within(notPlaced()).queryByText(/Drop to take/)).toBeNull()
    await expect(within(cartonList()).getByText("1 of 24 have a label")).toBeVisible()
  }
})

// 10.11: a label with nothing to read its tracking number from, such as a UPS picture scanned too faintly for its
// barcodes, says it has no tracking number, with Add beside it. It can't go on a carton until it has one: its grip is
// dimmed, dragging it doesn't lift it, and Fill cartons in order leaves it. Ends with it in Not placed, beside a label
// that went on its carton.
export const TrackingNotRead = meta.story({
  args: { cartons: fewCartons },
  play: async () => {
    await shown()
    dropFiles([pdf(faint), pdf("fedex-home-delivery.pdf")])
    await expect(await within(cartonRow("A1")).findByText(tracking("fedex-home-delivery.pdf"))).toBeVisible()
    const row = labelRow("No tracking number")
    await expect(within(row).getByText(faint)).toBeVisible()
    await expect(within(row).getByRole("button", { name: `Add the tracking number for ${faint}` })).toBeVisible()
    await expect(within(notPlaced()).queryByRole("textbox")).toBeNull()
    await expect(within(notPlaced()).getByRole("button", { name: "Fill cartons in order" })).toBeDisabled()
    await dragLabel("No tracking number", slot("A2"))
    await expect(within(cartonRow("A2")).getByText("Drag a label here")).toBeVisible()
    await expect(labelRow("No tracking number")).toBeVisible()
  }
})

// Add opens the label's preview at its tracking number field, beside its picture, where its Carton waits for
// a number. A mistyped number says so once the field is left. One no carrier's format matches is taken, but says to
// check it against the label. A recognized one says so, and Carrier says whose it is. The label then goes on a carton
// and saves.
export const AddTrackingNumber = meta.story({
  args: { cartons: fewCartons },
  play: async ({ args }) => {
    const dialog = await shown()
    dropFiles([pdf(faint)])
    await userEvent.click(
      await within(notPlaced()).findByRole("button", { name: `Add the tracking number for ${faint}` })
    )
    const field = within(dialog).getByRole("textbox", { name: `Tracking number for ${faint}` })
    const carton = within(dialog).getByRole("combobox", { name: "Carton" })
    await expect(field).toHaveFocus()
    await expect(field).toHaveAttribute("placeholder", "Enter the tracking number")
    await expect(field).toHaveAccessibleDescription("Unrecognized tracking label.")
    await expect(field).not.toHaveAttribute("aria-invalid")
    await expect(carton).toBeDisabled()
    // Before Save, leaving the field empty or mistyped warns rather than errs.
    await userEvent.tab()
    await expect(field).toHaveAccessibleDescription("Unrecognized tracking label.")
    await expect(field).not.toHaveAttribute("aria-invalid")

    await userEvent.type(field, "12-34")
    await userEvent.tab()
    await expect(within(dialog).getByText("Enter the tracking number as it’s printed on the label.")).toBeVisible()
    await expect(field).not.toHaveAttribute("aria-invalid")
    await expect(carton).toBeDisabled()

    await userEvent.clear(field)
    await userEvent.type(field, "ABC1234567")
    await userEvent.tab()
    await expect(within(dialog).getByText("Tracking number not recognized. Check it against the label.")).toBeVisible()
    await expect(within(dialog).getByText("Not known")).toBeVisible()
    await expect(carton).toBeEnabled()

    // A pasted number loses the spaces it's printed with.
    await userEvent.clear(field)
    await userEvent.paste("1z 999 aa1 01 2345 6784")
    await expect(field).toHaveValue("1Z999AA10123456784")
    await expect(field).not.toHaveAttribute("aria-invalid")
    await expect(within(dialog).getByText("Tracking number recognized.")).toBeVisible()
    await expect(within(dialog).getByText("UPS")).toBeVisible()

    await userEvent.click(carton)
    await userEvent.click(await screen.findByRole("option", { name: "A1" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "All labels" }))
    await expect(within(cartonRow("A1")).getByText("1Z999AA10123456784")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        [{ cartonId: "A1", trackingNumber: "1Z999AA10123456784", file: 0, page: 1 }],
        [expect.objectContaining({ name: faint })]
      )
    )
  }
})

// A UPS label whose barcodes are smudged has no tracking number until its text is read, when Add opens its preview.
// The number printed on it fills the field, and its weight and size fill in. Its text can be selected over its
// picture. Ends with the label ready to go on a carton.
export const ReadTextFromPicture = meta.story({
  args: { cartons: fewCartons },
  play: async () => {
    const dialog = await shown()
    dropFiles([pdf(smudged)])
    await userEvent.click(
      await within(notPlaced()).findByRole("button", { name: `Add the tracking number for ${smudged}` })
    )
    await expect(within(dialog).getByText("Reading the label’s text")).toBeVisible()
    const field = within(dialog).getByRole("textbox", { name: `Tracking number for ${smudged}` })
    await waitFor(() => expect(field).toHaveValue(tracking("ups-3-day-select-2.pdf")))
    await expect(within(dialog).getByText("Tracking number recognized.")).toBeVisible()
    await expect(within(dialog).getByText("UPS")).toBeVisible()
    await expect(within(dialog).getByText("15.4 kg")).toBeVisible()
    await expect(within(dialog).getByText("61 × 51 × 41 cm")).toBeVisible()
    await expect(within(dialog).getByText(/^TRACKING #: 1Z/)).toBeVisible()
    await expect(within(dialog).getByRole("combobox", { name: "Carton" })).toBeEnabled()
  }
})

// 10.13: a label's picture opens it at the dialog's full height, with what was read from it. The arrows step through
// the list it's in, and the Carton field puts it on a carton without dragging.
export const Preview = meta.story({
  play: async () => {
    const dialog = await shown()
    await dropShipment()
    // A UPS picture gives its tracking number through its barcode. Its text is read once its preview opens, which gives
    // the weight and size it prints, and text to copy over its picture.
    await userEvent.click(within(notPlaced()).getByRole("button", { name: `Preview ${tracking(first, 4)}` }))
    await expect(await within(dialog).findByRole("heading", { name: "shopify-labels-1.pdf, page 4" })).toHaveFocus()
    await expect(within(dialog).getByRole("img", { name: "Label from shopify-labels-1.pdf, page 4" })).toBeVisible()
    await expect(within(dialog).getByText("1 of 6 not placed")).toBeVisible()
    await expect(within(dialog).getByRole("button", { name: "Previous label" })).toBeDisabled()
    await expect(within(dialog).getByText(tracking(first, 4))).toBeVisible()
    await expect(within(dialog).getByText("UPS")).toBeVisible()
    await expect(within(dialog).getByText("Reading the label’s text")).toBeVisible()
    await expect(await within(dialog).findByText("12.7 kg")).toBeVisible()
    await expect(within(dialog).getByText("61 × 41 × 41 cm")).toBeVisible()
    await expect(within(dialog).queryByText("Reading the label’s text")).toBeNull()
    await expect(within(dialog).getByText(/^TRACKING #: 1Z/)).toBeVisible()

    await userEvent.click(within(dialog).getByRole("button", { name: "Next label" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Next label" }))
    await expect(await within(dialog).findByRole("heading", { name: "shopify-labels-1.pdf, page 10" })).toHaveFocus()
    await expect(within(dialog).getByText("3 of 6 not placed")).toBeVisible()
    await expect(within(dialog).getByText(tracking(first, 10))).toBeVisible()
    await expect(within(dialog).getByText("FedEx")).toBeVisible()

    const field = within(dialog).getByRole("combobox", { name: "Carton" })
    await expect(field).toHaveTextContent("Not placed")
    await userEvent.click(field)
    await userEvent.click(await screen.findByRole("option", { name: "A13" }))
    await expect(field).toHaveTextContent("A13")

    await userEvent.click(within(dialog).getByRole("button", { name: "All labels" }))
    await expect(within(cartonRow("A13")).getByText(tracking(first, 10))).toBeVisible()
    await expect(within(cartonList()).getByText("19 of 24 have a label")).toBeVisible()
    await expect(within(cartonRow("A13")).getByRole("button", { name: `Preview ${tracking(first, 10)}` })).toHaveFocus()

    // A label on a carton steps through the cartons' labels, and shows the weight and size it prints.
    await userEvent.click(within(cartonRow("A1")).getByRole("button", { name: `Preview ${tracking(first, 1)}` }))
    await expect(await within(dialog).findByText("1 of 19 on cartons")).toBeVisible()
    await expect(within(dialog).getByText("12.4 kg")).toBeVisible()
    await expect(within(dialog).getByText("61 × 41 × 41 cm")).toBeVisible()
    await expect(within(dialog).getByRole("combobox", { name: "Carton" })).toHaveTextContent("A1")
  }
})

// A dropped file that isn't a PDF adds nothing, and the dialog says why.
export const NotAPdf = meta.story({
  play: async () => {
    const dialog = await shown()
    dropFiles([pdf("fedex-home-delivery.pdf"), new File(["image"], "scan.jpg", { type: "image/jpeg" })])
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent("scan.jpg isn’t a PDF.")
    await expect(within(notPlaced()).getByText("Drop the carrier’s PDFs here")).toBeVisible()
  }
})

// While PDFs are read, Not placed says so and Save waits.
export const ReadingPdfs = meta.story({
  args: { saved: [saved("A1", 1)], readPages: () => new Promise<CarrierLabelPage[]>(() => undefined) },
  play: async () => {
    const dialog = await shown()
    dropFiles(fewPdfs().slice(0, 2))
    await expect(await within(notPlaced()).findByText("Reading 2 PDFs")).toBeVisible()
    await expect(within(dialog).getByRole("button", { name: "Save labels" })).toBeDisabled()
  }
})

// A save the server turns down keeps the dialog open with its reason.
export const SaveFails = meta.story({
  args: {
    saved: [saved("A1", 1)],
    onSave: fn<Save>(async () => {
      throw new Error("Shipment changed during upload. Try again.")
    })
  },
  play: async ({ args }) => {
    const dialog = await shown()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Shipment changed during upload. Try again."
    )
    await expect(args.onOpenChange).not.toHaveBeenCalled()
  }
})

// The shipment page's Upload labels: saving posts the files and the cartons they label, and says when the labels went
// to the supplier.
export const UploadLabelsFromThePage = meta.story({
  render: () => (
    <UploadCarrierLabels
      shipmentId={shipmentId}
      revision={3}
      reference="PO42"
      shipmentName="Shipment 1"
      cartons={fewCartons}
      saved={[]}
      readPages={readPages}
    />
  ),
  beforeEach: ({ msw }) => {
    posted.length = 0
    msw.use(
      http.post("/api/shipments/:id/carrier-labels", async ({ request, params }) => {
        const form = await request.formData()
        posted.push({
          id: params.id,
          revision: form.get("revision"),
          labels: JSON.parse(String(form.get("labels"))),
          files: form.getAll("file").map((file) => (file instanceof File ? file.name : file))
        })
        return HttpResponse.json({ sent: true })
      })
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Upload labels" }))
    const dialog = await shown()
    await expect(within(cartonList()).getByText("0 of 3 have a label")).toBeVisible()
    dropFiles(fewPdfs())
    await within(cartonList()).findByText("3 of 3 have a label")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await expect(await screen.findByText("Carrier labels sent to the supplier")).toBeVisible()
    await expect(posted).toEqual([
      {
        id: shipmentId,
        revision: "3",
        labels: [
          { cartonId: "A1", trackingNumber: tracking("fedex-home-delivery.pdf"), file: 0, page: 1 },
          { cartonId: "A2", trackingNumber: tracking("usps-priority-mail.pdf"), file: 1, page: 1 },
          { cartonId: "B1", trackingNumber: tracking("dhl-ecommerce.pdf"), file: 2, page: 1 }
        ],
        files: ["fedex-home-delivery.pdf", "usps-priority-mail.pdf", "dhl-ecommerce.pdf"]
      }
    ])
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// The example PDFs themselves, read as the browser reads them: pdf.js gives each page's text and picture, the UPS
// pictures' barcodes give their tracking numbers, and the labels that fit go on their cartons. A UPS picture's preview
// reads its text with Tesseract. Reading PDFs is slow, so test runs leave this story out (vitest.config.ts); it's for
// trying the dialog by hand.
export const ExamplePdfs = meta.story({
  tags: ["documents"],
  render: (args) => <CarrierLabelsDialog {...args} readPages={readLabelPages} readPicture={readPictureText} />,
  play: async () => {
    await shown()
    const files = await Promise.all(
      Object.keys(shipmentLabels).map(async (name) => {
        const response = await fetch(new URL(`../stories/fixtures/carrier-labels/${name}`, import.meta.url))
        return new File([await response.blob()], name, { type: "application/pdf" })
      })
    )
    dropFiles(files)
    await expect(await within(cartonList()).findByText("18 of 24 have a label", {}, { timeout: 30_000 })).toBeVisible()
  }
})
