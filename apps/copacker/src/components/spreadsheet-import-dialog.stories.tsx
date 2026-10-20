import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownDialog } from "@/stories/fixtures/purchase-orders"
import { type ImportMode, SpreadsheetImportDialog } from "./spreadsheet-import-dialog"

// A file of names, a name to a line under a Name header, imported beside the names already there.
const existing = ["Tote"]
async function read(file: File) {
  const [header, ...names] = (await file.text()).split("\n")
  return { templateMatches: header === "Name", names }
}
function check({ templateMatches, names }: Awaited<ReturnType<typeof read>>, mode: ImportMode) {
  return {
    templateMatches,
    fileIssues: names.flatMap((name, index) =>
      name ? [] : [{ location: `Row ${index + 2}`, message: "Enter a name." }]
    ),
    issues: names
      .filter((name) => mode === "add" && existing.includes(name))
      .map((name) => ({ location: name, message: "This name is already there." })),
    rows: names.length
  }
}
const meta = preview.meta({
  title: "Components/Shipments/Spreadsheet import dialog",
  component: SpreadsheetImportDialog<Awaited<ReturnType<typeof read>>>,
  args: {
    open: true,
    onOpenChange: fn(),
    reference: "PO38",
    shipmentName: "Shipment 1",
    text: {
      title: "Import names",
      review: "Review import",
      reviewTitle: "Review name import",
      failed: "Couldn’t import names. No changes were made.",
      add: "Add names",
      replace: "Replace names",
      import: "Import names",
      importing: "Importing names…"
    },
    hasExisting: true,
    read,
    check,
    template: { title: "Name template", build: async () => new Blob(["Name"]) },
    renderReview: ({ names }) => <p>{names.join(", ")}</p>,
    onImport: fn(() => Promise.resolve())
  }
})

async function upload(lines: string[]) {
  const dialog = await shownDialog("Import names")
  const input = screen.getByRole("dialog").querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing file input")
  }
  await userEvent.upload(input, new File([lines.join("\n")], "names.csv", { type: "text/csv" }))
  await waitFor(() => expect(dialog.getByRole("button", { name: "Review import" })).toBeEnabled())
  await userEvent.click(dialog.getByRole("button", { name: "Review import" }))
  return shownDialog("Review name import")
}

export const Review = meta.story({
  play: async ({ args }) => {
    const dialog = await upload(["Name", "Bag", "Towel"])
    await expect(dialog.getByText("Bag, Towel")).toBeVisible()
    await expect(dialog.getByRole("radio", { name: "Add names" })).toBeChecked()
    await userEvent.click(dialog.getByRole("button", { name: "Import names" }))
    await waitFor(() => expect(args.onImport).toHaveBeenCalledWith(expect.anything(), "add"))
  }
})

// Issues from adding to what's there keep the choice, so replacing can clear them.
export const AddIssuesKeepTheChoice = meta.story({
  play: async ({ args }) => {
    const dialog = await upload(["Name", "Tote"])
    await expect(dialog.getByText("This name is already there.")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Import names" })).toBeDisabled()
    await userEvent.click(dialog.getByRole("radio", { name: "Replace names" }))
    await expect(dialog.queryByRole("alert")).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: "Replace names" }))
    await waitFor(() => expect(args.onImport).toHaveBeenCalledWith(expect.anything(), "replace"))
  }
})

// The file's own issues hide the choice: replacing wouldn't fix them.
export const FileIssuesHideTheChoice = meta.story({
  play: async () => {
    const dialog = await upload(["Name", "Bag", ""])
    await expect(dialog.getByText("Row 3")).toBeVisible()
    await expect(dialog.getByText("Enter a name.")).toBeVisible()
    await expect(dialog.queryByRole("radiogroup")).toBeNull()
    await expect(dialog.getByRole("button", { name: "Import names" })).toBeDisabled()
  }
})

// A long list of issues scrolls inside its box, so the title, file and buttons stay in view.
export const LongIssueList = meta.story({
  play: async () => {
    const dialog = await upload(["Name", ...Array.from({ length: 30 }, () => "")])
    const box = screen.getByRole("dialog")
    const issues = dialog.getByRole("list", { name: "30 issues" })
    await expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1)
    await expect(issues.scrollHeight).toBeGreaterThan(issues.clientHeight)
    await expect(dialog.getByRole("button", { name: "Back" })).toBeVisible()
    const last = dialog.getByText("Row 31")
    last.scrollIntoView()
    await expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(issues.getBoundingClientRect().bottom + 1)
  }
})

export const TemplateMismatch = meta.story({
  play: async () => {
    const dialog = await shownDialog("Import names")
    const input = screen.getByRole("dialog").querySelector("input[type=file]")
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing file input")
    }
    await userEvent.upload(input, new File(["Product\nBag"], "names.csv", { type: "text/csv" }))
    await expect(await dialog.findByText("File doesn’t match the template")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Review import" })).toBeDisabled()
  }
})
