import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { buyerOverview } from "@/stories/fixtures/overview"
import { shownDialog } from "@/stories/play"
import { OverviewContent } from "./content"

const meta = preview.meta({
  title: "Pages/Overview/Content",
  component: OverviewContent,
  args: {
    page: { kind: "buyer", admin: true, data: buyerOverview },
    search: { channel: "amazon" }
  } satisfies React.ComponentProps<typeof OverviewContent>
})

// A new period keeps the channel.
export const ChangePeriod = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Last 30 days" }))
    const dialog = await shownDialog("Choose a period")
    await userEvent.click(dialog.getByRole("button", { name: "Today" }))
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({
      to: "/overview",
      search: { channel: "amazon", period: "today" }
    })
  }
})
