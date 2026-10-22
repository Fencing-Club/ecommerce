import { ShoppingBag } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { width } from "@/stories/play"
import { IntegrationSyncCard } from "./integration-sync-card"

const meta = preview.meta({
  title: "Components/Integrations/Integration sync card",
  component: IntegrationSyncCard,
  args: { title: "Orders", label: "Amazon orders", icon: <ShoppingBag />, status: "synced" as const, onSync: fn() },
  decorators: [width("max-w-72")]
})

export const Synced = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sync Amazon orders" }))
    await expect(args.onSync).toHaveBeenCalledOnce()
  }
})

export const Running = meta.story({
  args: { status: "syncing", progress: 0.42 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("progressbar", { name: "Amazon orders" })).toHaveAttribute("value", "0.42")
    await expect(canvas.getByText("42%")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sync Amazon orders" })).toBeDisabled()
  }
})

export const Queued = meta.story({
  args: { status: "queued", progress: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Queued")).toBeVisible()
    await expect(canvas.queryByRole("progressbar")).toBeNull()
    await expect(canvas.queryByText("0%")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Sync Amazon orders" })).toBeDisabled()
  }
})

export const Reconnect = meta.story({
  args: { status: "failed", reconnect: "/api/connections/amazon", detail: "Sign-in expired" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Needs attention")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Reconnect" })).toHaveAttribute("href", "/api/connections/amazon")
    await expect(canvas.queryByRole("button", { name: "Sync Amazon orders" })).toBeNull()
    await userEvent.tab()
    await expect(canvas.getByRole("link", { name: "Reconnect" })).toHaveFocus()
  }
})
