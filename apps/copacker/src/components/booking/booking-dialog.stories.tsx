import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Button } from "@/components/ui/button"
import { bookingDialog } from "@/stories/fixtures/booking"
import { BookingDialog, BookingDialogBody, BookingDialogFooter, BookingDialogHeader } from "./booking-dialog"

// A step in the booking dialog: its header, a body of `rows` rows, and a footer with the step count and its actions.
function Step({
  rows,
  step,
  onOpenChange
}: {
  rows: number
  step?: { current: number; total: number }
  onOpenChange: (open: boolean) => void
}) {
  return (
    <BookingDialog defaultOpen onOpenChange={onOpenChange}>
      <BookingDialogHeader
        title="Choose how to ship"
        description="Totals include Amazon’s placement fee and the cheapest carrier."
      />
      <BookingDialogBody>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="shrink-0 rounded-lg border p-3 text-sm">
            Warehouse {index + 1}
          </div>
        ))}
      </BookingDialogBody>
      <BookingDialogFooter step={step}>
        <Button variant="outline">Back</Button>
        <Button>Continue</Button>
      </BookingDialogFooter>
    </BookingDialog>
  )
}

const meta = preview.meta({
  component: Step,
  args: { rows: 3, step: { current: 1, total: 2 }, onOpenChange: fn() }
})

// The body of a step that fits.
function body() {
  const content = screen.getByRole("dialog").querySelector("[data-slot=booking-dialog-body]")
  if (!(content instanceof HTMLElement)) {
    throw new Error("The dialog has no body")
  }
  return content
}

// A step one of a count: the count on the left as a progress bar, the actions on the right. Escape closes it.
export const Default = meta.story({
  play: async ({ args }) => {
    const dialog = await bookingDialog("Choose how to ship")
    const progress = dialog.getByRole("progressbar", { name: "Step 1 of 2" })
    await expect(progress).toHaveAttribute("aria-valuenow", "1")
    await expect(progress).toHaveAttribute("aria-valuemax", "2")
    await expect(dialog.getByText("Step 1 of 2")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible()
    await expect(body().scrollHeight).toBe(body().clientHeight)
    await expect(body()).not.toHaveAttribute("tabindex")

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
  }
})

// More than fits: the dialog keeps its height, and the body scrolls between the header and the footer. It takes focus,
// so the keyboard can scroll it too.
export const LongBody = meta.story({
  args: { rows: 14 },
  play: async () => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(body().scrollHeight).toBeGreaterThan(body().clientHeight)
    await waitFor(() => expect(body()).toHaveAttribute("tabindex", "0"))
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible()
  }
})

// A step that isn't one of a count, such as a problem to fix: only the actions, on the right.
export const WithoutAStepCount = meta.story({
  args: { step: undefined },
  play: async () => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(dialog.queryByRole("progressbar")).toBeNull()
    const continueButton = dialog.getByRole("button", { name: "Continue" })
    const footer = continueButton.closest("[data-slot=dialog-footer]")
    if (!(footer instanceof HTMLElement)) {
      throw new Error("The dialog has no footer")
    }
    await expect(footer.getBoundingClientRect().right - continueButton.getBoundingClientRect().right).toBeLessThan(20)
  }
})

// On a phone the dialog takes the width it has and keeps the one height.
export const OnAPhone = meta.story({
  globals: { viewport: { value: "iphone12", isRotated: false } },
  play: async () => {
    const dialog = await bookingDialog("Choose how to ship")
    await expect(screen.getByRole("dialog").getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth)
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible()
  }
})

// Two steps of a flow in one dialog.
function Flow() {
  const [step, setStep] = useState(1)
  return (
    <BookingDialog defaultOpen screen={String(step)}>
      <BookingDialogHeader
        title={step === 1 ? "Start the shipment in Seller Central" : "Book the shipment in Seller Central"}
        description="Upload the file there."
      />
      <BookingDialogBody />
      <BookingDialogFooter step={{ current: step, total: 2 }}>
        {step === 1 ? (
          <Button onClick={() => setStep(2)}>Continue</Button>
        ) : (
          <Button variant="outline" onClick={() => setStep(1)}>
            Back
          </Button>
        )}
      </BookingDialogFooter>
    </BookingDialog>
  )
}

// Moving to another step moves focus to the dialog, so a screen reader announces the new step, and the height stays.
export const NextStepTakesFocus = meta.story({
  render: () => <Flow />,
  play: async () => {
    const start = await bookingDialog("Start the shipment in Seller Central")
    await userEvent.click(start.getByRole("button", { name: "Continue" }))
    const book = await bookingDialog("Book the shipment in Seller Central")
    await expect(book.getByRole("progressbar", { name: "Step 2 of 2" })).toBeVisible()
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus())
  }
})
