import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { NotificationsMenu } from "./notifications-menu"

// Nothing sends notifications yet, so the menu loads no data and is always empty.
const meta = preview.meta({
  component: NotificationsMenu,
  decorators: [(Story) => <div className="flex justify-end">{Story()}</div>]
})

export const Empty = meta.story({
  play: async ({ canvas }) => {
    const bell = canvas.getByRole("button", { name: "Inbox" })
    await userEvent.click(bell)
    const popup = await screen.findByRole("dialog")
    await expect(within(popup).getByText("Inbox")).toBeInTheDocument()
    await expect(within(popup).getByText("No notifications")).toBeInTheDocument()
    await expect(within(popup).getByText("Updates on your orders and shipments show here")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(bell).toHaveFocus()
  }
})
