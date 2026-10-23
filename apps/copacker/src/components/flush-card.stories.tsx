import { CardHeader, CardTitle, Table, TableBody, TableCell, TableRow } from "@buildkitgg/shadcn-baseui-kit"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { insetTable } from "@/lib/controls"
import { FlushCard } from "./flush-card"

const meta = preview.meta({ title: "Components/Display/Flush card" })

// A card whose table runs edge to edge under its header, the table's first and last columns lined up with the header.
export const WithTable = meta.story({
  render: () => (
    <FlushCard className="max-w-md">
      <CardHeader>
        <CardTitle>Best sellers</CardTitle>
      </CardHeader>
      <Table className={insetTable}>
        <TableBody>
          <TableRow>
            <TableCell>Canvas tote bag</TableCell>
            <TableCell>200</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Linen apron</TableCell>
            <TableCell>120</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </FlushCard>
  ),
  play: async ({ canvas }) => {
    const card = canvas.getByText("Best sellers").closest("[data-slot=card]")
    await expect(card).toHaveAttribute("data-flush")
    // No padding of its own: the rows reach the card's edges.
    await expect(card).toHaveStyle({ paddingTop: "0px", paddingBottom: "0px" })
    await expect(canvas.getByRole("cell", { name: "Canvas tote bag" })).toBeVisible()
  }
})
