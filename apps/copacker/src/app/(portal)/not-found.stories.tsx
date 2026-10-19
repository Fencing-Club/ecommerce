import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { pageStory } from "@/stories/server"
import PortalNotFound from "./not-found"

// A portal page that can't find its record, such as another workspace's purchase order.
const meta = preview.meta({
  title: "Pages/Errors/Portal not found"
})

export const Default = meta.story({
  ...pageStory("/orders/order-9999", () => <PortalNotFound />),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible()
    await expect(canvas.getByText("It may have been removed, or it’s in another workspace")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Go to Overview" })).toHaveAttribute("href", "/overview")
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toHaveAttribute("data-active")
  }
})

export const Supplier = meta.story({
  ...pageStory("/orders/order-9999", () => <PortalNotFound />, "supplier"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Orders" })).toHaveAttribute("data-active")
  }
})

export const Forwarder = meta.story({
  ...pageStory("/orders/order-9999", () => <PortalNotFound />, "forwarder"),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible()
    // A forwarder's Overview sends it on to its purchase orders.
    await expect(canvas.getByRole("button", { name: "Go to Overview" })).toHaveAttribute("href", "/overview")
    await expect(canvas.getByRole("link", { name: "Purchase orders" })).toHaveAttribute("data-active")
  }
})
