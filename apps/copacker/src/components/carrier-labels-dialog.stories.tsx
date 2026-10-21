import type { Packing } from "@repo/aisle"
import { http, HttpResponse } from "msw/http"
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { shipmentId } from "@/stories/fixtures/logistics"
import { CarrierLabelsDialog, type SavedCarrierLabel, UploadCarrierLabels } from "./carrier-labels-dialog"

const itemId = "6a1c3e5f-7b9d-4f1a-8c2e-4d6f8a0b2c4e"
const carton = (cartonId: string, height: number, weight: number, pieces: number): Packing["cartons"][number] => ({
  cartonId,
  length: 60,
  width: 40,
  height,
  weight,
  items: [{ itemId, pieces }]
})
// 10.05's shipment: four cartons of one configuration and two of another.
const cartons = [
  ...["A1", "A2", "A3", "A4"].map((id) => carton(id, 40, 12.4, 24)),
  ...["B1", "B2"].map((id) => carton(id, 50, 15.2, 30))
]

const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" })
// What each sample file's pages say. Stories never read real PDFs: the dialog gets these through `readPages`.
const ups = (n: number) => `UPS GROUND TRACKING #: 1Z 4F7 E21 03 9382 10${n}1 SHIP TO AMAZON ONT8`
// A label from a carrier that gives a PDF for each one, as Amazon does: label-5.pdf to label-10.pdf.
const single = (n: number) => `UPS GROUND TRACKING #: 1Z 4F7 E21 03 9382 2${String(n).padStart(2, "0")}1`
const pages: Record<string, string[]> = {
  "ups-labels.pdf": [ups(4), ups(5), ups(6)],
  "ups-a4.pdf": [ups(7)],
  "ups-b.pdf": [ups(8), ups(9)],
  "scanned-label.pdf": ["SHIP TO AMAZON ONT8 24300 NANDINA AVE"],
  "ups-8.pdf": Array.from({ length: 8 }, (_, page) => ups(page)),
  ...Object.fromEntries([5, 6, 7, 8, 9, 10].map((n) => [`label-${n}.pdf`, [single(n)]]))
}
const readPages = async (file: File) => {
  const found = pages[file.name]
  if (!found) {
    throw new Error("Unreadable PDF")
  }
  return found
}
const saved = (cartonId: string, page: number): SavedCarrierLabel => ({
  cartonId,
  documentId: `d0c0ca11-0000-4000-8000-00000000000${page}`,
  trackingNumber: `1Z4F7E2103938210${page + 3}1`,
  sourceName: "ups-labels.pdf",
  sourcePage: page
})

// What the page's Upload labels posted.
const posted: unknown[] = []

const meta = preview.meta({
  title: "Components/Shipments/Carrier labels dialog",
  component: CarrierLabelsDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    reference: "PO38",
    shipmentName: "Shipment 1",
    cartons,
    saved: [],
    readPages,
    onSave: fn(async () => undefined)
  }
})

