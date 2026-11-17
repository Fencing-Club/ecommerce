import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { FramedTable } from "./framed-table"

const meta = preview.meta({ title: "Components/Display/Framed table" })

// A table on its own, inside a rounded border.
export const Default = meta.story({
  render: () => (
    <FramedTable>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Units</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Canvas tote bag</TableCell>
          <TableCell>200</TableCell>
        </TableRow>
      </TableBody>
    </FramedTable>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("columnheader", { name: "Product" })).toBeVisible()
    await expect(canvas.getByRole("table").closest("[data-slot=table-frame]")).toHaveStyle({ borderTopWidth: "1px" })
  }
})
