import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { QuantityDisplay } from "./quantity-display"
import { Input } from "./ui/input"

const meta = preview.meta({
  title: "Components/Display/Quantity display",
  component: QuantityDisplay,
  args: { pieces: 60, packSize: 2, children: <Input aria-label="Quantity" defaultValue={60} className="text-end" /> },
  decorators: [
    (Story) => (
      <div className="w-24">
        <Story />
      </div>
    )
  ]
})
export const Units = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("30 packs, 2 each")).toBeVisible()
  }
})
export const Packs = meta.story({
  args: { basis: "packs", children: <Input aria-label="Quantity" defaultValue={30} className="text-end" /> },
  play: async ({ canvas }) => {
    const field = canvas.getByRole("textbox", { name: "Quantity" })
    const size = canvas.getByText("2 per pack")
    const total = canvas.getByText("60 units")
    await expect(size.getBoundingClientRect().top).toBeGreaterThanOrEqual(field.getBoundingClientRect().bottom)
    await expect(total.getBoundingClientRect().top).toBeGreaterThan(size.getBoundingClientRect().top)
  }
})
export const SingleUnit = meta.story({
  args: { packSize: 1 },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/packs, \d+ each|per pack|units/)).toBeNull()
  }
})
export const InvalidQuantity = meta.story({
  args: { pieces: 3 },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/packs, \d+ each/)).toBeNull()
  }
})
export const ReadOnly = meta.story({
  args: { basis: "packs", children: <span>30</span> },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("60 units")).toBeVisible()
    await expect(canvas.queryByRole("textbox")).toBeNull()
  }
})

export const MillionPacks = meta.story({
  args: {
    pieces: 2000000,
    basis: "packs",
    children: <Input aria-label="Quantity" defaultValue={1000000} className="text-end" />
  },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Quantity" })
    await expect(input).toHaveValue("1000000")
    await expect(input.getBoundingClientRect().width).toBe(96)
    await expect(canvas.getByText("2,000,000 units")).toBeVisible()
  }
})
