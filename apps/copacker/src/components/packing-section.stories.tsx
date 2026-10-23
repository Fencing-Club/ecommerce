import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PackingActions, PackingEmpty, PackingSection } from "./packing-section"

const actions = () => ({ onAdd: fn(), onImport: fn(), onExport: fn() })
const labels = { add: "Add carton", import: "Import cartons", export: "Export cartons" }

const meta = preview.meta({
  title: "Components/Shipments/Packing section",
  component: PackingSection,
  args: {
    title: "Cartons",
    summary: "300 of 420 units",
    children: <p className="text-sm">The section’s rows.</p>
  },
  argTypes: { children: { control: false }, actions: { control: false } }
})

// Products, Cartons and Pallets share it: a chevron before the title that closes and opens the rows, the summary beside
// the title, and the actions at the end of the line.
export const Default = meta.story({
  args: { actions: <PackingActions actions={actions()} labels={labels} /> },
  play: async ({ canvas }) => {
    const section = within(canvas.getByRole("region", { name: "Cartons" }))
    const toggle = section.getByRole("button", { name: "Cartons" })
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await expect(section.getByText("300 of 420 units")).toBeVisible()
    await expect(section.getByRole("button", { name: "Export cartons" })).toBeVisible()
    await userEvent.click(toggle)
    await expect(section.queryByText("The section’s rows.")).toBeNull()
    await expect(section.getByText("300 of 420 units")).toBeVisible()
  }
})

// Everything in place turns the summary green.
export const Done = meta.story({
  args: { summary: "420 of 420 units", done: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("420 of 420 units")).toBeVisible()
  }
})

// Products start closed.
export const Closed = meta.story({
  args: { title: "Products", summary: "3 products, 120 units left", defaultOpen: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Products" })).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByText("The section’s rows.")).toBeNull()
  }
})

// With no rows, the first actions sit in the empty box, named, and the section's line has none.
export const Empty = meta.story({
  args: {
    summary: "0 of 420 units",
    children: (
      <PackingEmpty
        title="No cartons yet"
        description="Add a carton and set Count for identical ones, or import a spreadsheet."
      >
        <PackingActions empty actions={actions()} labels={labels} />
      </PackingEmpty>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No cartons yet")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Add carton" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Import cartons" })).toBeVisible()
    await expect(canvas.queryByRole("button", { name: "Export cartons" })).toBeNull()
  }
})

// On a phone the title grows, the summary moves under it, and Add keeps only its icon.
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { actions: <PackingActions actions={actions()} labels={labels} /> },
  play: async ({ canvas }) => {
    const title = canvas.getByRole("heading", { name: "Cartons" })
    const summary = canvas.getByText("300 of 420 units")
    await expect(summary.getBoundingClientRect().top).toBeGreaterThan(title.getBoundingClientRect().top)
    const add = canvas.getByRole("button", { name: "Add carton" }).getBoundingClientRect()
    await expect(add.width).toBe(add.height)
  }
})
