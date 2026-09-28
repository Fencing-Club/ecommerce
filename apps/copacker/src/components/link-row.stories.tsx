import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import Link from "next/link"
import { expect, fireEvent, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { member } from "@/stories/workspace"
import { LinkRow } from "./link-row"

// A list of purchase orders whose rows open the order.
function OrdersTable({ onRemind }: { onRemind: () => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Purchase order</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        <LinkRow href="/orders/order-1045">
          <TableCell>
            <Link href="/orders/order-1045">PO-1045</Link>
          </TableCell>
          <TableCell>Lotus Manufacturing</TableCell>
          <TableCell>
            <Button size="sm" variant="outline" onClick={onRemind}>
              Remind
            </Button>
          </TableCell>
        </LinkRow>
        <LinkRow href="/restock?status=order">
          <TableCell>Restock</TableCell>
          <TableCell>Canvas tote bag</TableCell>
          <TableCell />
        </LinkRow>
      </TableBody>
    </Table>
  )
}

const meta = preview.meta({
  component: OrdersTable,
  args: { onRemind: fn() }
})

export const OpensOnClick = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByText("Lotus Manufacturing"))
    await expect(getRouter().push).toHaveBeenCalledWith("/orders/order-1045")
    // The row's own buttons do their own thing.
    getRouter().push.mockClear()
    await userEvent.click(canvas.getByRole("button", { name: "Remind" }))
    await expect(args.onRemind).toHaveBeenCalledOnce()
    await expect(getRouter().push).not.toHaveBeenCalled()
  }
})

// Ctrl or Cmd, or the middle button, opens a new tab as a link would.
export const NewTab = meta.story({
  play: async ({ canvas }) => {
    const open = fn()
    const original = window.open
    window.open = open
    try {
      fireEvent.click(canvas.getByText("Lotus Manufacturing"), { ctrlKey: true })
      await expect(open).toHaveBeenCalledWith("/orders/order-1045", "_blank", "noopener")
      fireEvent(canvas.getByText("Canvas tote bag"), new MouseEvent("auxclick", { bubbles: true, button: 1 }))
      await expect(open).toHaveBeenLastCalledWith("/restock?status=order", "_blank", "noopener")
    } finally {
      window.open = original
    }
    await expect(getRouter().push).not.toHaveBeenCalled()
  }
})

// A member without Restock gets a plain row there, which opens nothing.
export const MemberWithoutPage = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    const restock = canvas.getByText("Canvas tote bag").closest("tr")
    await expect(restock).not.toHaveClass("cursor-pointer")
    await userEvent.click(canvas.getByText("Canvas tote bag"))
    await expect(getRouter().push).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByText("Lotus Manufacturing"))
    await expect(getRouter().push).toHaveBeenCalledWith("/orders/order-1045")
  }
})
