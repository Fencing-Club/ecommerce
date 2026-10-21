import { http, HttpResponse } from "msw/http"
import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import type { InventoryRow } from "@/server/supplier-workspace"
import { supplierInventory } from "@/stories/fixtures/catalog"
import { pageStory } from "@/stories/server"
import PageView from "./page"

function InventoryPage({ rows, tab }: { rows: InventoryRow[]; tab?: string }) {
  return <PageView page={{ rows: rows, tab: tab }} />
}

// The counts each story saved.
let counts: unknown[] = []

const meta = preview.meta({
  title: "Pages/Inventory",
  ...pageStory("/inventory", InventoryPage, "supplier"),
  args: { rows: supplierInventory },
  beforeEach: ({ msw }) => {
    counts = []
    msw.use(
      http.post("/api/supplier-catalog/stock", async ({ request }) => {
        counts.push(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Inventory" })).toBeVisible()
    await expect(canvas.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "true")
    const onHand = canvas.getByRole("spinbutton", { name: "On hand for LM-TOTE-001" })
    await userEvent.clear(onHand)
    await userEvent.type(onHand, "1500")
    await expect(canvas.getByText("1 unsaved change")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
    await expect(counts).toEqual([{ counts: [{ id: supplierInventory[0]!.id, onHand: 1500 }] }])
  }
})

// A link to the short variants opens on their tab.
export const ShortTab = meta.story({
  args: { tab: "short" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /Short/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByText("Black")).toBeInTheDocument()
    await expect(canvas.queryByText("Natural")).toBeNull()
  }
})

export const Empty = meta.story({
  args: { rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No products yet")).toBeVisible()
  }
})

// A member who views inventory sees each count without a field to change it.
export const ViewOnly = meta.story({
  parameters: { permissions: { role: "member", access: { inventory: "view" } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1,200")).toBeInTheDocument()
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
  }
})
