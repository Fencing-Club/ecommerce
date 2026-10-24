import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { useState } from "react"
import { expect, fn, screen, spyOn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { expandCartonGroups, groupCartons, palletCartons, type PalletValue } from "@/lib/carton-groups"
import { palletColumns } from "@/lib/pallet-import"
import { towelOrder, towelPacking } from "@/stories/fixtures/packing"
import { shownDialog } from "@/stories/play"
import { PalletImportDialog } from "./pallet-import-dialog"
import { PalletTable } from "./pallet-table"

// PO38's cartons: A1–A10, B1–B6 and C1–C2.
const groups = groupCartons(towelPacking().cartons)
const cartons = palletCartons(groups, towelOrder.items)
const cartonIds = expandCartonGroups(groups).map((carton) => carton.cartonId)

// The dialog with the pallets it fills, shown read-only beneath its button as the packing form shows them.
type Props = React.ComponentProps<typeof PalletImportDialog>
function ImportFlow(props: Props) {
  const [open, setOpen] = useState(props.open)
  const [pallets, setPallets] = useState<PalletValue[]>(props.existing)
  return (
    <div className="flex flex-col gap-5">
      <Button className="self-end" onClick={() => setOpen(true)}>
        Import pallets
      </Button>
      {pallets.length > 0 && <PalletTable pallets={pallets} cartons={cartons} readOnly />}
      <output>Pallets: {pallets.length}</output>
      <PalletImportDialog
        {...props}
        open={open}
        onOpenChange={setOpen}
        existing={pallets}
        onImport={async (next, mode) => {
          await props.onImport(next, mode)
          setPallets(mode === "replace" ? next : [...pallets, ...next])
        }}
      />
    </div>
  )
}
const meta = preview.meta({
  title: "Components/Shipments/Pallet import dialog",
  component: ImportFlow,
  args: {
    open: true,
    onOpenChange: fn(),
    reference: "PO38",
    shipmentName: "Shipment 1",
    cartonIds,
    existing: [],
    onImport: fn(() => Promise.resolve())
  }
})

function csv(rows: string[]) {
  return new File([[palletColumns.join(","), ...rows].join("\n")], "Pallets-PO38.csv", { type: "text/csv" })
}
// The three pallets of board 11.14, which hold every carton.
const valid = () =>
  csv([
    "1,120,100,75,68,Stackable,A1–A6",
    '2,120,100,75,51,Stackable,"A7–A10, B1"',
    '3,120,100,60,53,Not stackable,"B2–B6, C1–C2"'
  ])
const existing: PalletValue[] = [
  { palletId: "1", length: 120, width: 100, height: 175, weight: 300, stackable: true, cartonIds: cartonIds }
]
async function upload(file: File) {
  const dialog = await shownDialog("Import pallets")
  const input = screen.getByRole("dialog").querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing file input")
  }
  await userEvent.upload(input, file)
  await waitFor(() => expect(dialog.getByRole("button", { name: "Review import" })).toBeEnabled())
  await userEvent.click(dialog.getByRole("button", { name: "Review import" }))
  return shownDialog("Review pallet import")
}

// Board 11.13: download the template, then choose a file.
export const Upload = meta.story({
  play: async () => {
    const dialog = await shownDialog("Import pallets")
    await expect(dialog.getByText("PO38 / Shipment 1")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Download template" })).toBeVisible()
    await expect(dialog.getByText("XLSX or CSV, up to 10 MB")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Review import" })).toBeDisabled()
  }
})

// The template is named for the order and shipment, like the app's other downloads, so it's easy to find later.
export const DownloadTemplate = meta.story({
  play: async () => {
    const downloads: string[] = []
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })
    try {
      const dialog = await shownDialog("Import pallets")
      await userEvent.click(dialog.getByRole("button", { name: "Download template" }))
      await waitFor(() => expect(downloads).toEqual(["Pallet template - PO38 - Shipment 1.xlsx"]))
    } finally {
      click.mockRestore()
    }
  }
})

// Board 11.14: the file's pallets with their totals, to add to the pallets there or replace them.
export const Review = meta.story({
  args: { existing },
  play: async () => {
    const dialog = await upload(valid())
    await expect(dialog.getByRole("radio", { name: "Add pallets" })).toBeChecked()
    await userEvent.click(dialog.getByRole("radio", { name: "Replace pallets" }))
    await expect(dialog.getByText("3 pallets")).toBeVisible()
    await expect(dialog.getByText("18 cartons")).toBeVisible()
    await expect(dialog.getByText("172 kg")).toBeVisible()
    const rows = within(dialog.getByRole("list", { name: "Pallets" })).getAllByRole("listitem")
    await expect(rows).toHaveLength(3)
    await expect(rows[1]).toHaveTextContent("Pallet 2")
    await expect(rows[1]).toHaveTextContent("Cartons A7–A10, B1")
    await expect(rows[1]).toHaveTextContent("120 × 100 × 75 cm")
    await expect(rows[2]).toHaveTextContent("53 kg / Not stackable")
    await expect(dialog.getByRole("button", { name: "Replace pallets" })).toBeEnabled()
  }
})

