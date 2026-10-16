import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { customerListData } from "@/stories/fixtures/supplier"
import { CustomersPageView } from "./customers-page"

const meta = preview.meta({})

export const Customers = meta.story({
  render: () => <CustomersPageView {...customerListData} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible()
  }
})
