import { http, HttpResponse } from "msw"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import NotFound from "@/app/not-found"
import { Maintenance } from "@/components/maintenance"
import { serverStory } from "@/stories/server"

// The maintenance page (page.tsx): it stands in for another page while Copacker is down, which the maintenance
// header says. Opened directly, it isn't a page, so Next shows the app's not-found page. Its layout's AppProviders
// (messages, theme, data cache) are what every story already renders in.
async function MaintenancePage({ standingIn }: { standingIn: boolean }) {
  if (!standingIn) {
    return <NotFound />
  }
  return <Maintenance />
}

const meta = preview.meta({
  title: "Pages/Maintenance",
  ...serverStory(MaintenancePage),
  args: { standingIn: true },
  parameters: { layout: "fullscreen" },
  // Copacker is still down, so the page doesn't reload.
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/maintenance", () => HttpResponse.json({ active: true })))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("We’ll be back soon")
    await expect(canvas.getByRole("button", { name: "Contact us" })).toHaveAttribute("href", "/contact")
  }
})

export const OpenedDirectly = meta.story({
  args: { standingIn: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Page not found")).toBeVisible()
    await expect(canvas.queryByText("We’ll be back soon")).toBeNull()
    await expect(canvas.getByRole("button", { name: "Go to Copacker" })).toHaveAttribute("href", "/")
  }
})
