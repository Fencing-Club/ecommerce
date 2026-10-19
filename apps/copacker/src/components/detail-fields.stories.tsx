import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { DetailFields } from "./detail-fields"
const meta = preview.meta({
  title: "Unused/Display/Detail fields",
  component: DetailFields,
  args: {
    items: [
      { label: "Cartons", value: "18" },
      { label: "Gross weight", value: "230.8 kg" },
      { label: "Volume", value: "1.79 m\u00b3" }
    ]
  }
})
export const ShipmentSummary = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Cartons").tagName).toBe("DT")
    await expect(canvas.getByText("18").tagName).toBe("DD")
    await expect(canvas.getByText("1.79 m\u00b3")).toBeVisible()
  }
})
export const TermsAndCurrency = meta.story({
  args: {
    className: "grid-cols-2",
    items: [
      { label: "Terms", value: "Net 30" },
      { label: "Currency", value: "USD $" }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Net 30")).toBeVisible()
    await expect(canvas.getByText("USD $")).toBeVisible()
  }
})
