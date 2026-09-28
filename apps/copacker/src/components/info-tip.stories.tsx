import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { InfoTip } from "./info-tip"

const meta = preview.meta({
  component: InfoTip,
  args: {
    label: "About days of stock",
    children: "Units on hand divided by what sold each day over the last 30 days."
  }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole("button", { name: "About days of stock" })
    await expect(screen.queryByText(String(args.children))).toBeNull()
    await userEvent.hover(trigger)
    const tip = await screen.findByText(String(args.children))
    await waitFor(() => expect(tip).toBeVisible())
    await userEvent.unhover(trigger)
    await waitFor(() => expect(screen.queryByText(String(args.children))).toBeNull())
  }
})

// Keyboard users reach it too.
export const OnFocus = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "About days of stock" })).toHaveFocus()
    const tip = await screen.findByText(String(args.children))
    await waitFor(() => expect(tip).toBeVisible())
  }
})
