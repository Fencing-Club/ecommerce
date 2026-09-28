import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { CopyButton } from "./copy-button"

// What's read out beside the button.
function announcement(root: HTMLElement) {
  const live = root.querySelector("[aria-live=polite]")
  if (!live) {
    throw new Error("The button has its live region")
  }
  return live
}

// The button is drawn for the dark stages it sits on.
const meta = preview.meta({
  component: CopyButton,
  args: { copied: false, onCopy: fn() },
  decorators: [
    (Story) => (
      <div className="dark w-fit rounded-xl bg-(--ink) p-6 [--ink:oklch(0.145_0_0)]">
        <Story />
      </div>
    )
  ]
})

export const Ready = meta.story({
  play: async ({ args, canvas, canvasElement }) => {
    const button = canvas.getByRole("button", { name: "Copy" })
    await userEvent.click(button)
    await expect(args.onCopy).toHaveBeenCalledOnce()
    // Nothing is announced until whoever holds the clipboard says it's copied.
    await expect(announcement(canvasElement)).toBeEmptyDOMElement()
  }
})

export const Copied = meta.story({
  args: { copied: true },
  play: async ({ canvas, canvasElement }) => {
    // "Copied" is announced beside the button, which keeps its name.
    await expect(canvas.getByRole("button", { name: "Copy" })).toBeVisible()
    await expect(announcement(canvasElement)).toHaveTextContent("Copied")
  }
})

// With the clipboard's holder: copying lights the button up, and it says so.
export const Copying = meta.story({
  render: function Render(args) {
    const [copied, setCopied] = useState(false)
    return (
      <CopyButton
        copied={copied}
        onCopy={() => {
          args.onCopy()
          setCopied(true)
        }}
      />
    )
  },
  play: async ({ args, canvas, canvasElement }) => {
    const button = canvas.getByRole("button", { name: "Copy" })
    await expect(button).not.toHaveClass("text-emerald-300")
    await userEvent.click(button)
    await expect(args.onCopy).toHaveBeenCalledOnce()
    await expect(button).toHaveClass("text-emerald-300")
    await expect(announcement(canvasElement)).toHaveTextContent("Copied")
  }
})
