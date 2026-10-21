import { http, HttpResponse } from "msw/http"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { salesOrders, syncState } from "@/stories/fixtures/catalog"
import { SalesPageView } from "./sales-page"

const meta = preview.meta({
  title: "Components/Sales and costs/Sales page",
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/sales", () => HttpResponse.json({ sources: [syncState("shopify")] })),
      http.get("/api/sales/orders", () => HttpResponse.json({ orders: salesOrders, total: salesOrders.length }))
    )
})

export const Sales = meta.story({
  render: () => <SalesPageView search="#1041" />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("searchbox", { name: "Search orders" })).toHaveValue("#1041")
  }
})
