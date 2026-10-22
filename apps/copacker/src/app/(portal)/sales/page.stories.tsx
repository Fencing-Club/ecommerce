import { http, HttpResponse } from "msw/http"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { salesSearch } from "@/lib/page-search"
import { salesOrders, syncState } from "@/stories/fixtures/catalog"
import { pageStory } from "@/stories/server"
import { member } from "@/stories/workspace"
import PageView from "./page"

// The page with the URL's ?q=, read as the route reads it.
function SalesPage({ q }: { q?: string | string[] }) {
  return <PageView search={salesSearch.parse({ q })} />
}

// The orders API's queries, in order.
let queries: Record<string, string>[] = []

const meta = preview.meta({
  title: "Pages/Sales",
  ...pageStory("/sales", SalesPage, "buyer"),
  args: {},
  beforeEach: ({ msw }) => {
    queries = []
    msw.use(
      http.get("/api/sales", () => HttpResponse.json({ sources: [syncState("shopify"), syncState("amazon")] })),
      http.get("/api/sales/orders", ({ request }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json({ orders: salesOrders, total: salesOrders.length })
      })
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("heading", { level: 1, name: "Sales" })).toBeVisible()
    await expect(await page.findByRole("table", { name: "Orders" })).toBeVisible()
    await expect(page.getByRole("list", { name: "Sources" })).toBeVisible()
    await expect(queries).toEqual([{ page: "0" }])
  }
})

// A header search for an order number opens the list filtered to it.
export const FromSearch = meta.story({
  args: { q: "  #1041 " },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(await page.findByRole("searchbox", { name: "Search orders" })).toHaveValue("#1041")
    await page.findByRole("table", { name: "Orders" })
    await expect(queries).toEqual([{ q: "#1041", page: "0" }])
  }
})

// A member without prices sees orders without sales and fees.
export const ForMember = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    const table = await page.findByRole("table", { name: "Orders" })
    await expect(within(table).queryByRole("columnheader", { name: "Sales" })).toBeNull()
  }
})
