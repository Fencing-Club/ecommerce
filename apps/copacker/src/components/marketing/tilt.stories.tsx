import { expect, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { reduceMotion } from "@/stories/fixtures/marketing"
import { Tilt } from "./tilt"

// The shot starts a screen down the page, so it leans back until it's scrolled up into view.
const meta = preview.meta({
  title: "Components/Marketing/Tilt",
  component: Tilt,
  args: { children: <div className="h-80 rounded-2xl bg-muted p-6 text-2xl font-semibold">Restock</div> },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="px-6">
        <div className="h-svh" />
        <Story />
        <div className="h-svh" />
      </div>
    )
  ]
})

function progress(element: HTMLElement) {
  const wrapper = element.closest("[class*=perspective]")
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error("The shot has its wrapper")
  }
  return wrapper.style.getPropertyValue("--progress")
}

export const Default = meta.story({
  play: async ({ canvas }) => {
    const shot = canvas.getByText("Restock")
    scrollTo({ top: 0 })
    await waitFor(() => expect(progress(shot)).toBe("0.0000"))
    // Scrolled up to the top of the window, it stands straight.
    scrollTo({ top: innerHeight })
    await waitFor(() => expect(progress(shot)).toBe("1.0000"))
    scrollTo({ top: 0 })
    await waitFor(() => expect(progress(shot)).toBe("0.0000"))
  }
})

export const ReducedMotion = meta.story({
  beforeEach: reduceMotion,
  play: async ({ canvas }) => {
    scrollTo({ top: 0 })
    // It stands straight wherever it is.
    await waitFor(() => expect(progress(canvas.getByText("Restock"))).toBe("1.0000"))
  }
})