// The dialog, once it has faded in.
async function shown() {
  const dialog = await screen.findByRole("dialog", { name: "Upload carrier labels" })
  await waitFor(() => expect(dialog).toBeVisible())
  return dialog
}
// A carton's row in the open dialog.
function row(cartonId: string) {
  const carton = within(screen.getByRole("dialog")).getByText(cartonId, { exact: true }).closest("li")
  if (!carton) {
    throw new Error(`No row for ${cartonId}`)
  }
  return carton
}
// A carton's drop target, the element under its ID that takes the drag.
const target = (cartonId: string) => row(cartonId).querySelector("div > div")!
// Drags files over a carton's row as a browser does, with the files in the drag's data, and drops them or holds them
// there.
function drag(cartonId: string, files: File[], end: "drop" | "hold" = "drop") {
  const dataTransfer = new DataTransfer()
  for (const file of files) {
    dataTransfer.items.add(file)
  }
  for (const type of ["dragenter", "dragover", ...(end === "drop" ? ["drop"] : [])]) {
    fireEvent(target(cartonId), new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
  }
}
const drop = (cartonId: string, files: File[]) => drag(cartonId, files)
const leave = (cartonId: string) =>
  fireEvent(target(cartonId), new DragEvent("dragleave", { bubbles: true, cancelable: true }))

// 10.06: one drop target per carton, grouped by carton configuration. Save waits for a label.
export const Empty = meta.story({
  play: async () => {
    const dialog = await shown()
    await expect(within(dialog).getByText("PO38 / Shipment 1")).toBeVisible()
    await expect(within(dialog).getByRole("heading", { name: "A1–A4 60 × 40 × 40 cm, 12.4 kg" })).toBeVisible()
    await expect(within(dialog).getByRole("heading", { name: "B1–B2 60 × 40 × 50 cm, 15.2 kg" })).toBeVisible()
    await expect(within(dialog).getAllByText(/Drop a PDF or/)).toHaveLength(6)
    await expect(within(dialog).getByRole("button", { name: "Choose a PDF for B2" })).toBeVisible()
    await expect(within(dialog).getByText("0 of 6 cartons have a label")).toBeVisible()
    await expect(within(dialog).getByRole("button", { name: "Save labels" })).toBeDisabled()
  }
})

// 10.07: a three-page PDF dropped on A1 fills A1 to A3, each with the tracking number read from its page. A file that
// isn't a PDF is refused on its row. Saving keeps the three, and a file dragged over a carton says where it will go.
export const InProgress = meta.story({
  play: async ({ args }) => {
    const dialog = await shown()
    const labels = pdf("ups-labels.pdf")
    drop("A1", [labels])
    await expect(await within(dialog).findByText("ups-labels.pdf, page 3")).toBeVisible()
    await expect(within(row("A1")).getByText("ups-labels.pdf, page 1")).toBeVisible()
    await expect(within(row("A2")).getByText("Tracking 1Z4F7E210393821051")).toBeVisible()
    await expect(within(row("A4")).getByText(/Drop a PDF or/)).toBeVisible()

    drop("B1", [new File(["image"], "scan.jpg", { type: "image/jpeg" })])
    await expect(await within(row("B1")).findByText(/scan\.jpg isn’t a PDF\./)).toBeVisible()
    await expect(within(row("B1")).getByRole("button", { name: "Choose a PDF for B1" })).toBeVisible()

    await expect(within(dialog).getByText("3 of 6 cartons have a label")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        [
          { cartonId: "A1", trackingNumber: "1Z4F7E210393821041", file: 0, page: 1 },
          { cartonId: "A2", trackingNumber: "1Z4F7E210393821051", file: 0, page: 2 },
          { cartonId: "A3", trackingNumber: "1Z4F7E210393821061", file: 0, page: 3 }
        ],
        [labels]
      )
    )
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
    // As in 10.07, a second file is being dragged over A4.
    drag("A4", [pdf("ups-a4.pdf")], "hold")
    await expect(await within(row("A4")).findByText("Drop to add A4’s label")).toBeVisible()
  }
})

// 10.08: the saved labels and two more files label every carton, so saving sends them to the supplier. Saved labels go
// back as they are.
export const EveryCarton = meta.story({
  args: { saved: [saved("A1", 1), saved("A2", 2), saved("A3", 3)] },
  play: async ({ args }) => {
    const dialog = await shown()
    await expect(within(row("A3")).getByText("ups-labels.pdf, page 3")).toBeVisible()
    await expect(within(dialog).getByText("3 of 6 cartons have a label")).toBeVisible()
    const a4 = pdf("ups-a4.pdf")
    const b = pdf("ups-b.pdf")
    drop("A4", [a4])
    drop("B1", [b])
    await expect(await within(row("B2")).findByText("ups-b.pdf, page 2")).toBeVisible()
    await expect(within(dialog).getByText("Every carton has a label. Saving sends them to the supplier.")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        [
          { cartonId: "A1", trackingNumber: "1Z4F7E210393821041", documentId: saved("A1", 1).documentId },
          { cartonId: "A2", trackingNumber: "1Z4F7E210393821051", documentId: saved("A2", 2).documentId },
          { cartonId: "A3", trackingNumber: "1Z4F7E210393821061", documentId: saved("A3", 3).documentId },
          { cartonId: "A4", trackingNumber: "1Z4F7E210393821071", file: 0, page: 1 },
          { cartonId: "B1", trackingNumber: "1Z4F7E210393821081", file: 1, page: 1 },
          { cartonId: "B2", trackingNumber: "1Z4F7E210393821091", file: 1, page: 2 }
        ],
        [a4, b]
      )
    )
  }
})

// Carriers that give a PDF for each label, as Amazon does: dropped together, the files fill the cartons in the order of
// their names, whatever order they come in. A file of one label shows its name alone.
export const OneFilePerLabel = meta.story({
  play: async ({ args }) => {
    const dialog = await shown()
    drop(
      "A1",
      [7, 10, 5, 9, 6, 8].map((n) => pdf(`label-${n}.pdf`))
    )
    await expect(await within(row("B2")).findByText("label-10.pdf")).toBeVisible()
    await expect(within(row("A1")).getByText("label-5.pdf")).toBeVisible()
    await expect(within(row("B1")).getByText("Tracking 1Z4F7E210393822091")).toBeVisible()
    await expect(within(dialog).getByText("Every carton has a label. Saving sends them to the supplier.")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        ["A1", "A2", "A3", "A4", "B1", "B2"].map((cartonId, file) => ({
          cartonId,
          trackingNumber: `1Z4F7E210393822${String(file + 5).padStart(2, "0")}1`,
          file,
          page: 1
        })),
        [5, 6, 7, 8, 9, 10].map((n) => expect.objectContaining({ name: `label-${n}.pdf` }))
      )
    )
  }
})

