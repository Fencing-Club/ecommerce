import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { LogisticsList } from "@/stories/logistics-lists"
import { portalPage } from "@/stories/server"

function ListPage(props: Omit<React.ComponentProps<typeof LogisticsList>, "kind">) {
  return <LogisticsList {...props} kind="shipments" />
}

const meta = preview.meta({
  title: "Pages/Buyer/Shipments/List",
  component: ListPage,
  ...portalPage("/shipments")
})

export const All = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Shipments" })).toBeVisible()
    await expect(canvas.getByText("Showing 1–11 of 56 shipments")).toBeVisible()
    await expect(canvas.getByText("Needs shipping labels", { exact: true })).toBeVisible()
    await expect(canvas.getByRole("columnheader", { name: "Status" })).toBeVisible()
    await expect(within(canvas.getByRole("navigation", { name: "Shipments views" })).getAllByRole("link")).toHaveLength(
      4
    )
    await expect(canvas.queryByRole("button", { name: "Remove ready date filter" })).toBeNull()
    await expect(canvas.queryByRole("button", { name: "Destination" })).toBeNull()
  }
})
export const NeedsYou = meta.story({
  args: { initialView: "Needs you" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Showing 1–4 of 4 shipments")).toBeVisible()
    await expect(canvas.getByText("Rejected by Amazon", { exact: true })).toBeVisible()
  }
})
export const Active = meta.story({
  args: { initialView: "Active" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Showing 1–11 of 13 shipments")).toBeVisible()
    await expect(canvas.queryByText("FBA17R5N2K")).toBeNull()
  }
})
export const Packing = meta.story({
  args: { initialView: "All", initialStatus: "Packing" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Showing 1–1 of 1 shipments")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Remove status filter" }))
    await expect(canvas.getByText("Showing 1–11 of 56 shipments")).toBeVisible()
  }
})
export const ReadyForPickup = meta.story({
  args: { initialView: "All", initialStatus: "Ready for pickup" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Showing 1–2 of 2 shipments")).toBeVisible()
  }
})
export const Filters = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }))
    await userEvent.click(await screen.findByRole("combobox", { name: "Source" }))
    await userEvent.click(await screen.findByRole("option", { name: "Amazon" }))
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await expect(canvas.getByText("Showing 1–1 of 1 shipments")).toBeVisible()
    await expect(canvas.getByText("Created in Seller Central")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Remove source filter" }))
    await expect(canvas.getByText("Showing 1–11 of 56 shipments")).toBeVisible()
  }
})
export const DateFilter = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }))
    await userEvent.type(await screen.findByLabelText("From"), "2026-10-01")
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await expect(canvas.queryByRole("link", { name: "FBA17V2P1R" })).toBeNull()
    await expect(canvas.getByText("Showing 1–5 of 5 shipments")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Remove ready date filter" }))
    await expect(canvas.getByText("Showing 1–11 of 56 shipments")).toBeVisible()
  }
})
export const PaginationAndActions = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("Showing 12–22 of 56 shipments")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
    await userEvent.click(canvas.getByRole("button", { name: "Actions for PO-1045, shipment 2" }))
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "View shipment" })).toBeVisible())
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "View purchase order" })).toBeVisible())
    await userEvent.keyboard("{Escape}")
  }
})
export const Empty = meta.story({
  args: { empty: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No shipments yet" })).toBeVisible()
  }
})
export const NoResults = meta.story({
  args: { initialQuery: "No matching shipment" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No matching shipments" })).toBeVisible()
  }
})
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Shipments" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Export" })).toBeVisible()
    const list = canvas.getByRole("region", { name: "Shipments table" })
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
    await expect(canvas.getByText("Needs shipping labels", { exact: true })).toBeVisible()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  }
})
