import { http, HttpResponse } from "msw"
import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { AmazonAdsSettings } from "./amazon-ads"

const meta = preview.meta({ component: AmazonAdsSettings, args: { available: true } })
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
    await expect(await canvas.findByText("Connected")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Disconnect Ads" }))
    await expect(await canvas.findByRole("link", { name: "Connect Amazon Ads" })).toBeVisible()
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
    await expect(canvas.getByText("Amazon Ads setup is not complete.")).toBeVisible()
  }
})
export const Failed = meta.story({
  beforeEach: ({ msw }) =>
    msw.use(
      http.get("/api/connections/amazon-ads", () => HttpResponse.json({ connected: true, active: false, failed: true }))
    ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Some reports failed. Try syncing again, or reconnect to renew access.")
    ).toBeVisible()
  }
})
