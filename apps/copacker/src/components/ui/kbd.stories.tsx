import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "./button"
import { Kbd, KbdGroup } from "./kbd"

const meta = preview.meta({
  component: Kbd,
  args: { children: "Esc" }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const key = canvas.getByText("Esc")
    await expect(key.tagName).toBe("KBD")
    await expect(key).toHaveAttribute("data-slot", "kbd")
  }
})

// A shortcut of several keys, as the search button shows it.
export const Group = meta.story({
  render: () => (
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
  play: async ({ canvas }) => {
    const group = canvas.getByText("Ctrl").parentElement
    await expect(group).toHaveAttribute("data-slot", "kbd-group")
    await expect(group?.querySelectorAll("[data-slot=kbd]")).toHaveLength(2)
  }
})

// In Urdu the keys still read left to right: Ctrl, then K.
export const RightToLeft = meta.story({
  globals: { locale: "ur" },
  render: () => (
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ctrl").getBoundingClientRect().left).toBeLessThan(
      canvas.getByText("K").getBoundingClientRect().left
    )
  }
})

export const InButton = meta.story({
  render: () => (
    <Button variant="outline">
      Search
      <KbdGroup aria-hidden="true" className="ms-auto">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
  ),
  play: async ({ canvas }) => {
    // The keys are hidden from the button's name.
    await expect(canvas.getByRole("button", { name: "Search" })).toBeVisible()
    await expect(canvas.getByText("⌘")).toBeVisible()
  }
})
