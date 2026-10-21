import { http, HttpResponse } from "msw/http"
import { expect, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AmazonAdsSettings } from "./amazon-ads"
import { Dialog } from "./ui/dialog"

const meta = preview.meta({
  title: "Components/Sales and costs/Amazon ads",
  component: AmazonAdsSettings,
  args: { available: true },
  decorators: [
    (Story) => (
      <Dialog>
        <Story />
      </Dialog>
    )
  ]
})
export const Connect = meta.story({
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () =>
        HttpResponse.json({ connected: false, active: false, failed: false })
      )
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("link", { name: "Connect Amazon Ads" })).toHaveAttribute(
      "href",
      "/api/connections/amazon-ads"
    )
  }
})
export const Connected = meta.story({
  beforeEach: ({ msw }) => {
    let connected = true
    msw.use(
      http.get("/api/connections/amazon-ads", () => HttpResponse.json({ connected, active: false, failed: false })),
      http.post("/api/connections/amazon-ads", async ({ request }) => {
        const body = await request.json()
        if (body && typeof body === "object" && "action" in body && body.action === "disconnect") {
          connected = false
        }
        return HttpResponse.json({ ok: true })
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Daily sync enabled")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect Ads" }))
    const confirm = await screen.findByRole("alertdialog", { name: "Disconnect Amazon Ads?" })
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }))
    await expect(canvas.getByText("Daily sync enabled")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect Ads" }))
    await userEvent.click(within(confirm).getByRole("button", { name: "Disconnect Ads" }))
    await expect(await canvas.findByRole("link", { name: "Connect Amazon Ads" })).toBeVisible()
  }
})

export const StartSync = meta.story({
  beforeEach: ({ msw }) => {
    let active = false
    msw.use(
      http.get("/api/connections/amazon-ads", () => HttpResponse.json({ connected: true, active, failed: false })),
      http.post("/api/connections/amazon-ads", async ({ request }) => {
        const body = await request.json()
        if (body && typeof body === "object" && "action" in body && body.action === "sync") {
          active = true
        }
        return HttpResponse.json({ ok: true })
      })
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Sync ad spend" }))
    await expect(await canvas.findByText("Syncing")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Sync ad spend" })).toBeDisabled()
  }
})

export const DisconnectFailed = meta.story({
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () =>
        HttpResponse.json({ connected: true, active: false, failed: false })
      ),
      http.post("/api/connections/amazon-ads", () => HttpResponse.json({}, { status: 500 }))
    ),
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Disconnect Ads" }))
    const confirm = await screen.findByRole("alertdialog", { name: "Disconnect Amazon Ads?" })
    await userEvent.click(within(confirm).getByRole("button", { name: "Disconnect Ads" }))
    await expect(await within(confirm).findByRole("alert")).toHaveTextContent("Could not update Amazon Ads. Try again.")
    await expect(within(confirm).getByRole("button", { name: "Disconnect Ads" })).toBeEnabled()
  }
})
export const Syncing = meta.story({
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () => HttpResponse.json({ connected: true, active: true, failed: false }))
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Sync ad spend" })).toBeDisabled()
  }
})
export const Unavailable = meta.story({
  args: { available: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ads setup required.")).toBeVisible()
  }
})
export const Failed = meta.story({
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () => HttpResponse.json({ connected: true, active: false, failed: true }))
    ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Sync failed. Retry or reconnect.")).toBeVisible()
  }
})
