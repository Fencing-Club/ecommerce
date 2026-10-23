import { Button, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@buildkitgg/shadcn-baseui-kit"
import { Link } from "@tanstack/react-router"
import { expect, fireEvent, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { FramedTable } from "@/components/framed-table"
import { member } from "@/stories/workspace"
import { LinkRow } from "./link-row"

// A list of purchase orders whose rows open the order, and a row that opens a sheet on the page.
function OrdersTable({ onRemind, onOpen }: { onRemind: () => void; onOpen: () => void }) {
  return (
    <FramedTable>
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
            <Link to="/orders/$id" params={{ id: "order-1045" }}>
              PO-1045
            </Link>
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
        <LinkRow onOpen={onOpen}>
          <TableCell>
            <button type="button" onClick={onOpen}>
              Juniper Textiles
            </button>
          </TableCell>
          <TableCell>Fabric supplier</TableCell>
          <TableCell />
        </LinkRow>
      </TableBody>
    </FramedTable>
  )
}

const meta = preview.meta({
  title: "Components/App shell/Link row",
  component: OrdersTable,
  args: { onRemind: fn(), onOpen: fn() }
})

export const OpensOnClick = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByText("Lotus Manufacturing"))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/orders/order-1045" })
    // The row's own buttons do their own thing.
    getStoryRouter().navigate.mockClear()
    await userEvent.click(canvas.getByRole("button", { name: "Remind" }))
    await expect(args.onRemind).toHaveBeenCalledOnce()
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
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
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})

// A member without Restock gets a plain row there, which opens nothing.
export const MemberWithoutPage = meta.story({
  parameters: { permissions: member },
  play: async ({ canvas }) => {
    const restock = canvas.getByText("Canvas tote bag").closest("tr")
    await expect(restock).not.toHaveClass("cursor-pointer")
    await userEvent.click(canvas.getByText("Canvas tote bag"))
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
    await userEvent.click(canvas.getByText("Lotus Manufacturing"))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: "/orders/order-1045" })
  }
})

// A row for something on the page, such as a partner's sheet, opens it from anywhere on the row, once, and never a tab.
export const OpensOnThePage = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByText("Fabric supplier"))
    await expect(args.onOpen).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Juniper Textiles" }))
    await expect(args.onOpen).toHaveBeenCalledTimes(2)
    const open = fn()
    const original = window.open
    window.open = open
    try {
      fireEvent(canvas.getByText("Fabric supplier"), new MouseEvent("auxclick", { bubbles: true, button: 1 }))
    } finally {
      window.open = original
    }
    await expect(open).not.toHaveBeenCalled()
    await expect(getStoryRouter().navigate).not.toHaveBeenCalled()
  }
})
