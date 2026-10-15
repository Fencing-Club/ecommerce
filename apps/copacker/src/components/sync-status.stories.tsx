import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { SyncedAt, SyncProgress } from "./sync-status"

const meta = preview.meta({ component: SyncProgress })

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
