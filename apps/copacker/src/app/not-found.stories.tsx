import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { serverStory } from "@/stories/server"
import NotFound from "./not-found"

// A URL that matches no page, outside the app's shell. The root layout around it adds only the document, fonts and
// skip link.
const meta = preview.meta({
  title: "Pages/Errors/Not found",
  ...serverStory(() => <NotFound />),
  parameters: { layout: "fullscreen" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Copacker" })).toHaveAttribute("href", "/")
    await expect(canvas.getByText("Page not found")).toBeVisible()
    await expect(canvas.getByText("Check the address and try again")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Go to Copacker" })).toHaveAttribute("href", "/")
  }
})
