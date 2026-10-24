import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { TabLinks } from "./tab-links"

const meta = preview.meta({
  title: "Components/App shell/Tab links",
  component: TabLinks,
  args: {
    label: "Status",
    tabs: [
      { label: "All", href: "/orders", current: true, count: 1250 },
      { label: "Drafts", href: "/orders?view=draft", current: false, count: 1 },
      { label: "With supplier", href: "/orders?view=active", current: false, count: 2 },
      { label: "Closed", href: "/orders?view=closed", current: false, count: 0 }
    ]
  }
})

export const Controlled = meta.story({
  args: { onSelect: fn() },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("link", { name: /Drafts/ }))
    await expect(args.onSelect).toHaveBeenCalledWith("/orders?view=draft")
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
      "/orders?view=active"
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

// A count of zero says nothing, so it isn't shown. Tabs are 40px, the current one underlined.
export const ZeroCount = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Closed/ })).toHaveTextContent(/^Closed$/)
    const current = canvas.getByRole("link", { name: /All/ })
    await expect(current.getBoundingClientRect().height).toBe(40)
    await expect(getComputedStyle(current).borderBottomWidth).toBe("2px")
  }
})

// The Needs you view's count is work waiting on the viewer, in the primary tint; the other counts are muted.
export const NeedsYou = meta.story({
  args: {
    label: "Views",
    tabs: [
      { label: "Needs you", href: "/orders?view=needsYou", current: true, count: 4, attention: true },
      { label: "Drafts", href: "/orders?view=draft", current: false, count: 2 }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Needs you/ })).toHaveTextContent("4")
    await expect(canvas.getByRole("link", { name: /Drafts/ })).toHaveTextContent("2")
  }
})
