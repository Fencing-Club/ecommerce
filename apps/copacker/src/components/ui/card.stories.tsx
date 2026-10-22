import { MoreHorizontal } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table"

const meta = preview.type<{ args: { onAction: () => void } }>().meta({
  title: "Foundations/Card",
  component: Card,
  args: { onAction: fn() },
  render: ({ size, onAction }) => (
    <Card size={size} className="max-w-sm">
      <CardHeader>
        <CardTitle>Harbor Tote</CardTitle>
        <CardDescription>Made by Lotus Manufacturing</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" onClick={() => onAction()}>
            <MoreHorizontal />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>1,200 units on hand, 400 units on the way.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Reorder</Button>
      </CardFooter>
    </Card>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const card = canvas.getByText("Harbor Tote").closest("[data-slot=card]")
    await expect(card).toHaveAttribute("data-size", "default")
    await expect(canvas.getByText("Made by Lotus Manufacturing")).toBeVisible()
    await expect(canvas.getByText("1,200 units on hand, 400 units on the way.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
    await expect(canvas.getByRole("button", { name: "Reorder" })).toBeVisible()
  }
})

export const Small = meta.story({
  args: { size: "sm" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Harbor Tote").closest("[data-slot=card]")).toHaveAttribute("data-size", "sm")
  }
})

export const ContentOnly = meta.story({
  render: () => (
    <Card className="max-w-sm">
      <CardContent>No purchase orders this week.</CardContent>
    </Card>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No purchase orders this week.")).toBeVisible()
  }
})

const lines = [
  { sku: "HT-01", name: "Harbor Tote", units: 480 },
  { sku: "HD-02", name: "Harbor Duffel", units: 120 }
]

// A card whose content runs edge to edge: its header keeps the card's padding with a rule under it, and the table's
// first and last columns line up with the header.
export const Flush = meta.story({
  render: () => (
    <Card flush className="max-w-md">
      <CardHeader>
        <CardTitle>Lines</CardTitle>
      </CardHeader>
      <Table framed={false} inset>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-end">Units</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.sku}>
              <TableCell>{line.name}</TableCell>
              <TableCell className="text-end">{line.units}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  ),
  play: async ({ canvas }) => {
    const card = canvas.getByRole("table").closest("[data-slot=card]")
    await expect(card).toHaveAttribute("data-flush", "true")
    const header = canvas.getByText("Lines").closest("[data-slot=card-header]")
    const style = header && getComputedStyle(header)
    await expect(Number.parseFloat(style?.borderBottomWidth ?? "0")).toBeGreaterThan(0)
    await expect([style?.paddingTop, style?.paddingBottom, style?.paddingInlineStart]).toEqual(["16px", "16px", "16px"])
    // The table starts right under the header's rule, and its first column lines up with the title.
    const table = canvas.getByRole("table").getBoundingClientRect()
    await expect(table.top).toBeCloseTo(header?.getBoundingClientRect().bottom ?? 0)
    const product = canvas.getByRole("columnheader", { name: "Product" })
    const inset = Number.parseFloat(getComputedStyle(product).paddingInlineStart)
    await expect(product.getBoundingClientRect().left + inset).toBeCloseTo(
      canvas.getByText("Lines").getBoundingClientRect().left
    )
  }
})

// A header with nothing under it, such as a collapsed group, has no rule.
export const FlushHeaderOnly = meta.story({
  render: () => (
    <Card flush className="max-w-md">
      <CardHeader>
        <CardTitle>Shenzhen Metalworks</CardTitle>
      </CardHeader>
    </Card>
  ),
  play: async ({ canvas }) => {
    const header = canvas.getByText("Shenzhen Metalworks").closest("[data-slot=card-header]")
    await expect(header && getComputedStyle(header).borderBottomWidth).toBe("0px")
  }
})
