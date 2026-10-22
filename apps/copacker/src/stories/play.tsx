import type { Decorator } from "@storybook/react-vite"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"

// What play functions share: opening dialogs and picking from lists the way a person does, without racing the
// popups' animations. Story tests turn animations off (.storybook/vitest.setup.ts), but a person watching a story in
// Storybook sees them, so these wait for the popup either way.

// Waits for the story to settle: the updates and effects a component schedules as it mounts land within a couple of
// frames. Call it before typing or clicking first thing, so the play function doesn't act before the story is ready.
export async function settled() {
  await frame()
  await frame()
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

async function shown(role: "dialog" | "alertdialog", name?: string | RegExp) {
  const element = await screen.findByRole(role, name === undefined ? {} : { name })
  await waitFor(() => expect(element).toBeVisible())
  return Object.assign(within(element), { element })
}

// A dialog, sheet or popover once it shows, with queries for what's inside it and the dialog itself as `element`.
export const shownDialog = (name?: string | RegExp) => shown("dialog", name)

// An alert dialog, such as a confirmation, once it shows, as shownDialog gives it.
export const shownAlertDialog = (name?: string | RegExp) => shown("alertdialog", name)

// Opens a select or combobox and picks one of its options, then waits for its list to close: a list that's still
// closing keeps its options, which no longer take clicks.
export async function chooseOption(control: HTMLElement, option: string | RegExp) {
  await settled()
  await userEvent.click(control)
  const choice = await screen.findByRole("option", { name: option })
  await userEvent.click(choice)
  const list = choice.closest('[role="listbox"]') ?? choice
  await waitFor(() => expect(list).not.toBeVisible())
}

// Closes the open menu with Escape and waits for it to go: a menu that's still closing would answer the next
// findByRole("menu").
export async function closeMenu() {
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
}

// Shows the story in a column of a Tailwind width, such as "w-72" or "max-w-lg": the room the component has where the
// app shows it.
export function width(className: string): Decorator {
  return (Story) => (
    <div className={className}>
      <Story />
    </div>
  )
}
