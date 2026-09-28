import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { StoreLogo } from "./store-logos"

const meta = preview.meta({
  component: StoreLogo,
  args: { store: "shopify" } satisfies React.ComponentProps<typeof StoreLogo>
})

export const Shopify = meta.story({
  play: async ({ canvasElement }) => {
    const tile = canvasElement.querySelector("[aria-hidden=true]")
    await expect(tile?.querySelector("path")).toHaveAttribute("fill", "#95BF47")
  }
})

export const Amazon = meta.story({
  args: { store: "amazon" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("svg text")).toHaveTextContent("a")
  }
})

export const Ebay = meta.story({
  args: { store: "ebay" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("svg text")).toHaveTextContent("ebay")
  }
})

// Beside each other, as the integrations cards show them, one a larger size.
export const AllStores = meta.story({
  render: () => (
    <div className="flex items-center gap-3">
      <StoreLogo store="shopify" />
      <StoreLogo store="amazon" />
      <StoreLogo store="ebay" className="size-12" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tiles = canvasElement.querySelectorAll("span[aria-hidden=true]")
    await expect(tiles).toHaveLength(3)
    await expect(tiles[2]).toHaveClass("size-12")
  }
})
