import { http, HttpResponse } from "msw"
import { getTranslations } from "next-intl/server"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PageHeader } from "@/components/common"
import { RestockReport } from "@/components/restock-report"
import { restockSettings } from "@/server/restock-report"
import { restockChannels, restockReport, suppliers } from "@/stories/fixtures/catalog"
import { pageStory } from "@/stories/server"

type Org = { restockSalesDays: number | null; restockLeadTimeDays: number | null }

// A buyer's Restock page (page.tsx), starting from the workspace's sales period and lead time. Other workspaces are
// redirected to Purchase orders.
async function RestockPage({ org }: { org: Org }) {
  const t = await getTranslations("restock")
  return (
    <>
      <PageHeader title={t("title")} />
      <RestockReport settings={restockSettings(org)} />
    </>
  )
}

// The plans each story asked for.
let plans: unknown[] = []
const loaded = { timeout: 4000 }

const meta = preview.meta({
  title: "Pages/Restock",
  ...pageStory("/restock", RestockPage, "buyer"),
  args: { org: { restockSalesDays: null, restockLeadTimeDays: null } },
  beforeEach: ({ msw }) => {
    plans = []
    localStorage.removeItem("restock-channel")
    localStorage.removeItem("restock-supplier")
    msw.use(
      http.get("/api/restock/channels", () => HttpResponse.json(restockChannels)),
      http.get("/api/restock/suppliers", () => HttpResponse.json(suppliers)),
      http.post("/api/restock/plan", async ({ request }) => {
        plans.push(await request.json())
        return HttpResponse.json(restockReport())
      })
    )
  }
})

// Without settings of its own, the workspace starts from 60 days of sales and a 60-day lead time.
export const Default = meta.story({
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("heading", { name: "Restock" })).toBeVisible()
    await expect(page.getByRole("spinbutton", { name: "Sales period" })).toHaveValue(60)
    await expect(await page.findByRole("region", { name: "Lotus Manufacturing" }, loaded)).toBeVisible()
    await expect(plans).toEqual([{ days: 60, leadTimeDays: 60, channel: { kind: "amazon" }, supplier: "all" }])
  }
})

export const WorkspaceSettings = meta.story({
  args: { org: { restockSalesDays: 90, restockLeadTimeDays: 30 } },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await expect(page.getByRole("spinbutton", { name: "Lead time" })).toHaveValue(30)
    await page.findByRole("region", { name: "Lotus Manufacturing" }, loaded)
    await expect(plans).toEqual([{ days: 90, leadTimeDays: 30, channel: { kind: "amazon" }, supplier: "all" }])
  }
})

// A member without prices sees quantities only.
export const ForMember = meta.story({
  parameters: { permissions: { role: "member", access: { restock: "view" } } },
  play: async ({ canvas }) => {
    const page = within(canvas.getByRole("main"))
    await page.findByRole("region", { name: "Lotus Manufacturing" }, loaded)
    await expect(page.queryByText("Estimated cost")).toBeNull()
  }
})
