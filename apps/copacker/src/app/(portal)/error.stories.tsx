import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { pageStory } from "@/stories/server"
import PortalError from "./error"

// The error page inside the shell of a workspace of `kind`, at the page that failed.
const failed = (pathname: string, kind: "buyer" | "supplier") =>
  pageStory(pathname, ({ retry }: { retry: () => void }) => <PortalError retry={retry} />, kind)

const meta = preview.meta({
  title: "Pages/Shared/Errors/Portal error",
  component: PortalError,
  args: { retry: fn() }
})

export const Default = meta.story({
  ...failed("/orders/order-1045", "buyer"),
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 2, name: "This page didn’t load" })).toBeVisible()
    await expect(canvas.getByText("Your data hasn’t changed")).toBeVisible()
    // The shell stays around it.
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("button", { name: "Go to Overview" })).toHaveAttribute("href", "/overview")
    await expect(canvas.getByRole("button", { name: "Switch workspace" })).toHaveAttribute("href", "/workspaces")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.retry).toHaveBeenCalledOnce()
  }
})

export const Supplier = meta.story({
  ...failed("/customers", "supplier"),
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("link", { name: "Customers" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("button", { name: "Switch workspace" })).toHaveAttribute("href", "/workspaces")
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.retry).toHaveBeenCalledOnce()
  }
})
