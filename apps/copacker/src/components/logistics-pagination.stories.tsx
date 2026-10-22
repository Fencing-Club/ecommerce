import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { LogisticsPagination } from "./logistics-pagination"

const meta = preview.meta({
  title: "Components/Purchase orders/Logistics pagination",
  component: LogisticsPagination,
  args: { kind: "orders" as const, page: 1, pages: 2, total: 34, size: 25, onPage: fn() }
})

// More rows than a page holds: which it shows, and the next page.
export const FirstPage = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("Showing 1–25 of 34 purchase orders")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(args.onPage).toHaveBeenCalledWith(2)
  }
})

export const LastPage = meta.story({
  args: { page: 2 },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("Showing 26–34 of 34 purchase orders")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
    await expect(args.onPage).toHaveBeenCalledWith(1)
  }
})

// A page's worth of rows only says how many.
export const OnePage = meta.story({
  args: { kind: "shipments", pages: 1, total: 1 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1 shipment")).toBeVisible()
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})
