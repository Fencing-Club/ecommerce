import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { SyncedAt, SyncMenu, SyncProgress } from "./sync-menu"

const meta = preview.meta({
  component: SyncMenu,
  args: { label: "Shopify", syncing: false, onSync: fn() }
})

export const SyncNow = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Shopify actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sync now" }))
    await expect(args.onSync).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await expect(screen.queryByRole("menuitem", { name: "Reconnect" })).toBeNull()
  }
})

export const Syncing = meta.story({
  args: { syncing: true },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Shopify actions" }))
    const item = await screen.findByRole("menuitem", { name: "Syncing…" })
    await expect(item).toHaveAttribute("aria-disabled", "true")
    await userEvent.keyboard("{Enter}")
    await expect(args.onSync).not.toHaveBeenCalled()
  }
})

// When signing in again would fix a failed sync.
export const Reconnect = meta.story({
  args: { label: "Amazon", reconnect: "/api/amazon/connect" },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Amazon actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Reconnect" })).toHaveAttribute(
      "href",
      "/api/amazon/connect"
    )
  }
})

const at = new Date(Date.UTC(2026, 8, 27, 7, 0)).toISOString()

export const LastSynced = meta.story({
  render: () => (
    <p>
      <SyncedAt at={at} />
    </p>
  ),
  play: async ({ canvasElement }) => {
    const time = canvasElement.querySelector("time")
    await expect(canvasElement).toHaveTextContent(/^Synced Sep 2\d, \d{1,2}:00 [AP]M$/)
    await expect(time).toHaveAttribute("datetime", at)
    // The full date shows on hover.
    await expect(time?.getAttribute("title")).toMatch(/September 2\d, 2026/)
  }
})

export const Progress = meta.story({
  render: () => (
    <div className="flex flex-col gap-2">
      <SyncProgress progress={0.42} />
      <SyncProgress />
      <SyncProgress>Copying orders from 2024</SyncProgress>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Syncing… 42%")).toBeVisible()
    await expect(canvas.getByText("Syncing…")).toBeVisible()
    await expect(canvas.getByText("Copying orders from 2024")).toBeVisible()
  }
})
