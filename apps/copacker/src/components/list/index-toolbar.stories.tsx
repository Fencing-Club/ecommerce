import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { IndexToolbar } from "./index-toolbar"
import { matches } from "./matches"

const names = ["Canvas tote bag", "Linen apron", "Market basket", "Wool throw"]

// A list with the toolbar's tabs and search, as the index pages use it.
function ToolbarList() {
  const [tab, setTab] = useState<"all" | "bags">("all")
  const [query, setQuery] = useState("")
  const shown = names.filter((name) => (tab === "all" || name.includes("bag")) && matches(query, name))
  return (
    <div className="@container flex flex-col gap-3">
      <IndexToolbar
        tabs={[
          { value: "all", label: "All", count: names.length },
          { value: "bags", label: "Bags", count: 1 }
        ]}
        tab={tab}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search products"
      >
        <button type="button">Filter</button>
      </IndexToolbar>
      <ul aria-label="Results">
        {shown.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  )
}

// The tabs and search above an index table, each tab with its count.
const meta = preview.meta({
  title: "Components/Display/Index toolbar",
  component: IndexToolbar,
  args: {
    tabs: [
      { value: "all", label: "All", count: 1200 },
      { value: "active", label: "Active", count: 3 },
      { value: "archived", label: "Archived" }
    ],
    tab: "all",
    onTabChange: fn(),
    query: "",
    onQueryChange: fn(),
    placeholder: "Search products"
  }
})

export const Counts = meta.story({
  play: async ({ args, canvas }) => {
    // Counts read in the page's language, and a tab can go without one.
    await expect(canvas.getByRole("tab", { name: /All\s*1,200/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("tab", { name: "Archived" })).toBeVisible()
    await userEvent.click(canvas.getByRole("tab", { name: /Active/ }))
    await expect(args.onTabChange).toHaveBeenCalledWith("active")
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "a")
    await expect(args.onQueryChange).toHaveBeenCalledWith("a")
  }
})

export const SearchAndTabs = meta.story({
  render: () => <ToolbarList />,
  play: async ({ canvas }) => {
    const results = () => within(canvas.getByRole("list", { name: "Results" })).queryAllByRole("listitem")
    await expect(canvas.getByRole("tab", { name: /All\s*4/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("button", { name: "Filter" })).toBeVisible()
    await userEvent.click(canvas.getByRole("tab", { name: /Bags/ }))
    await expect(results()).toHaveLength(1)
    await userEvent.click(canvas.getByRole("tab", { name: /All/ }))
    // Search ignores case and surrounding spaces.
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "  APRON ")
    await expect(results().map((item) => item.textContent)).toEqual(["Linen apron"])
    await userEvent.clear(canvas.getByRole("searchbox"))
    await expect(results()).toHaveLength(4)
  }
})
