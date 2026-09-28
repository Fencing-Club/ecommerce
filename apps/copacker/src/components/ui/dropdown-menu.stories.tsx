import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./dropdown-menu"

type Args = {
  onOpenChange: (open: boolean, details: unknown) => void
  onAction: (action: string) => void
  onCheckedChange: (checked: boolean) => void
  onSortChange: (sort: string) => void
}

const meta = preview.type<{ args: Args }>().meta({
  args: { onAction: fn(), onCheckedChange: fn(), onSortChange: fn(), onOpenChange: fn() },
  render: ({ onAction, onCheckedChange, onSortChange, onOpenChange }) => (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Purchase order actions" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Purchase order</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onAction("edit")}>
            <Pencil />
            Edit
            <DropdownMenuShortcut>E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction("duplicate")}>
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled onClick={() => onAction("send")}>
            Send to supplier
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem defaultChecked onCheckedChange={(checked) => onCheckedChange(checked)}>
          Show prices
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Sort lines by</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup defaultValue="sku" onValueChange={(value: string) => onSortChange(value)}>
              <DropdownMenuRadioItem value="sku">SKU</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="units">Units</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onAction("delete")}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

async function openMenu(canvas: { getByRole: typeof screen.getByRole }) {
  await userEvent.click(canvas.getByRole("button", { name: "Purchase order actions" }))
  const menu = await screen.findByRole("menu")
  // Wait out the opening animation.
  await waitFor(() => expect(menu).toBeVisible())
  return menu
}

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Purchase order actions" })
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    const menu = await openMenu(canvas)
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true, expect.anything())
    await expect(within(menu).getByRole("group", { name: "Purchase order" })).toBeVisible()
    await expect(within(menu).getByText("E")).toHaveAttribute("data-slot", "dropdown-menu-shortcut")
    await expect(within(menu).getByRole("menuitem", { name: "Send to supplier" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveAttribute("data-variant", "destructive")

    // Choosing an item runs it and closes the menu.
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }))
    await expect(args.onAction).toHaveBeenCalledWith("duplicate")
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  }
})

export const CheckboxItem = meta.story({
  play: async ({ canvas, args }) => {
    const menu = await openMenu(canvas)
    const prices = within(menu).getByRole("menuitemcheckbox", { name: "Show prices" })
    await expect(prices).toHaveAttribute("aria-checked", "true")
    await userEvent.click(prices)
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false)
    // Checking keeps the menu open, so several can change at once.
    await expect(prices).toHaveAttribute("aria-checked", "false")
    await expect(menu).toBeVisible()
    await userEvent.click(prices)
    await expect(prices).toHaveAttribute("aria-checked", "true")
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true)
  }
})

export const SubmenuRadioItems = meta.story({
  play: async ({ canvas, args }) => {
    const menu = await openMenu(canvas)
    const sort = within(menu).getByRole("menuitem", { name: "Sort lines by" })
    await expect(sort).toHaveAttribute("aria-haspopup", "menu")
    // Pointing at it opens the submenu.
    await userEvent.hover(sort)
    await waitFor(() => expect(sort).toHaveAttribute("aria-expanded", "true"))

    const units = await screen.findByRole("menuitemradio", { name: "Units" })
    await expect(screen.getByRole("menuitemradio", { name: "SKU" })).toHaveAttribute("aria-checked", "true")
    await userEvent.click(units)
    await expect(args.onSortChange).toHaveBeenLastCalledWith("units")
    await expect(units).toHaveAttribute("aria-checked", "true")
    await expect(screen.getByRole("menuitemradio", { name: "SKU" })).toHaveAttribute("aria-checked", "false")

    // Clicking outside closes the menu and its submenu.
    await userEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  }
})

export const Keyboard = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "Purchase order actions" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const menu = await screen.findByRole("menu")
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: /^Edit/ })).toHaveFocus())

    // Arrow keys move through the items and into the submenu.
    await userEvent.keyboard("{ArrowDown}")
    await expect(within(menu).getByRole("menuitem", { name: "Duplicate" })).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}")
    const sort = within(menu).getByRole("menuitem", { name: "Sort lines by" })
    await expect(sort).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "SKU" })).toHaveFocus())
    await userEvent.keyboard("{ArrowDown}{Enter}")
    await expect(args.onSortChange).toHaveBeenLastCalledWith("name")

    // Escape closes the submenu, then the menu, and focus returns to the trigger.
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(sort).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
    await expect(args.onAction).not.toHaveBeenCalled()
  }
})

export const DestructiveItem = meta.story({
  play: async ({ canvas, args }) => {
    const menu = await openMenu(canvas)
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
    await expect(args.onAction).toHaveBeenCalledWith("delete")
  }
})
