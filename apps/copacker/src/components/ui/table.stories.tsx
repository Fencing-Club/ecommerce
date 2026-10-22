import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Card } from "./card"
import { Checkbox } from "./checkbox"
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table"

const lines = [
  { sku: "HT-01", name: "Harbor Tote", units: 480, price: 4.2 },
  { sku: "HD-02", name: "Harbor Duffel", units: 120, price: 11.5 },
  { sku: "CP-03", name: "Canvas Pouch", units: 960, price: 1.8 }
]

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)

function Lines({ framed }: { framed?: boolean }) {
  return (
    <Table framed={framed}>
      <TableCaption>Lines on purchase order 1042</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="text-end">Units</TableHead>
          <TableHead className="text-end">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.sku}>
            <TableCell>{line.sku}</TableCell>
            <TableCell>{line.name}</TableCell>
            <TableCell className="text-end">{line.units}</TableCell>
            <TableCell className="text-end">{money(line.units * line.price)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className="text-end">1,560</TableCell>
          <TableCell className="text-end">
            {money(lines.reduce((sum, line) => sum + line.units * line.price, 0))}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

// Rows with checkboxes that pick lines, and a header checkbox for all of them.
function SelectableLines() {
  const [picked, setPicked] = useState<string[]>([])
  const all = picked.length === lines.length
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              aria-label="Pick all lines"
              checked={all}
              indeterminate={picked.length > 0 && !all}
              onCheckedChange={(checked) => setPicked(checked ? lines.map((line) => line.sku) : [])}
            />
          </TableHead>
          <TableHead>Product</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.sku} data-state={picked.includes(line.sku) ? "selected" : undefined}>
            <TableCell>
              <Checkbox
                aria-label={`Pick ${line.name}`}
                checked={picked.includes(line.sku)}
                onCheckedChange={(checked) =>
                  setPicked(checked ? [...picked, line.sku] : picked.filter((sku) => sku !== line.sku))
                }
              />
            </TableCell>
            <TableCell>{line.name}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const meta = preview.meta({
  title: "Foundations/Table",
  component: Table,
  render: ({ framed }) => <Lines framed={framed} />
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const table = canvas.getByRole("table", { name: "Lines on purchase order 1042" })
    await expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual(["SKU", "Product", "Units", "Total"])
    // A header row, three lines and the total.
    await expect(within(table).getAllByRole("row")).toHaveLength(5)
    await expect(within(table).getByRole("row", { name: /Harbor Duffel/ })).toHaveTextContent("$1,380.00")
    await expect(within(table).getByRole("row", { name: /^Total/ })).toHaveTextContent("$5,124.00")
    await expect(table.parentElement).toHaveClass("border")
  }
})

// Edge to edge inside a card, without the table's own border.
export const Unframed = meta.story({
  args: { framed: false },
  render: ({ framed }) => (
    <Card flush>
      <Lines framed={framed} />
    </Card>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("table").parentElement).not.toHaveClass("border")
  }
})

// Inset, the first and last columns line up with the card's padding: 16px, or 12px in a small card.
export const Inset = meta.story({
  render: () => (
    <div className="flex flex-col gap-4">
      {(["default", "sm"] as const).map((size) => (
        <Card key={size} size={size} flush>
          <Table framed={false} inset aria-label={`In a ${size} card`}>
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
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const [size, inset] of [
      ["default", "16px"],
      ["sm", "12px"]
    ] as const) {
      const table = canvas.getByRole("table", { name: `In a ${size} card` })
      await expect(table).toHaveAttribute("data-inset", "true")
      const [first, last] = within(table).getAllByRole("cell").slice(0, 2)
      await expect(first && getComputedStyle(first).paddingInlineStart).toBe(inset)
      await expect(last && getComputedStyle(last).paddingInlineEnd).toBe(inset)
    }
  }
})

export const SelectableRows = meta.story({
  render: () => <SelectableLines />,
  play: async ({ canvas }) => {
    const all = canvas.getByRole("checkbox", { name: "Pick all lines" })
    await userEvent.click(canvas.getByRole("checkbox", { name: "Pick Harbor Tote" }))
    await expect(canvas.getByRole("row", { name: /Harbor Tote/ })).toHaveAttribute("data-state", "selected")
    await expect(all).toHaveAttribute("aria-checked", "mixed")

    await userEvent.click(all)
    for (const checkbox of canvas.getAllByRole("checkbox")) {
      await expect(checkbox).toHaveAttribute("aria-checked", "true")
    }
    await userEvent.click(all)
    await expect(canvas.getByRole("row", { name: /Canvas Pouch/ })).not.toHaveAttribute("data-state")
  }
})
