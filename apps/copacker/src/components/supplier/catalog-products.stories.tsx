import { useState } from "react"
import { expect, fn, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { CatalogEntry } from "@/lib/catalog-pricing"
import { catalogProducts, catalogViewer, manyCatalogProducts, wholesaleCatalog } from "@/stories/fixtures/supplier"
import { type CatalogEntries, CatalogProducts, emptyEntry } from "./catalog-products"

const entries: CatalogEntries = new Map<string, CatalogEntry>(
  wholesaleCatalog.entries.map(({ productId, ...entry }) => [productId, entry] as const)
)
// More products than a page holds, all included.
const mugs = manyCatalogProducts(30)

// The table holding its own entries, as the catalog editor does.
function Products({ onEntriesChange, ...props }: React.ComponentProps<typeof CatalogProducts>) {
  const [current, setCurrent] = useState(props.entries)
  const [includeNew, setIncludeNew] = useState(props.includeNewProducts)
  return (
    <CatalogProducts
      {...props}
      entries={current}
      onEntriesChange={(update) => {
        setCurrent(update(current))
        onEntriesChange(update)
      }}
      includeNewProducts={includeNew}
      onIncludeNewProductsChange={(include) => {
        setIncludeNew(include)
        props.onIncludeNewProductsChange(include)
      }}
    />
  )
}

// A catalog's products: which it includes, and each variant's price and rules.
const meta = preview.meta({
  title: "Components/Supplier workspace/Catalog products",
  component: CatalogProducts,
  args: {
    products: catalogProducts,
    entries,
    onEntriesChange: fn(),
    adjustment: -1000,
    includeNewProducts: true,
    onIncludeNewProductsChange: fn(),
    readOnly: false
  },
  render: (args) => <Products {...args} />
})

export const Included = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: /Included\s*2/ })).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("button", { name: "Price for Canvas tote bag: $4 – $4.05" })).toBeVisible()
    await expect(canvas.getByText("Set per variant")).toBeVisible()
    await expect(canvas.queryByText("Market basket")).toBeNull()
  }
})

// Ticking products offers what to do with them; excluding one moves it to Excluded.
export const IncludeAndExclude = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select Linen apron" }))
    await expect(canvas.getByText("1 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Exclude" }))
    await expect(canvas.queryByText("1 selected")).toBeNull()
    await expect(canvas.getByRole("tab", { name: /Included\s*1/ })).toBeVisible()
    await userEvent.click(canvas.getByRole("tab", { name: /Excluded\s*2/ }))
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all products on this page" }))
    await expect(canvas.getByText("2 selected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Include" }))
    await expect(canvas.getByText("No products here")).toBeVisible()
  }
})

export const ExpandVariants = meta.story({
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("button", { name: "2 variants" })
    await userEvent.click(toggle)
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByRole("button", { name: "Price for Canvas tote bag, Black: $4.05" })).toBeVisible()
  }
})

// A variant's rules open in a dialog, and Done gives it rules of its own.
export const Rules = meta.story({
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Quantity rules and volume pricing for Linen apron/ }))
    const dialog = within(await screen.findByRole("dialog"))
    await userEvent.click(dialog.getByRole("button", { name: "Use product settings" }))
    await expect(args.onEntriesChange).toHaveBeenCalled()
    await expect(
      await canvas.findByRole("button", {
        name: "Quantity rules and volume pricing for Linen apron: 1 price break, min 12 units"
      })
    ).toBeVisible()
  }
})

export const SearchProducts = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /All\s*3/ }))
    // Found by a variant's SKU too.
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "blk")
    await expect(canvas.getByText("Canvas tote bag")).toBeVisible()
    await expect(canvas.queryByText("Linen apron")).toBeNull()
  }
})

export const ManyProducts = meta.story({
  args: { products: mugs, entries: new Map(mugs.map((mug) => [mug.variants[0]!.id, emptyEntry] as const)) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1–25 of 30")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("26–30 of 30")).toBeVisible()
    await expect(canvas.getByText("Stoneware mug 30")).toBeVisible()
    // A new search starts from the first page.
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search products" }), "mug")
    await expect(canvas.getByText("1–25 of 30")).toBeVisible()
  }
})

export const IncludeNewProducts = meta.story({
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole("switch", { name: "Automatically include new products" })
    await expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    await expect(args.onIncludeNewProductsChange).toHaveBeenCalledWith(false)
  }
})

export const NoProducts = meta.story({
  args: { products: [], entries: new Map() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No products yet")).toBeVisible()
    await expect(canvas.getByText("Add products before building a catalog.")).toBeVisible()
  }
})

export const ReadOnly = meta.story({
  args: { readOnly: true },
  parameters: { permissions: catalogViewer },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("checkbox")).toBeNull()
    await expect(canvas.queryByRole("button", { name: /Price for/ })).toBeNull()
    await expect(canvas.getByText("1 price break, min 12 units, steps of 6")).toBeVisible()
    await expect(canvas.getByRole("switch", { name: "Automatically include new products" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  }
})
