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
