import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"

type Args = { variant?: "default" | "line" }

const meta = preview.type<{ args: Args }>().meta({
  component: Tabs,
  args: { onValueChange: fn(), defaultValue: "open" },
  render: ({ variant, ...args }) => (
    <Tabs {...args} className="max-w-md">
      <TabsList variant={variant}>
        <TabsTrigger value="open">Open</TabsTrigger>
        <TabsTrigger value="shipped">Shipped</TabsTrigger>
        <TabsTrigger value="closed" disabled>
          Closed
        </TabsTrigger>
      </TabsList>
      <TabsContent value="open">4 purchase orders waiting on suppliers.</TabsContent>
      <TabsContent value="shipped">2 purchase orders on the way.</TabsContent>
      <TabsContent value="closed">No closed purchase orders.</TabsContent>
    </Tabs>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const open = canvas.getByRole("tab", { name: "Open" })
    const shipped = canvas.getByRole("tab", { name: "Shipped" })
    await expect(open).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("4 purchase orders waiting on suppliers.")
    await expect(canvas.getByRole("tablist")).toHaveAttribute("data-variant", "default")

    await userEvent.click(shipped)
    await expect(shipped).toHaveAttribute("aria-selected", "true")
    await expect(open).toHaveAttribute("aria-selected", "false")
    await waitFor(() => expect(canvas.getByRole("tabpanel")).toHaveTextContent("2 purchase orders on the way."))
    await expect(args.onValueChange).toHaveBeenLastCalledWith("shipped", expect.anything())

    // A disabled tab can't be chosen.
    await userEvent.click(canvas.getByRole("tab", { name: "Closed" }), { pointerEventsCheck: 0 })
    await expect(shipped).toHaveAttribute("aria-selected", "true")
  }
})

export const Keyboard = meta.story({
  play: async ({ canvas, args }) => {
    const open = canvas.getByRole("tab", { name: "Open" })
    open.focus()
    // Arrow keys move focus, and Enter chooses the focused tab.
    await userEvent.keyboard("{ArrowRight}")
    const shipped = canvas.getByRole("tab", { name: "Shipped" })
    await expect(shipped).toHaveFocus()
    await expect(shipped).toHaveAttribute("aria-selected", "false")
    await userEvent.keyboard("{Enter}")
    await expect(shipped).toHaveAttribute("aria-selected", "true")
    await expect(args.onValueChange).toHaveBeenLastCalledWith("shipped", expect.anything())
    await userEvent.keyboard("{ArrowLeft}")
    await expect(open).toHaveFocus()
    await expect(shipped).toHaveAttribute("aria-selected", "true")
  }
})

export const Line = meta.story({
  args: { variant: "line" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tablist")).toHaveAttribute("data-variant", "line")
    await userEvent.click(canvas.getByRole("tab", { name: "Shipped" }))
    await waitFor(() => expect(canvas.getByRole("tabpanel")).toHaveTextContent("2 purchase orders on the way."))
  }
})

export const Vertical = meta.story({
  args: { orientation: "vertical" },
  play: async ({ canvas }) => {
    // The list sits beside the panel, and up and down move between its tabs.
    const list = canvas.getByRole("tablist")
    await expect(list.closest("[data-slot=tabs]")).toHaveAttribute("data-orientation", "vertical")
    await expect(list).toHaveAttribute("aria-orientation", "vertical")
    await expect(canvas.getByRole("tabpanel").getBoundingClientRect().left).toBeGreaterThan(
      list.getBoundingClientRect().right
    )
    canvas.getByRole("tab", { name: "Open" }).focus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(canvas.getByRole("tab", { name: "Shipped" })).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    await expect(canvas.getByRole("tab", { name: "Open" })).toHaveFocus()
    await userEvent.click(canvas.getByRole("tab", { name: "Shipped" }))
    await expect(canvas.getByRole("tab", { name: "Shipped" })).toHaveAttribute("aria-selected", "true")
  }
})
