import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { serverStory } from "@/stories/server"
import ErrorPage from "./error"

// A page outside the portal that failed, or the portal's own layout. The root layout around it adds only the
// document, fonts and skip link.
const meta = preview.meta({
  title: "Pages/Shared/Errors/Error",
  ...serverStory(({ retry }: { retry: () => void }) => <ErrorPage retry={retry} />),
  args: { retry: fn() },
  parameters: { layout: "fullscreen" }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("link", { name: "Copacker" })).toHaveAttribute("href", "/")
    await expect(canvas.getByRole("heading", { level: 1, name: "This page didn’t load" })).toBeVisible()
    await expect(canvas.getByText("Your data hasn’t changed")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Go to Overview" })).toHaveAttribute("href", "/overview")
    await expect(canvas.getByRole("button", { name: "Switch workspace" })).toHaveAttribute("href", "/workspaces")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.retry).toHaveBeenCalledOnce()
  }
})

export const Dark = meta.story({
  globals: { theme: "dark" },
  play: async ({ canvas, args }) => {
    await expect(document.documentElement).toHaveClass("dark")
    await expect(canvas.getByRole("button", { name: "Switch workspace" })).toHaveAttribute("href", "/workspaces")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.retry).toHaveBeenCalledOnce()
  }
})
