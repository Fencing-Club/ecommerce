import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { Banner } from "./banner"

const meta = preview.meta({
  title: "Unused/Display/Banner",
  component: Banner,
  args: {
    tone: "warning" as const,
    dismissKey: "story-setup",
    children: "Finish setting up Harbor Goods to see stock and costs.",
    action: "Continue setup",
    href: "/settings"
  }
})

export const Warning = meta.story({
  play: async ({ canvas }) => {
    const banner = canvas.getByText(/Finish setting up/).closest("[data-slot=banner]")
    await expect(banner).toHaveAttribute("data-tone", "warning")
    await expect(canvas.getByRole("link", { name: "Continue setup" })).toBeVisible()
  }
})

export const Info = meta.story({
  args: {
    tone: "info",
    dismissKey: "story-info",
    children: "Shopify is syncing your products. It can take a few minutes.",
    action: undefined
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Shopify is syncing/).closest("[data-slot=banner]")).toHaveAttribute(
      "data-tone",
      "info"
    )
  }
})

// A store that needs reconnecting blocks work, so its banner can't be dismissed and carries the fix.
export const Blocking = meta.story({
  args: {
    tone: "destructive",
    dismissKey: undefined,
    children: "Shopify needs reconnecting. Stock and sales stopped syncing on Sep 27.",
    action: "Reconnect",
    href: "/settings/integrations/shopify"
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Reconnect" })).toBeVisible()
  }
})

// Dismissing hides it for this person until its state changes, which gives it a new key.
export const Dismiss = meta.story({
  args: { dismissKey: "story-dismiss" },
  beforeEach: () => {
    localStorage.removeItem("copacker.banner.story-dismiss")
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }))
    await expect(canvas.queryByText(/Finish setting up/)).not.toBeInTheDocument()
    await expect(localStorage.getItem("copacker.banner.story-dismiss")).toBe("true")
  }
})

export const OnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Dismiss" })).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Continue setup" })).toBeVisible()
  }
})
