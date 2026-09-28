import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Bar } from "./bar"

// The bar over a page of paper with a dark stage a screen and a half down.
const meta = preview.meta({
  component: Bar,
  args: { tone: "light" as const, children: <div className="flex h-16 items-center px-6 font-semibold">Copacker</div> },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="light bg-(--paper) [--ink:oklch(0.145_0_0)] [--paper:oklch(0.972_0.008_78)]">
        <Story />
        <div className="h-[150svh]" />
        <div data-tone="dark" className="dark h-[150svh] bg-(--ink)" />
      </div>
    )
  ]
})

export const OverPaper = meta.story({
  play: async ({ canvas }) => {
    scrollTo({ top: 0 })
    await expect(canvas.getByRole("banner")).toHaveClass("light")
    // Scrolled onto the dark stage, the bar turns dark, and back again.
    scrollTo({ top: innerHeight * 2 })
    await waitFor(() => expect(canvas.getByRole("banner")).toHaveClass("dark"))
    scrollTo({ top: 0 })
    await waitFor(() => expect(canvas.getByRole("banner")).toHaveClass("light"))
  }
})

// A page that starts on a dark stage starts the bar dark; over paper, it turns light once it looks.
export const StartsDark = meta.story({
  args: { tone: "dark" as const },
  play: async ({ canvas }) => {
    scrollTo({ top: 0 })
    await waitFor(() => expect(canvas.getByRole("banner")).toHaveClass("light"))
    await expect(canvas.getByRole("banner")).not.toHaveClass("dark")
  }
})
