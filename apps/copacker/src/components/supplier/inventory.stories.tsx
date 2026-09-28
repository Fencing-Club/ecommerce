import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { http, HttpResponse } from "msw"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { inventoryRows } from "@/stories/fixtures/supplier"
import { member } from "@/stories/workspace"
import { InventoryTable } from "./inventory"

// What the table sent: counts saved, and switches turned.
const counted = fn()
const tracked = fn()

const meta = preview.meta({
  component: InventoryTable,
  args: { rows: inventoryRows },
  beforeEach: ({ msw }) => {
    counted.mockClear()
    tracked.mockClear()
    msw.use(
      http.post("/api/supplier-catalog/stock", async ({ request }) => {
        counted(await request.json())
        return HttpResponse.json({ ok: true })
      }),
      http.post("/api/supplier-catalog/tracking", async ({ request }) => {
        tracked(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

const [natural, black, apron, basket] = inventoryRows
const rowOf = (sku: string) => within(screen.getByText(sku, { selector: "td" }).closest("tr")!)
const saveBar = () => within(screen.getByRole("region", { name: "Unsaved changes" }))

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /All\s*4/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("tab", { name: /Short\s*1/ })).toBeVisible()
    const tote = rowOf("LM-TOTE-NAT")
    await expect(tote.getByRole("link", { name: "Canvas tote bag" })).toHaveAttribute(
      "href",
      `/products/${natural!.groupId}`
    )
    await expect(tote.getByText("Natural")).toBeVisible()
    await expect(tote.getByRole("spinbutton", { name: "On hand for LM-TOTE-NAT" })).toHaveValue(120)
    await expect(tote.getByRole("cell", { name: "80" })).toBeVisible()
    await expect(tote.getByRole("cell", { name: "40" })).toBeVisible()
    // Black is ordered past what's on hand.
    await expect(rowOf("LM-TOTE-BLK").getByRole("cell", { name: "-24" })).toHaveClass("text-destructive")
    await expect(rowOf("LM-APRON").getByRole("switch", { name: "Continue selling for LM-APRON" })).toBeChecked()
    const untracked = rowOf("LM-BASKET")
    await expect(untracked.getByText("Not tracked")).toBeVisible()
    await expect(untracked.getByRole("switch", { name: "Track inventory for LM-BASKET" })).not.toBeChecked()
    await expect(untracked.queryByRole("spinbutton")).toBeNull()
    await expect(untracked.queryByRole("switch", { name: /Continue selling/ })).toBeNull()
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    // A product without a photo keeps the photo's frame, empty.
    const photoIn = (sku: string) => screen.getByText(sku, { selector: "td" }).closest("tr")!.querySelector("img")
    await expect(photoIn("LM-TOTE-NAT")).not.toBeNull()
    await expect(photoIn("LM-BASKET")).toBeNull()
  }
})

export const EditCounts = meta.story({
  play: async ({ canvas }) => {
    const tote = canvas.getByRole("spinbutton", { name: "On hand for LM-TOTE-NAT" })
    await userEvent.clear(tote)
    await userEvent.type(tote, "125")
    // The change shows beside the count, and what's available follows it.
    await expect(rowOf("LM-TOTE-NAT").getByText("+5")).toBeVisible()
    await expect(rowOf("LM-TOTE-NAT").getByText("from 120")).toHaveClass("sr-only")
    await expect(rowOf("LM-TOTE-NAT").getByRole("cell", { name: "45" })).toBeVisible()
    await expect(saveBar().getByText("1 unsaved change")).toBeVisible()
    const blackCount = canvas.getByRole("spinbutton", { name: "On hand for LM-TOTE-BLK" })
    await userEvent.clear(blackCount)
    await userEvent.type(blackCount, "30")
    await expect(rowOf("LM-TOTE-BLK").getByText("−10")).toBeVisible()
    await expect(saveBar().getByText("2 unsaved changes")).toBeVisible()
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(counted).toHaveBeenCalledWith({
        counts: [
          { id: natural!.id, onHand: 125 },
          { id: black!.id, onHand: 30 }
        ]
      })
    )
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull())
  }
})

export const NotAWholeNumber = meta.story({
  play: async ({ canvas }) => {
    const count = canvas.getByRole("spinbutton", { name: "On hand for LM-APRON" })
    await userEvent.clear(count)
    await userEvent.type(count, "2.5")
    await expect(count).toHaveAttribute("aria-invalid", "true")
    await expect(saveBar().getByText("Enter whole numbers to save")).toBeVisible()
    await expect(saveBar().getByRole("button", { name: "Save" })).toBeDisabled()
    // Escape puts the count back.
    await userEvent.keyboard("{Escape}")
    await expect(count).toHaveValue(0)
    await expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const Discard = meta.story({
  play: async ({ canvas }) => {
    const count = canvas.getByRole("spinbutton", { name: "On hand for LM-TOTE-BLK" })
    await userEvent.clear(count)
    await userEvent.type(count, "64")
    await userEvent.click(saveBar().getByRole("button", { name: "Discard" }))
    await expect(count).toHaveValue(40)
    await expect(counted).not.toHaveBeenCalled()
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/supplier-catalog/stock", () =>
        HttpResponse.json({ error: "LM-TOTE-NAT changed since you opened this page." }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    const count = canvas.getByRole("spinbutton", { name: "On hand for LM-TOTE-NAT" })
    await userEvent.clear(count)
    await userEvent.type(count, "90")
    await userEvent.click(saveBar().getByRole("button", { name: "Save" }))
    await expect(await saveBar().findByText("LM-TOTE-NAT changed since you opened this page.")).toBeVisible()
    // The count stays as typed, to save again.
    await expect(count).toHaveValue(90)
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  }
})

export const TurnOnTracking = meta.story({
  play: async () => {
    await userEvent.click(rowOf("LM-BASKET").getByRole("switch", { name: "Track inventory for LM-BASKET" }))
    await waitFor(() => expect(tracked).toHaveBeenCalledWith({ id: basket!.id, trackInventory: true }))
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
    await userEvent.click(rowOf("LM-APRON").getByRole("switch", { name: "Continue selling for LM-APRON" }))
    await waitFor(() => expect(tracked).toHaveBeenCalledWith({ id: apron!.id, continueSelling: false }))
  }
})

export const TrackingFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.post("/api/supplier-catalog/tracking", () => HttpResponse.json({}, { status: 500 })))
  },
  play: async () => {
    const toggle = rowOf("LM-TOTE-BLK").getByRole("switch", { name: "Track inventory for LM-TOTE-BLK" })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute("aria-invalid", "true"))
    await expect(getRouter().refresh).not.toHaveBeenCalled()
  }
})

