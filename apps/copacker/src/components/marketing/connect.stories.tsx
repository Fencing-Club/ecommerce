import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { reduceMotion, stubClipboard } from "@/stories/fixtures/marketing"
import { Connect } from "./connect"
import { setups } from "./setups"

const writeText = fn(async (_text: string) => undefined)

// The agents' setups and the CLI, on the dark stage the home page sets them on.
const meta = preview.meta({
  component: Connect,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="dark bg-[oklch(0.145_0_0)] px-6 py-16 text-foreground">
        <Story />
      </div>
    )
  ],
  beforeEach: () => stubClipboard(writeText)
})

function codeFor(name: string) {
  const setup = setups.find((entry) => entry.name === name)
  if (!setup) {
    throw new Error(`${name} has a setup`)
  }
  return setup.code
}

// A figure, by its caption.
function figure(caption: HTMLElement) {
  const element = caption.closest("figure")
  if (!element) {
    throw new Error("The caption is in its figure")
  }
  return element
}

// What's read out beside the copy button.
function announcement(root: HTMLElement) {
  const live = root.querySelector("[aria-live=polite]")
  if (!live) {
    throw new Error("The copy button has its live region")
  }
  return live
}

export const Setups = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Works with any agent." })).toBeVisible()
    // Every agent is a choice, Claude first.
    await expect(canvas.getAllByRole("radio")).toHaveLength(setups.length)
    await expect(canvas.getByRole("radio", { name: "Claude" })).toBeChecked()
    await expect(canvas.getByText(/In Claude, open Customize, then Connectors/)).toBeVisible()
    await expect(canvas.getByText("Customize, Connectors")).toBeVisible()

    // Another agent shows its own setup, ready to copy.
    await userEvent.click(canvas.getByRole("radio", { name: "Claude Code" }))
    await expect(canvas.getByRole("radio", { name: "Claude Code" })).toBeChecked()
    await expect(canvas.getByText("Run this, then sign in with /mcp in Claude Code.")).toBeVisible()
    await expect(canvas.getByText("Terminal")).toBeVisible()
    await expect(canvas.getByText(codeFor("Claude Code"))).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Copy" }))
    await expect(writeText).toHaveBeenCalledWith(codeFor("Claude Code"))
    await waitFor(() => expect(announcement(canvasElement)).toHaveTextContent("Copied"))

    // Picking another agent starts over.
    await userEvent.click(canvas.getByRole("radio", { name: "Cursor" }))
    await expect(announcement(canvasElement)).toBeEmptyDOMElement()
    await expect(canvas.getByText("~/.cursor/mcp.json")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Copy" }))
    await expect(writeText).toHaveBeenLastCalledWith(codeFor("Cursor"))

    // The catch-all names the CLI's own server.
    await userEvent.click(canvas.getByRole("radio", { name: "Any MCP client" }))
    await expect(
      canvas.getByText("Point any other client at this URL, or have it run the CLI’s server with copacker mcp serve.")
    ).toBeVisible()
    await expect(canvas.getByText("Server URL")).toBeVisible()
  }
})

// The terminal types out its session once it's in view.
export const Terminal = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "The same data, in your terminal." })).toBeVisible()
    const terminal = figure(canvas.getByText("A terminal session with the copacker CLI"))
    await waitFor(() => expect(terminal).toHaveTextContent("$ copacker report restock --json"), { timeout: 5000 })
    await waitFor(() => expect(terminal).toHaveTextContent('"status": "reorder_now"'), { timeout: 5000 })
    await expect(terminal).not.toHaveTextContent("copacker shipment list")
  }
})

// With reduced motion the whole session is there at once.
export const ReducedMotion = meta.story({
  beforeEach: reduceMotion,
  play: async ({ canvas }) => {
    const terminal = figure(canvas.getByText("A terminal session with the copacker CLI"))
    await expect(terminal).toHaveTextContent("$ copacker order show 1043 --json")
    await expect(terminal).toHaveTextContent("$ copacker shipment list")
    await expect(terminal).toHaveTextContent("STAR-2HVN7KQ9")
  }
})
