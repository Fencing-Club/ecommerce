import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { supplierInventory } from "@/stories/fixtures/catalog"
import { InventoryPageView } from "./inventory-page"

const meta = preview.meta({ title: "Components/Inventory/Inventory page" })

export const Inventory = meta.story({
  render: () => <InventoryPageView rows={supplierInventory} tab="short" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /Short/ })).toHaveAttribute("aria-selected", "true")
  }
})