export const Tabs = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /Short\s*1/ }))
    await expect(canvas.getAllByRole("row")).toHaveLength(2)
    await expect(canvas.getByText("LM-TOTE-BLK", { selector: "td" })).toBeVisible()
    await userEvent.click(canvas.getByRole("tab", { name: /Not tracked\s*1/ }))
    await expect(canvas.getByText("LM-BASKET", { selector: "td" })).toBeVisible()
    await userEvent.click(canvas.getByRole("tab", { name: /Tracked\s*3/ }))
    await expect(canvas.getAllByRole("row")).toHaveLength(4)
  }
})

export const OpensOnShort = meta.story({
  args: { initialTab: "short" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /Short\s*1/ })).toHaveAttribute("aria-selected", "true")
  }
})

export const Search = meta.story({
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search by product or SKU" }), "apron")
    await expect(canvas.getAllByRole("row")).toHaveLength(2)
    await userEvent.clear(canvas.getByRole("searchbox"))
    await userEvent.type(canvas.getByRole("searchbox"), "black")
    await expect(canvas.getByText("LM-TOTE-BLK", { selector: "td" })).toBeVisible()
    await userEvent.type(canvas.getByRole("searchbox"), "x")
    await expect(canvas.getByText("Nothing here")).toBeVisible()
  }
})

// A member who views inventory sees each count, without fields or switches to change them.
export const ViewOnly = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("spinbutton")).toBeNull()
    await expect(rowOf("LM-TOTE-NAT").getByText("120")).toBeVisible()
    for (const toggle of canvas.getAllByRole("switch")) {
      await expect(toggle).toHaveAttribute("aria-disabled", "true")
    }
  }
})

export const Empty = meta.story({
  args: { rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No products yet")).toBeVisible()
    await expect(canvas.getByText("Add products to count their stock here.")).toBeVisible()
  }
})
