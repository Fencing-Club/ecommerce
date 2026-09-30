import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { TabLinks } from "./tab-links"

const meta = preview.meta({
  component: TabLinks,
  args: {
    label: "Status",
    tabs: [
      { label: "All", href: "/orders", current: true, count: 1250 },
      { label: "Drafts", href: "/orders?status=draft", current: false, count: 1 },
      { label: "With supplier", href: "/orders?status=submitted", current: false, count: 2 },
      { label: "Closed", href: "/orders?status=closed", current: false, count: 0 }
    ]
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Status" })
    const links = within(nav).getAllByRole("link")
    await expect(links).toHaveLength(4)
    await expect(within(nav).getByRole("link", { name: /All/ })).toHaveAttribute("aria-current", "page")
    // Counts read in the person's language.
    await expect(within(nav).getByRole("link", { name: /All/ })).toHaveTextContent("All1,250")
    await expect(within(nav).getByRole("link", { name: /Drafts/ })).not.toHaveAttribute("aria-current")
    await expect(within(nav).getByRole("link", { name: /With supplier/ })).toHaveAttribute(
      "href",
      "/orders?status=submitted"
    )
  }
})

export const WithoutCounts = meta.story({
  args: {
    label: "Channel",
    tabs: [
      { label: "All channels", href: "/overview", current: false },
      { label: "Shopify", href: "/overview?channel=shopify", current: true },
      { label: "Amazon", href: "/overview?channel=amazon", current: false }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Shopify" })).toHaveAttribute("aria-current", "page")
    await expect(canvas.getByRole("link", { name: "Amazon" })).toHaveTextContent(/^Amazon$/)
  }
})

// A count of zero says nothing, so it isn't shown.
export const ZeroCount = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Closed/ })).toHaveTextContent(/^Closed$/)
  }
})

// A purchase order list's views on a phone: the row scrolls sideways, with the current view brought into sight.
export const OnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  args: {
    label: "Views",
    tabs: [
      { label: "Needs you", href: "/orders?view=needs-you", current: false, count: 4 },
      { label: "Drafts", href: "/orders?view=drafts", current: false, count: 2 },
      { label: "With supplier", href: "/orders?view=with-supplier", current: false, count: 3 },
      { label: "In transit", href: "/orders?view=in-transit", current: false, count: 5 },
      { label: "Closed", href: "/orders?view=closed", current: true, count: 118 },
      { label: "All", href: "/orders?view=all", current: false, count: 132 }
    ]
  },
  play: async ({ canvas }) => {
    const nav = canvas.getByRole("navigation", { name: "Views" })
    await expect(nav.scrollWidth).toBeGreaterThan(nav.clientWidth)
    const current = within(nav).getByRole("link", { name: /Closed/ })
    const box = current.getBoundingClientRect()
    const frame = nav.getBoundingClientRect()
    await expect(box.left).toBeGreaterThanOrEqual(frame.left - 1)
    await expect(box.right).toBeLessThanOrEqual(frame.right + 1)
  }
})
