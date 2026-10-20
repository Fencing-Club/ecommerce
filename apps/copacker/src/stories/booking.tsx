import type { Decorator } from "@storybook/react-vite"
import { useState } from "react"
import { expect, screen, waitFor, within } from "storybook/test"

// What the stories of the Amazon booking dialogs (src/components/booking) share. Their data is in
// src/components/booking/fixtures.ts.

// The booking dialog once it shows, after checking it's the one height every step keeps: 30rem, or the window's height
// when that's shorter.
export async function bookingDialog(name: string) {
  const dialog = await screen.findByRole("dialog", { name })
  await waitFor(() => expect(dialog).toBeVisible())
  await expect(dialog.offsetHeight).toBe(Math.min(480, window.innerHeight - 32))
  return within(dialog)
}

// The open booking dialog's body, which scrolls when its content needs more room than the step leaves it.
export function dialogBody() {
  const body = screen.getByRole("dialog").querySelector("[data-slot=booking-dialog-body]")
  if (!(body instanceof HTMLElement)) {
    throw new Error("The dialog has no body")
  }
  return body
}

// A booking dialog's piece at the width it has there.
export const dialogWidth: Decorator = (Story) => (
  <div className="max-w-lg">
    <Story />
  </div>
)

// A choice whose value its parent keeps, as a booking step keeps it. `onValueChange` still hears each change.
export function controlled<Props extends { value: string | null; onValueChange: (value: string) => void }>(
  Component: React.ComponentType<Props>
) {
  return function Controlled(props: Props) {
    const [value, setValue] = useState(props.value)
    return (
      <Component
        {...props}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          props.onValueChange(next)
        }}
      />
    )
  }
}
