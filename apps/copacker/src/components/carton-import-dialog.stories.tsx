import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { cartonTotals, groupCartons, type CartonGroup } from "@/lib/carton-groups"
import { cartonColumns } from "@/lib/carton-import"
import { order, packed, shownDialog } from "@/stories/fixtures/purchase-orders"
import { CartonImportDialog } from "./carton-import-dialog"
import { CartonTable } from "./carton-table"
import { Button } from "./ui/button"

type Props = React.ComponentProps<typeof CartonImportDialog>
function ImportFlow(props: Props) {
  const [open, setOpen] = useState(props.open)
  const [groups, setGroups] = useState<CartonGroup[]>(props.existing)
  return (
    <div className="flex flex-col gap-5">
      <Button className="self-end" onClick={() => setOpen(true)}>
        Import cartons
      </Button>
      <CartonTable cartons={groups} products={props.order.items} readOnly />
      <output>{cartonTotals(groups).pieces} packed units</output>
      <CartonImportDialog
        {...props}
        open={open}
        onOpenChange={setOpen}
        existing={groups}
        onImport={async (next, mode) => {
          await props.onImport(next, mode)
          setGroups(mode === "replace" ? next : [...groups, ...next])
        }}
      />
    </div>
  )
}
const meta = preview.meta({
  title: "Components/Shipments/Carton import dialog",
  component: ImportFlow,
  args: {
    open: true,
    onOpenChange: fn(),
    order,
    shipmentName: "Shipment 1",
    existing: groupCartons(packed(1).cartons),
    availablePieces: Object.fromEntries(order.items.map((item) => [item.id, item.pieces])),
    onImport: fn(() => Promise.resolve())
  }
})
function csv(rows: string[]) {
  return new File([[cartonColumns.join(","), ...rows].join("\n")], "packing.csv", { type: "text/csv" })
}
const valid = () => csv([`D1,1,${order.items[0]!.supplierSku},20,60,40,40,12`])
async function upload(file: File) {
  const dialog = await shownDialog("Import cartons")
  const input = screen.getByRole("dialog").querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing file input")
  }
  await userEvent.upload(input, file)
  await waitFor(() => expect(dialog.getByRole("button", { name: "Review import" })).toBeEnabled())
  await userEvent.click(dialog.getByRole("button", { name: "Review import" }))
  return shownDialog("Review carton import")
}
export const Upload = meta.story({
  play: async () => {
    const dialog = await shownDialog("Import cartons")
    await expect(dialog.getByRole("button", { name: "Download template" })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Review import" })).toBeDisabled()
  }
})
export const Review = meta.story({
  play: async () => {
    const dialog = await upload(valid())
    await expect(dialog.getByRole("radio", { name: "Add cartons" })).toBeChecked()
    await expect(dialog.getByText("1 carton")).toBeVisible()
    await userEvent.click(dialog.getByRole("button", { name: /Carton D1/ }))
    await expect(dialog.getByText("60 × 40 × 40 cm / 12 kg")).toBeVisible()
  }
})
export const ImportedValues = meta.story({
  play: async ({ canvas, args }) => {
    const dialog = await upload(valid())
    await userEvent.click(dialog.getByRole("button", { name: "Import cartons" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(canvas.getByText("60 packed units")).toBeVisible()
    await expect(args.onImport).toHaveBeenCalledOnce()
    await expect(canvas.queryByText(/success/i)).toBeNull()
  }
})
export const ReplacePacking = meta.story({
  play: async ({ canvas }) => {
    const dialog = await upload(valid())
    await userEvent.click(dialog.getByRole("radio", { name: "Replace packing" }))
    await userEvent.click(dialog.getByRole("button", { name: "Replace packing" }))
    await expect(await canvas.findByText("20 packed units")).toBeVisible()
    await expect(canvas.queryByRole("region", { name: "Carton C1" })).toBeNull()
  }
})
async function showTemplateMismatch() {
  const dialog = await shownDialog("Import cartons")
  const input = screen.getByRole("dialog").querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing file input")
  }
  await userEvent.upload(input, new File(["Product,Quantity\nTote,20"], "supplier.csv", { type: "text/csv" }))
  await expect(await dialog.findByText("File doesn’t match the template")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Review import" })).toBeDisabled()
  await expect(dialog.queryByText("Choose another file")).toBeNull()
}
export const TemplateMismatch = meta.story({
  play: showTemplateMismatch
})
export const RemoveInvalidFile = meta.story({
  play: async () => {
    await showTemplateMismatch()
    const dialog = await shownDialog("Import cartons")
    await userEvent.click(dialog.getByRole("button", { name: "Remove supplier.csv" }))
    await expect(dialog.queryByRole("alert")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Review import" })).toBeDisabled()
  }
})
export const RowErrors = meta.story({
  play: async () => {
    const dialog = await upload(csv(["D1,1,UNKNOWN,20,60,40,40,12"]))
    await expect(dialog.getByText(/must match exactly one product/)).toBeVisible()
    await expect(dialog.getByText("Row 2 / Carton D1")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Import cartons" })).toBeDisabled()
    await expect(dialog.queryByRole("button", { name: "Download errors" })).toBeNull()
  }
})

export const MultipleRowErrors = meta.story({
  play: async () => {
    const dialog = await upload(
      csv([
        "D1,1,UNKNOWN,20,60,40,40,12",
        `E1,1,${order.items[0]!.supplierSku},-1,60,40,40,0`,
        `F1,1,${order.items[1]!.supplierSku},20,60,40,40,12`,
        `F1,1,${order.items[1]!.supplierSku},20,50,40,40,12`
      ])
    )
    await expect(dialog.getByText("4 issues")).toBeVisible()
    await expect(dialog.getByText("Row 5 / Carton F1")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Import cartons" })).toBeDisabled()
  }
})

export const MultipleCartons = meta.story({
  play: async () => {
    const dialog = await upload(
      csv([
        `D1,1,${order.items[0]!.supplierSku},20,60,40,40,12`,
        `D1,1,${order.items[1]!.supplierSku},10,60,40,40,12`,
        `E1,2,${order.items[2]!.supplierSku},10,50,35,30,7.8`
      ])
    )
    await expect(dialog.getByText("3 cartons")).toBeVisible()
    await expect(dialog.getByText("3 products")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Import cartons" })).toBeEnabled()
  }
})
// Amazon has set the FBA shipment's packing groups, so a carton holding two of them is an issue to fix before importing.
const [tote, apron] = order.items
export const PackingGroups = meta.story({
  args: {
    order: { ...order, destination: "amazon" },
    packingGroups: { [tote!.buyerSku]: "pg-totes", [apron!.buyerSku]: "pg-aprons" }
  },
  play: async () => {
    const dialog = await upload(
      csv([`D1,1,${tote!.supplierSku},20,60,40,40,12`, `D1,1,${apron!.supplierSku},10,60,40,40,12`])
    )
    const message = `FBA can’t take ${tote!.supplierSku} and ${apron!.supplierSku} in one carton: Amazon handles them differently, for example for dangerous goods, prep or labels`
    await expect(dialog.getByText(message)).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Import cartons" })).toBeDisabled()
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
    await userEvent.click(dialog.getByRole("button", { name: "Import cartons" }))
    const loading = within(await screen.findByRole("dialog", { name: "Import cartons" }))
    await expect(loading.getByRole("status")).toHaveTextContent("Importing cartons…")
    await expect(loading.getByRole("button", { name: "Importing…" })).toBeDisabled()
    await expect(loading.getByRole("button", { name: "Remove packing.csv" })).toBeDisabled()
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
    await userEvent.click(dialog.getByRole("button", { name: "Import cartons" }))
    const failure = await shownDialog("Import cartons")
    await expect(failure.getByRole("alert")).toHaveTextContent("Couldn’t import cartons. No changes were made.")
    await expect(failure.queryByRole("button", { name: /retry/i })).toBeNull()
    await expect(failure.getByRole("button", { name: "Remove packing.csv" })).toBeEnabled()
  }
})
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async () => {
    const dialog = await upload(valid())
    await expect(dialog.getByRole("button", { name: "Import cartons" })).toBeVisible()
  }
})