// 10.10: a page whose tracking number can't be read keeps its label and asks for the number, which Save waits for.
export const TrackingNumberNotFound = meta.story({
  play: async ({ args }) => {
    const dialog = await shown()
    drop("A4", [pdf("scanned-label.pdf")])
    const field = await within(row("A4")).findByRole("textbox", { name: "Tracking number" })
    await expect(
      within(row("A4")).getByText("Couldn’t read a tracking number from this page. Enter it from the label.")
    ).toBeVisible()
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await expect(field).toHaveFocus()
    await expect(args.onSave).not.toHaveBeenCalled()

    await userEvent.type(field, "12-34")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await expect(within(row("A4")).getByText("Enter the tracking number as it’s printed on the label.")).toBeVisible()
    await userEvent.clear(field)
    await userEvent.type(field, "1z 999 aa1 01 2345 6784")
    await expect(field).not.toHaveAttribute("aria-invalid")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith(
        [{ cartonId: "A4", trackingNumber: "1Z999AA10123456784", file: 0, page: 1 }],
        [expect.objectContaining({ name: "scanned-label.pdf" })]
      )
    )
  }
})

// 10.10: dropping on a carton that has a label replaces it, and Remove clears it.
export const ReplacingALabel = meta.story({
  args: { saved: [saved("A1", 1), saved("A2", 2)] },
  play: async () => {
    const dialog = await shown()
    drag("A2", [pdf("ups-a4.pdf")], "hold")
    await expect(await within(row("A2")).findByText("Drop to replace A2’s label")).toBeVisible()
    leave("A2")
    drop("A2", [pdf("ups-a4.pdf")])
    await expect(await within(row("A2")).findByText("ups-a4.pdf")).toBeVisible()
    await expect(within(row("A2")).getByText("Tracking 1Z4F7E210393821071")).toBeVisible()

    await userEvent.click(within(dialog).getByRole("button", { name: "Remove A1’s label" }))
    await expect(within(row("A1")).getByText(/Drop a PDF or/)).toBeVisible()
    await expect(within(dialog).getByText("1 of 6 cartons have a label")).toBeVisible()
  }
})

// 10.10: more labels than cartons from where they're dropped add nothing, and the dialog says why.
export const MoreLabelsThanCartons = meta.story({
  play: async () => {
    const dialog = await shown()
    drop("A1", [pdf("ups-8.pdf")])
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You dropped 8 labels, but there are 6 cartons from A1 on. Check that they’re this shipment’s labels."
    )
    await expect(within(dialog).getByText("0 of 6 cartons have a label")).toBeVisible()
    await expect(within(row("A1")).getByText(/Drop a PDF or/)).toBeVisible()
  }
})

// 10.10: while PDFs are read, their row says so and Save waits.
export const ReadingTheLabel = meta.story({
  args: { saved: [saved("A2", 2)], readPages: () => new Promise<string[]>(() => undefined) },
  play: async () => {
    const dialog = await shown()
    drop("A1", [pdf("ups-labels.pdf")])
    await expect(await within(row("A1")).findByText("Reading ups-labels.pdf")).toBeVisible()
    drop("B1", [pdf("label-9.pdf"), pdf("label-10.pdf")])
    await expect(await within(row("B1")).findByText("Reading 2 PDFs")).toBeVisible()
    await expect(within(dialog).getByRole("button", { name: "Save labels" })).toBeDisabled()
  }
})

// A save the server turns down keeps the dialog open with its reason.
export const SaveFails = meta.story({
  args: {
    saved: [saved("A1", 1)],
    onSave: fn(async () => {
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
      reference="PO38"
      shipmentName="Shipment 1"
      cartons={cartons.slice(0, 2)}
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
    await expect(within(dialog).getByText("0 of 2 cartons have a label")).toBeVisible()
    drop("A1", [pdf("ups-b.pdf")])
    await expect(await within(dialog).findByText("ups-b.pdf, page 2")).toBeVisible()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save labels" }))
    await expect(await screen.findByText("Carrier labels sent to the supplier")).toBeVisible()
    await expect(posted).toEqual([
      {
        id: shipmentId,
        revision: "3",
        labels: [
          { cartonId: "A1", trackingNumber: "1Z4F7E210393821081", file: 0, page: 1 },
          { cartonId: "A2", trackingNumber: "1Z4F7E210393821091", file: 0, page: 2 }
        ],
        files: ["ups-b.pdf"]
      }
    ])
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})
