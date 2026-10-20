import { expect, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { LogisticsList } from "@/stories/logistics-lists"
import { portalPage } from "@/stories/server"

function ListPage(props: Omit<React.ComponentProps<typeof LogisticsList>, "kind">) {
  return <LogisticsList {...props} kind="orders" />
}

const meta = preview.meta({
  title: "Prototypes/List designs/Purchase orders",
  component: ListPage,
  ...portalPage("/orders")
})

export const NeedsYou = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Purchase orders" })).toBeVisible()
    await expect(canvas.getByText("4 purchase orders", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Approve invoice")).toBeVisible()
    await expect(canvas.queryByText("Required by")).toBeNull()
    await expect(
      within(canvas.getByRole("navigation", { name: "Purchase orders views" })).getAllByRole("link")
    ).toHaveLength(5)
    await expect(canvas.getByRole("progressbar", { name: "PO-1045 shipped", hidden: true })).toHaveAttribute(
      "value",
      "0"
    )
  }
})
export const All = meta.story({
  args: { initialView: "All" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Showing 1–11 of 53 purchase orders")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("Showing 12–22 of 53 purchase orders")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
  }
})
export const Filters = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Supplier" }))
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Northwind Textiles" }))
    await userEvent.keyboard("{Escape}")
    await expect(canvas.getByRole("link", { name: "PO-1044" })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-1045" })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }))
    await userEvent.type(canvas.getByRole("textbox", { name: "Search purchase orders" }), "1047")
    await expect(canvas.getByRole("link", { name: "PO-1047" })).toBeVisible()
  }
})
export const SelectionAndColumns = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all visible purchase orders" }))
    await expect(canvas.getByText("4 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Clear selection" }))
    await userEvent.click(canvas.getByRole("button", { name: "Columns" }))
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Supplier" }))
    await userEvent.keyboard("{Escape}")
    await expect(canvas.queryByRole("columnheader", { name: "Supplier" })).toBeNull()
  }
})
export const Drafts = meta.story({
  args: { initialView: "Drafts" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-1046" })).toBeVisible()
  }
})
export const Empty = meta.story({
  args: { empty: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No purchase orders yet" })).toBeVisible()
  }
})
export const NoResults = meta.story({
  args: { initialQuery: "No matching order" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No matching purchase orders" })).toBeVisible()
  }
})
export const Mobile = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Purchase orders" })).toBeVisible()
    const table = within(canvas.getByRole("region", { name: "Purchase orders table" }))
    await expect(table.getByRole("link", { name: "PO-1045" })).toBeVisible()
    const list = canvas.getByRole("region", { name: "Purchase orders table" })
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
    await expect(table.getByText("Approve invoice")).toBeVisible()
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  }
})

export const Active = meta.story({
  args: { initialView: "Active" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("7 purchase orders", { exact: true })).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-1046" })).toBeNull()
  }
})
export const StatusFilter = meta.story({
  args: { initialView: "All" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }))
    await userEvent.click(await screen.findByRole("combobox", { name: "Status" }))
    await userEvent.click(await screen.findByRole("option", { name: "In transit" }))
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    await expect(canvas.getByText("2 purchase orders", { exact: true })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Remove status filter" }))
    await expect(canvas.getByText("Showing 1–11 of 53 purchase orders")).toBeVisible()
  }
})
