import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { PortalError } from "./portal-error"

const meta = preview.meta({ component: PortalError, args: { retry: fn() } })
export const Retry = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Switch workspace" })).toHaveAttribute("href", "/workspaces")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.retry).toHaveBeenCalledOnce()
  }
})
