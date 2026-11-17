import { Button } from "@buildkitgg/shadcn"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import { useTranslations } from "use-intl"
import preview from "#.storybook/preview"
import { bookingDialog, dialogBody } from "@/stories/booking"
import { BookingDialog, type BookingStepCount, BookingStep } from "./booking-dialog"

// A step in the booking dialog, held open as the shipment page holds it: FBA's first step, its body `rows` rows tall.
function Step({
  rows,
  step,
  onOpenChange
}: {
  rows: number
  step?: BookingStepCount
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("booking")
  return (
    <BookingDialog open onOpenChange={onOpenChange}>
      <BookingStep
        title={t("fba.choose.title")}
        description={t("fba.choose.description")}
        step={step}
        actions={
          <>
            <Button variant="outline">{t("back")}</Button>
            <Button>{t("continue")}</Button>
          </>
        }
      >
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="h-12 shrink-0 rounded-lg border bg-muted/50" />
        ))}
      </BookingStep>
    </BookingDialog>
  )
}

const meta = preview.meta({
  title: "Unused/Booking/Booking dialog",
  component: Step,
  args: { rows: 3, step: { current: 1, total: 2 }, onOpenChange: fn() }
})

// A step one of a count: the count on the left as a progress bar, the actions on the right. Escape asks to close it.
export const Default = meta.story({
  play: async ({ args }) => {
    const dialog = await bookingDialog("Choose how to ship")
    const progress = dialog.getByRole("progressbar", { name: "Step 1 of 2" })
    await expect(progress).toHaveAttribute("aria-valuenow", "1")
    await expect(progress).toHaveAttribute("aria-valuemax", "2")
    await expect(dialog.getByText("Step 1 of 2")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible()
    await expect(dialogBody().scrollHeight).toBe(dialogBody().clientHeight)
    await expect(dialogBody()).not.toHaveAttribute("tabindex")

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
    await expect(dialogBody().scrollHeight).toBeGreaterThan(dialogBody().clientHeight)
    await waitFor(() => expect(dialogBody()).toHaveAttribute("tabindex", "0"))
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

// Two steps of a flow in one dialog: AGL's first two.
function Flow() {
  const t = useTranslations("booking")
  const [step, setStep] = useState(1)
  return (
    <BookingDialog open screen={String(step)}>
      <BookingStep
        title={step === 1 ? t("agl.start.title") : t("agl.book.title")}
        description={step === 1 ? t("agl.start.description") : t("agl.book.description")}
        step={{ current: step, total: 2 }}
        actions={
          step === 1 ? (
            <Button onClick={() => setStep(2)}>{t("continue")}</Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(1)}>
              {t("back")}
            </Button>
          )
        }
      />
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
