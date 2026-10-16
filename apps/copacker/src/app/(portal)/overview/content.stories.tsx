import { expect, screen, userEvent, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { buyerOverview } from "@/stories/fixtures/overview"
import { OverviewContent } from "./content"

const meta = preview.meta({
  component: OverviewContent,
  args: {
    page: { kind: "buyer", admin: true, data: buyerOverview },
    query: { channel: "amazon", keep: "inventory" }
  } satisfies React.ComponentProps<typeof OverviewContent>
})

export const ChangePeriod = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Last 30 days" }))
    const dialog = await screen.findByRole("dialog", { name: "Choose a period" })
    await userEvent.click(within(dialog).getByRole("button", { name: "Today" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({
      href: "/overview?channel=amazon&keep=inventory&period=today"
    })
  }
})
