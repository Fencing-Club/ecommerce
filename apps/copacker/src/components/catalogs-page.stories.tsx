import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { catalogRows } from "@/stories/fixtures/supplier"
import { CatalogsPageView } from "./catalogs-page"

const meta = preview.meta({})

export const Catalogs = meta.story({
  render: () => <CatalogsPageView catalogs={catalogRows} editable />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Catalogs", level: 1 })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Wholesale 2026" })).toBeVisible()
  }
})
