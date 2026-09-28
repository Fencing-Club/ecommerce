import { useState } from "react"
import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { photo } from "@/stories/fixtures/supplier"
import { Amounts, IndexToolbar, matches, Pager, ProductThumb, SaveBar, StatusBadge } from "./shared"

// The pieces every supplier list and form shares: the save bar, a product's photo, status badges, amounts, the tabs and
// search above a table, and its pages.
const meta = preview.meta({
  component: SaveBar,
  args: { dirty: true, pending: false, onDiscard: fn(), onSave: fn() }
})

export const SaveBarDirty = meta.story({
  play: async ({ args, canvas }) => {
    const bar = canvas.getByRole("region", { name: "Unsaved changes" })
    await expect(within(bar).getByText("Unsaved changes")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Save" }))
    await expect(args.onSave).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }))
    await expect(args.onDiscard).toHaveBeenCalledOnce()
  }
})

export const SaveBarWithMessage = meta.story({
  args: { message: "3 unsaved changes" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 unsaved changes")).toBeVisible()
  }
})

export const SaveBarSaving = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Saving" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Discard" })).toBeDisabled()
  }
})

export const SaveBarCantSave = meta.story({
  args: { canSave: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Discard" })).toBeEnabled()
  }
})

export const SaveBarError = meta.story({
  args: { dirty: false, error: "Couldn't save. Try again." },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Couldn't save. Try again.")).toBeVisible()
    // Nothing is unsaved, so there's nothing to discard or save again.
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled()
  }
})

export const SaveBarClean = meta.story({
  args: { dirty: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  }
})

export const Thumbnails = meta.story({
  render: () => (
    <div className="flex gap-2" data-testid="thumbs">
      <ProductThumb image={photo} />
      <ProductThumb image={null} />
    </div>
  ),
  play: async ({ canvas }) => {
    const image = canvas.getByTestId("thumbs").querySelector("img")
    await expect(image).toHaveAttribute("src", `/api/product-images?key=${encodeURIComponent(photo.key)}`)
    await expect(canvas.getByTestId("thumbs").querySelectorAll("svg")).toHaveLength(1)
  }
})

export const Statuses = meta.story({
  render: () => (
    <div className="flex gap-2">
      <StatusBadge status="active" />
      <StatusBadge status="draft" />
      <StatusBadge status="archived" />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Active")).toBeVisible()
    await expect(canvas.getByText("Draft")).toBeVisible()
    await expect(canvas.getByText("Archived")).toBeVisible()
  }
})

export const AmountsInCurrencies = meta.story({
  render: () => (
    <div className="flex gap-8">
      <Amounts
        amounts={[
          { currency: "USD", amount: 1_284_000 },
          { currency: "EUR", amount: 96_000 }
        ]}
      />
      <Amounts amounts={[]} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("$12,840.00")).toBeVisible()
    await expect(canvas.getByText("€960.00")).toBeVisible()
    await expect(canvas.getByText("—")).toBeVisible()
  }
})

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

export const Toolbar = meta.story({
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

function PagedList({ total }: { total: number }) {
  const [page, setPage] = useState(0)
  return (
    <div>
      <p data-testid="page">Page {page + 1}</p>
      <Pager page={page} pages={Math.ceil(total / 25)} total={total} size={25} onPage={setPage} />
    </div>
  )
}

export const Pages = meta.story({
  render: () => <PagedList total={60} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1–25 of 60")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("51–60 of 60")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
    await expect(canvas.getByTestId("page")).toHaveTextContent("Page 2")
  }
})

export const OnePage = meta.story({
  render: () => <PagedList total={10} />,
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Next page" })).toBeNull()
    await expect(screen.queryByText(/of 10/)).toBeNull()
  }
})
