import { http, HttpResponse } from "msw"
import { getTranslations } from "next-intl/server"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PageHeader } from "@/components/common"
import { SalesOrders } from "@/components/sales-orders"
import { salesOrders, syncState } from "@/stories/fixtures/catalog"
import { pageStory } from "@/stories/server"
import { member } from "@/stories/workspace"

// A buyer's Orders page (page.tsx). `q` starts the list filtered, such as a header search for an order number, up to
// the 100 characters the orders API takes. Other workspaces are redirected to Purchase orders.
async function SalesPage({ q: raw }: { q?: string | string[] }) {
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 100)
  const t = await getTranslations("sales")
  return (
    <>
      <PageHeader title={t("title")} />
      <SalesOrders initialSearch={q} />
    </>
  )
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
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible()
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
