import { useState } from "react"
import { expect, screen } from "storybook/test"
import { shownDialog, width } from "./play"

// What the stories of the Amazon booking dialogs (src/components/booking) share. Their data is in
// src/stories/fixtures/booking.ts.

// The booking dialog once it shows, after checking it's the one height every step keeps: 30rem, or the window's height
// when that's shorter.
export async function bookingDialog(name: string) {
  const dialog = await shownDialog(name)
  await expect(dialog.element.offsetHeight).toBe(Math.min(480, window.innerHeight - 32))
  return dialog
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
export const dialogWidth = width("max-w-lg")

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
