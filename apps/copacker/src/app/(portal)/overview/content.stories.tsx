import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { buyerOverview } from "@/stories/fixtures/overview"
import { chooseOption, shownDialog } from "@/stories/play"
import { OverviewContent } from "./content"

const meta = preview.meta({
  title: "Pages/Overview/Content",
  component: OverviewContent,
  parameters: { router: { navigation: { pathname: "/overview", query: { channel: "amazon" } } } },
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

// Hold real router loads so this exercises pending URL state rather than a mocked loading prop.
export const SlowFilters = meta.story({
  play: async ({ canvas }) => {
    const router = getStoryRouter()
    const releases: (() => void)[] = []
    const route = router.routesById["/$"]
    route.options.loaderDeps = ({ search }) => search
    route.updateLoader({
      loader: () => new Promise<void>((resolve) => releases.push(resolve))
    })
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Last 30 days" }))
      const dialog = await shownDialog("Choose a period")
      await userEvent.click(dialog.getByRole("button", { name: "Today" }))
      await userEvent.click(dialog.getByRole("button", { name: "Apply" }))
      await expect(canvas.getByRole("status")).toHaveTextContent("Updating overview")
      await expect(canvas.getByRole("button", { name: "Today" })).toBeEnabled()
      await expect(canvas.queryByRole("region", { name: "Sales, Last 30 days" })).toBeNull()
      await chooseOption(canvas.getByRole("combobox", { name: "Channel" }), "All channels")
      await expect(canvas.getByRole("combobox", { name: "Channel" })).toHaveTextContent("All channels")
      await expect(canvas.getByRole("button", { name: "Today" })).toBeVisible()
      await expect(router.navigate).toHaveBeenLastCalledWith({
        to: "/overview",
        search: { period: "today", channel: undefined }
      })
      await waitFor(() => expect(releases.length).toBe(2))
      releases[0]!()
      await expect(canvas.getByRole("status")).toHaveTextContent("Updating overview")
      releases[1]!()
      await waitFor(() => expect(canvas.queryByRole("status")).toBeNull())
    } finally {
      for (const release of releases) {
        release()
      }
      route.updateLoader({ loader: () => undefined })
      route.options.loaderDeps = undefined
    }
  }
})

// A manual preview of a slow response: filters stay usable until the replacement data arrives.
export const SlowConnection = meta.story({
  play: async ({ canvas }) => {
    const route = getStoryRouter().routesById["/$"]
    route.options.loaderDeps = ({ search }) => search
    route.updateLoader({
      loader: () => new Promise<void>((resolve) => setTimeout(resolve, 15000))
    })
    await expect(canvas.getByRole("button", { name: "Last 30 days" })).toBeEnabled()
  }
})
