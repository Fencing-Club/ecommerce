import { useState } from "react"
import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import type { CatalogEntry } from "@/lib/catalog-pricing"
import { catalogProducts } from "@/stories/fixtures/supplier"
import { CatalogPriceCell } from "./catalog-price-cell"

const [tote, apron, basket] = catalogProducts
const empty: CatalogEntry = { priceMinor: null, priceBreaks: null, quantityRules: null }
const entries = new Map<string, CatalogEntry>([
  [tote!.variants[0]!.id, { ...empty, priceMinor: 400 }],
  [tote!.variants[1]!.id, empty],
  [apron!.variants[0]!.id, empty]
])

// The cell holding the catalog's entries, as the products table does.
function Cell({ onChange, ...props }: React.ComponentProps<typeof CatalogPriceCell>) {
  const [current, setCurrent] = useState(props.entries)
  return (
    <CatalogPriceCell
      {...props}
      entries={current}
      onChange={(variantIds, priceMinor) => {
        const next = new Map(current)
        for (const variantId of variantIds) {
          next.set(variantId, { ...(next.get(variantId) ?? empty), priceMinor })
        }
        setCurrent(next)
        onChange(variantIds, priceMinor)
      }}
    />
  )
}

// A catalog price: each variant's fixed price, or its own price moved by the catalog's adjustment, with a field to fix
// it.
const meta = preview.meta({
  title: "Components/Supplier workspace/Catalog price cell",
  component: CatalogPriceCell,
  args: {
    name: "Linen apron",
    variants: apron!.variants,
    entries,
    adjustment: -1000,
    readOnly: false,
    onChange: fn()
  },
  render: (args) => <Cell {...args} />
})

// The apron's $8.90 is 10% off; fixing it at $7.50 marks it fixed, and it can go back.
export const FixPrice = meta.story({
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Price for Linen apron: $8.01" }))
    const field = await screen.findByRole("textbox", { name: "Fixed price" })
    await expect(screen.getByText("Adjusted price: $8.01")).toBeInTheDocument()
    await userEvent.type(field, "7.5{Enter}")
    await expect(args.onChange).toHaveBeenCalledWith([apron!.variants[0]!.id], 750)
    await userEvent.click(await canvas.findByRole("button", { name: "Price for Linen apron: $7.50, fixed" }))
    await userEvent.click(await screen.findByRole("button", { name: "Use adjusted price" }))
    await expect(args.onChange).toHaveBeenLastCalledWith([apron!.variants[0]!.id], null)
  }
})

// Something that isn't an amount can't be saved.
export const InvalidPrice = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: /Price for Linen apron/ }))
    const field = await screen.findByRole("textbox", { name: "Fixed price" })
    await userEvent.type(field, "7.5x")
    await expect(field).toHaveAttribute("aria-invalid", "true")
    await expect(screen.getByRole("button", { name: "Done" })).toBeDisabled()
  }
})

// A product's row prices all its variants: a range, fixed for every variant at once.
export const SeveralVariants = meta.story({
  args: { name: "Canvas tote bag", variants: tote!.variants },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Price for Canvas tote bag: $4 – $4.05" }))
    await expect(await screen.findByRole("textbox", { name: "Fixed price for 2 variants" })).toHaveValue("")
    await expect(screen.getByText("Adjusted prices: $3.83 – $4.05")).toBeInTheDocument()
  }
})

// A product the catalog leaves out shows what it would cost, without the button.
export const LeftOut = meta.story({
  args: { name: "Market basket", variants: basket!.variants },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Price for Market basket: no price" })).toBeDisabled()
  }
})

export const WithoutAdjustment = meta.story({
  args: { adjustment: 0 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Price for Linen apron: $8.90" }))
    await expect(await screen.findByText("Product price: $8.90")).toBeInTheDocument()
  }
})

export const ReadOnly = meta.story({
  args: { readOnly: true, name: "Canvas tote bag", variants: [tote!.variants[0]!] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button")).toBeNull()
    await expect(canvas.getByText("Fixed")).toBeVisible()
    await expect(canvas.getByText("$4")).toBeVisible()
  }
})
