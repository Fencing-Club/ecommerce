import { expect, fireEvent, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { dialogWidth } from "@/stories/booking"
import { agl, cartonIssue } from "./fixtures"
import { TemplateSlot, type TemplateSlotState } from "./template-slot"

const { cartons, units } = agl.start
const empty: TemplateSlotState = { status: "empty" }
const filling: TemplateSlotState = { status: "filling", progress: 66, units }
const filled: TemplateSlotState = { status: "filled", cartons, units }
const issue: TemplateSlotState = { status: "issue", issue: { ...cartonIssue, onAction: fn() } }

const meta = preview.meta({
  component: TemplateSlot,
  tags: ["vrt"],
  args: { state: empty, onFile: fn() },
  decorators: [dialogWidth]
})

const template = () =>
  new File(["template"], "PO36-Shipment-2-box-content.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })

function fileInput(canvasElement: HTMLElement) {
  const input = canvasElement.querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("The slot has no file input")
  }
  return input
}

// Drops files on an element as a browser does, with the files in the drag's data.
function drop(target: Element, files: File[]) {
  const dataTransfer = new DataTransfer()
  for (const file of files) {
    dataTransfer.items.add(file)
  }
  fireEvent(target, new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }))
  fireEvent(target, new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }))
  fireEvent(target, new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }))
}

// Empty: one button takes the template, chosen or dropped.
export const Empty = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const slot = canvas.getByRole("button", { name: "Drop the box-content template here or browse your files" })
    await expect(slot).toBeVisible()
    const chosen = template()
    await userEvent.upload(fileInput(canvasElement), chosen)
    await expect(args.onFile).toHaveBeenCalledWith(chosen)

    const dropped = template()
    drop(slot, [dropped])
    await expect(args.onFile).toHaveBeenLastCalledWith(dropped)
  }
})

// Filling: how far Copacker is through matching the template to the packing.
export const Filling = meta.story({
  args: { state: filling },
  play: async ({ canvas }) => {
    const progress = canvas.getByRole("progressbar", { name: "Filling the template" })
    await expect(progress).toHaveAttribute("aria-valuenow", "66")
    await expect(progress).toHaveAccessibleDescription("Matching 100 units")
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})

// Filled: what matched, and Replace for another template, which can also be dropped on the row.
export const Filled = meta.story({
  args: { state: filled },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getByText("Template filled")).toBeVisible()
    await expect(canvas.getByText("5 cartons and 100 units matched")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Replace" })).toHaveAccessibleDescription("Template filled")
    const replacement = template()
    await userEvent.upload(fileInput(canvasElement), replacement)
    await expect(args.onFile).toHaveBeenCalledWith(replacement)
  }
})

// The problem that stopped the template, with its fix, in the slot's place.
export const Issue = meta.story({
  args: { state: issue },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Edit carton 3" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: /Drop the box-content template/ })).toBeNull()
  }
})

// Every state at the one height, so the step never jumps as the template fills.
export const OneHeight = meta.story({
  render: (args) => (
    <div className="flex flex-col gap-3">
      {[empty, filling, filled, issue].map((state) => (
        <TemplateSlot key={state.status} state={state} onFile={args.onFile} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll<HTMLElement>("[data-slot=template-slot]")].map(
      (slot) => slot.offsetHeight
    )
    await expect(heights).toHaveLength(4)
    await expect(new Set(heights).size).toBe(1)
  }
})
