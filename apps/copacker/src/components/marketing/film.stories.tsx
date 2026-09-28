import { http, HttpResponse } from "msw"
import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { pressEscapeIn } from "@/stories/fixtures/marketing"
import { Film } from "./film"

// The button as the hero draws it, on a dark stage.
const meta = preview.meta({
  component: Film,
  decorators: [
    (Story) => (
      <div className="dark w-fit rounded-2xl bg-[oklch(0.145_0_0)] p-8">
        <Story />
      </div>
    )
  ],
  // The film itself isn't loaded: its request answers with nothing.
  beforeEach: ({ msw }) => {
    msw.use(http.get("https://media.copacker.ai/*", () => new HttpResponse(null, { status: 204 })))
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /Watch the video/ })
    await expect(button).toHaveTextContent("1:45")
    await expect(button).toHaveAttribute("aria-expanded", "false")
    await expect(button).toHaveAttribute("aria-haspopup", "dialog")

    // The dialog loads on the first click if the page hasn't gone idle yet, and opens.
    await userEvent.click(button)
    const dialog = await screen.findByRole("dialog", { name: "Copacker: Restocking, handled" }, { timeout: 5000 })
    await expect(button).toHaveAttribute("aria-expanded", "true")
    await expect(dialog.querySelector("video")).toHaveAttribute("autoplay")

    // Closing it puts focus back on the button.
    await pressEscapeIn(dialog)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(button).toHaveAttribute("aria-expanded", "false")
    await waitFor(() => expect(button).toHaveFocus())

    // It opens again.
    await userEvent.click(button)
    const again = await screen.findByRole("dialog", {}, { timeout: 5000 })
    await waitFor(() => expect(again).toBeVisible())
    await pressEscapeIn(again)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// Restyled for the paper, as the contact page shows it.
export const OnPaper = meta.story({
  args: { className: "border-border bg-transparent text-foreground hover:bg-muted" },
  decorators: [
    (Story) => (
      <div className="light w-fit rounded-2xl bg-background p-8">
        <Story />
      </div>
    )
  ],
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /Watch the video/ })
    await expect(button).toHaveClass("text-foreground")
    await expect(button).not.toHaveClass("text-white")
    await userEvent.click(button)
    const dialog = await screen.findByRole("dialog", { name: "Copacker: Restocking, handled" }, { timeout: 5000 })
    await waitFor(() => expect(dialog).toBeVisible())
  }
})