export const ImportedValues = meta.story({
  play: async ({ canvas, args }) => {
    const dialog = await upload(valid())
    await expect(dialog.queryByRole("radiogroup")).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: "Import pallets" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByText("Pallets: 3")).toBeVisible()
    await expect(canvas.getByRole("region", { name: "Pallet 3" })).toHaveTextContent("Not stackable")
    await expect(args.onImport).toHaveBeenCalledWith(
      [
        expect.objectContaining({ palletId: "1", cartonIds: ["A1", "A2", "A3", "A4", "A5", "A6"] }),
        expect.objectContaining({ palletId: "2", weight: 51 }),
        expect.objectContaining({ palletId: "3", stackable: false })
      ],
      "add"
    )
  }
})

export const ReplacePallets = meta.story({
  args: { existing },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Pallets: 1")).toBeVisible()
    const dialog = await upload(valid())
    await userEvent.click(dialog.getByRole("radio", { name: "Replace pallets" }))
    await userEvent.click(dialog.getByRole("button", { name: "Replace pallets" }))
    await expect(await canvas.findByText("Pallets: 3")).toBeVisible()
  }
})

// Adding the 07.14 file to a shipment whose Pallet 1 already holds every carton. Each of the file's pallets says what
// it clashes with, by its row, rather than carton by carton, and the line above points to Replace, which clears them.
export const AddConflicts = meta.story({
  args: { existing },
  play: async () => {
    const dialog = await upload(valid())
    const issues = within(dialog.getByRole("alert"))
    await expect(issues.getByText("4 issues")).toBeVisible()
    await expect(
      issues.getByText(
        "These pallets clash with the pallet already on this shipment. Choose Replace pallets to use only the file’s pallets."
      )
    ).toBeVisible()
    const items = issues.getAllByRole("listitem")
    for (const [index, [location, message]] of [
      ["Row 2 / Pallet 1", "There’s already a Pallet 1. Give this one another ID."],
      ["Row 2 / Pallet 1", "Cartons A1–A6 are already on Pallet 1."],
      ["Row 3 / Pallet 2", "Cartons A7–A10, B1 are already on Pallet 1."],
      ["Row 4 / Pallet 3", "Cartons B2–B6, C1–C2 are already on Pallet 1."]
    ].entries()) {
      await expect(items[index]).toHaveTextContent(location!)
      await expect(items[index]).toHaveTextContent(message!)
    }
    await expect(dialog.getByRole("button", { name: "Import pallets" })).toBeDisabled()
    await userEvent.click(dialog.getByRole("radio", { name: "Replace pallets" }))
    await expect(dialog.queryByRole("alert")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Replace pallets" })).toBeEnabled()
  }
})

// Board 11.15: each row's issues, by row and pallet. The file's own issues hide the choice to add or replace.
export const RowErrors = meta.story({
  args: { existing },
  play: async () => {
    const dialog = await upload(
      csv([
        "1,120,100,75,68,Yes,A1–A6",
        '2,120,100,75,51,Stackable,"A6–A10, B1"',
        '3,120,100,60,53,Not stackable,"B2–B6, D1"'
      ])
    )
    await expect(dialog.getByText("3 issues")).toBeVisible()
    await expect(dialog.getByText("Row 2 / Pallet 1")).toBeVisible()
    await expect(dialog.getByText("Enter Stackable or Not stackable.")).toBeVisible()
    await expect(dialog.getByText("Row 3 / Pallet 2")).toBeVisible()
    await expect(dialog.getByText("Carton A6 is also on Pallet 1. Put each carton on one pallet.")).toBeVisible()
    await expect(dialog.getByText("Row 4 / Pallet 3")).toBeVisible()
    await expect(dialog.getByText("Carton D1 isn’t in this shipment.")).toBeVisible()
    await expect(dialog.queryByRole("radiogroup")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Import pallets" })).toBeDisabled()
  }
})

export const TemplateMismatch = meta.story({
  play: async () => {
    const dialog = await shownDialog("Import pallets")
    const input = screen.getByRole("dialog").querySelector("input[type=file]")
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing file input")
    }
    await userEvent.upload(input, new File(["Pallet,Cartons\n1,A1"], "pallets.csv", { type: "text/csv" }))
    await expect(await dialog.findByText("File doesn’t match the template")).toBeVisible()
    await expect(dialog.getByText(/Missing columns:/)).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Review import" })).toBeDisabled()
  }
})

export const Loading = meta.story({
  args: {
    onImport: fn(
      () =>
        new Promise<void>(() => {
          /* This story deliberately stays in the loading state. */
        })
    )
  },
  play: async () => {
    const dialog = await upload(valid())
    await userEvent.click(dialog.getByRole("button", { name: "Import pallets" }))
    const loading = await shownDialog("Import pallets")
    await expect(loading.getByRole("status")).toHaveTextContent("Importing pallets…")
    await expect(loading.getByRole("button", { name: "Importing…" })).toBeDisabled()
  }
})

export const Failure = meta.story({
  args: {
    onImport: fn(async () => {
      throw new Error("Import failed")
    })
  },
  play: async () => {
    const dialog = await upload(valid())
    await userEvent.click(dialog.getByRole("button", { name: "Import pallets" }))
    const failure = await shownDialog("Import pallets")
    await expect(failure.getByRole("alert")).toHaveTextContent("Couldn’t import pallets. No changes were made.")
    await expect(failure.getByRole("button", { name: "Remove Pallets-PO38.csv" })).toBeEnabled()
  }
})
