import { ChevronRight, Package, Truck } from "lucide-react"
import Link from "next/link"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle
} from "./item"

const variants = ["default", "outline", "muted"] as const
const sizes = ["default", "sm", "xs"] as const

const image = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#c9a66b"/></svg>'
)}`

const meta = preview.type<{ args: { onAction: () => void } }>().meta({
  component: Item,
  args: { onAction: fn() },
  render: ({ variant, size, onAction }) => (
    <Item variant={variant} size={size} className="max-w-md">
      <ItemMedia variant="icon">
        <Package />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Harbor Tote</ItemTitle>
        <ItemDescription>HT-01, 1,200 units on hand</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button size="sm" variant="outline" onClick={() => onAction()}>
          Reorder
        </Button>
      </ItemActions>
    </Item>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const item = canvas.getByText("Harbor Tote").closest("[data-slot=item]")
    await expect(item).toHaveAttribute("data-variant", "default")
    await expect(item).toHaveAttribute("data-size", "default")
    await expect(canvas.getByText("HT-01, 1,200 units on hand")).toHaveAttribute("data-slot", "item-description")
    await userEvent.click(canvas.getByRole("button", { name: "Reorder" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})

export const Variants = meta.story({
  render: () => (
    <div className="flex max-w-md flex-col gap-2">
      {variants.map((variant) => (
        <Item key={variant} variant={variant}>
          <ItemContent>
            <ItemTitle>{variant}</ItemTitle>
          </ItemContent>
        </Item>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const variant of variants) {
      await expect(canvas.getByText(variant).closest("[data-slot=item]")).toHaveAttribute("data-variant", variant)
    }
  }
})

export const Sizes = meta.story({
  render: () => (
    <div className="flex max-w-md flex-col gap-2">
      {sizes.map((size) => (
        <Item key={size} size={size} variant="outline">
          <ItemContent>
            <ItemTitle>{size}</ItemTitle>
          </ItemContent>
        </Item>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const height = (size: string) => canvas.getByText(size).closest("[data-slot=item]")?.getBoundingClientRect().height
    await expect(height("xs")).toBeLessThan(height("default") ?? 0)
  }
})

// A list of products with thumbnails, as the supplier overview shows stock to watch.
export const Group = meta.story({
  render: () => (
    <ItemGroup className="max-w-md">
      <Item size="sm">
        <ItemMedia variant="image">
          <img src={image} alt="" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Harbor Tote</ItemTitle>
          <ItemDescription>HT-01</ItemDescription>
        </ItemContent>
        <ItemActions>
          <span className="text-sm font-medium">120 units</span>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item size="sm">
        <ItemMedia variant="image">
          <img src={image} alt="" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Canvas Pouch</ItemTitle>
          <ItemDescription>CP-02</ItemDescription>
        </ItemContent>
        <ItemActions>
          <span className="text-sm font-medium text-destructive">-8 units</span>
        </ItemActions>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvas }) => {
    const group = canvas.getByText("Harbor Tote").closest("[data-slot=item-group]")
    await expect(group?.querySelectorAll("[data-slot=item]")).toHaveLength(2)
    await expect(canvas.getByRole("separator")).toHaveAttribute("data-slot", "item-separator")
    await expect(canvas.getByText("-8 units")).toBeVisible()
  }
})

// A whole item that links somewhere, with a header and footer.
export const AsLink = meta.story({
  render: () => (
    <Item variant="outline" className="max-w-md" render={<Link href="/shipments/sh_1" />}>
      <ItemHeader>
        <span className="text-xs text-muted-foreground">Shipment</span>
      </ItemHeader>
      <ItemMedia variant="icon">
        <Truck />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Bayline Freight to Harbor Goods</ItemTitle>
        <ItemDescription>2 cartons, 48 units</ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="size-4" />
      </ItemActions>
      <ItemFooter>
        <span className="text-xs text-muted-foreground">Arrives in 3 days</span>
      </ItemFooter>
    </Item>
  ),
  play: async ({ canvas }) => {
    const link = canvas.getByRole("link", { name: /Bayline Freight to Harbor Goods/ })
    await expect(link).toHaveAttribute("href", "/shipments/sh_1")
    await expect(canvas.getByText("Shipment").parentElement).toHaveAttribute("data-slot", "item-header")
    await expect(canvas.getByText("Arrives in 3 days").parentElement).toHaveAttribute("data-slot", "item-footer")
  }
})
