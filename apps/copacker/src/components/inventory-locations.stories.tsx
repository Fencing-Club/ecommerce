import { delay, http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { inventoryLocations } from "@/stories/fixtures/logistics"
import { DetailRow, InventoryLocations } from "./inventory-locations"

// The locations each save sent, in order.
const saved: unknown[] = []

const meta = preview.meta({
  title: "Components/Inventory/Inventory locations",
  component: InventoryLocations,
  beforeEach: ({ msw }) => {
    saved.length = 0
    msw.use(
      http.get("/api/inventory/locations", () => HttpResponse.json(inventoryLocations)),
      http.patch("/api/inventory/locations", async ({ request }) => {
        saved.push(await request.json())
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

export const Locations = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Portland warehouse")).toBeVisible()
    await expect(canvas.getByRole("heading", { name: "Inventory locations" })).toBeVisible()
  }
})

// Ticks are kept until Save, which saves each location whose tick changed. Amazon's location, left out, still marks
// FBA stock; other locations are excluded.
export const Edit = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Edit inventory locations" }))
    const dialog = await screen.findByRole("dialog", { name: "Inventory locations" })
    await expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
    // The store's own locations come first, then those run by apps, with why they're usually left out.
    await expect([...dialog.querySelectorAll("label")].map((label) => label.textContent)).toEqual([
      "Portland warehouse",
      "Reno overflow",
      "ShipBob Reno",
      "Amazon FBA"
    ])
    await expect(dialog).toHaveTextContent("Amazon FBA stock, read from Amazon directly")
    await expect(dialog).toHaveTextContent("Run by an app, such as a third-party warehouse")
    await expect(within(dialog).getByRole("checkbox", { name: "Portland warehouse" })).toBeChecked()
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Portland warehouse" }))
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reno overflow" }))
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "ShipBob Reno" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveLength(3))
    await expect(saved).toEqual([
      {
        locationId: "gid://shopify/Location/7004",
        classification: "merchant",
        snapshotId: "snap_20260927",
        expectedRevision: 4
      },
      {
        locationId: "gid://shopify/Location/7001",
        classification: "excluded",
        snapshotId: "snap_20260927",
        expectedRevision: 2
      },
      {
        locationId: "gid://shopify/Location/7002",
        classification: "merchant",
        snapshotId: "snap_20260927",
        expectedRevision: 1
      }
    ])
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// Leaving out Amazon's location keeps it as FBA's mirror rather than excluding it.
export const LeaveOutAmazon = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/inventory/locations", () =>
        HttpResponse.json({
          ...inventoryLocations,
          locations: inventoryLocations.locations.map((location) =>
            location.kind === "amazon_fulfillment" ? { ...location, classification: "merchant" } : location
          )
        })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Portland warehouse, Amazon FBA")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Edit inventory locations" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Amazon FBA" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(saved).toHaveLength(1))
    await expect(saved[0]).toMatchObject({ locationId: "gid://shopify/Location/7003", classification: "amazon_mirror" })
  }
})

export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.patch("/api/inventory/locations", () =>
        HttpResponse.json({ error: "Shopify's locations changed. Reopen to see them." }, { status: 409 })
      )
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Edit inventory locations" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reno overflow" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await expect(
      await within(dialog).findByText("Shopify's locations changed. Reopen to see them.")
    ).toBeInTheDocument()
  }
})

export const NoneCounted = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/inventory/locations", () =>
        HttpResponse.json({
          ...inventoryLocations,
          locations: inventoryLocations.locations.map((location) => ({ ...location, classification: "excluded" }))
        })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("None")).toBeVisible()
  }
})

// Before Shopify's first sync there are no locations to choose, and nothing to edit.
export const NotSynced = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory/locations", () => HttpResponse.json({ snapshotId: null, locations: [] })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Sync Shopify on/)).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/products")
    await expect(canvas.queryByRole("button", { name: "Edit inventory locations" })).toBeNull()
  }
})

export const Loading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory/locations", () => delay("infinite")))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading locations")
  }
})

export const LoadFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/inventory/locations", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn’t load locations")
  }
})

export const Row = meta.story({
  render: () => (
    <DetailRow title="Marketplaces" action={<Button size="sm">Change</Button>}>
      United States, Canada
    </DetailRow>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Marketplaces" })).toBeVisible()
    await expect(canvas.getByText("United States, Canada")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Change" })).toBeVisible()
  }
})
