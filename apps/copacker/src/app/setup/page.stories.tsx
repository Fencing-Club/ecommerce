import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import Setup from "./page"

// Where sign-in sends everyone until WorkOS is configured. The page reads nothing, so the story renders it as it is;
// its layout is only AppProviders, the story frame's own providers.
const meta = preview.meta({
  title: "Pages/Setup",
  component: Setup,
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/setup" } } }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(within(canvas.getByRole("banner")).getByText("Copacker")).toBeVisible()
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1, name: "Sign-in isn’t set up yet" })).toBeVisible()
    await expect(main.getByText("This installation is missing its WorkOS configuration.")).toBeVisible()
    await expect(canvas.queryByRole("link")).toBeNull()
    await expect(canvas.queryByRole("button")).toBeNull()
  }
})
