import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { bookingDialog, dialogBody, dialogWidth } from "@/stories/booking"
import { BookingDialog } from "./booking-dialog"
import { cartonIssue } from "./fixtures"
import { type Issue, IssueSummary, IssuesView } from "./issues"

const meta = preview.meta({
  component: IssueSummary,
  tags: ["vrt"],
  args: { ...cartonIssue, onAction: fn() },
  decorators: [dialogWidth]
})

// One problem where it is, in the warning tone, with the one action that fixes it.
export const OneIssue = meta.story({
  play: async ({ canvas, args }) => {
    const fix = canvas.getByRole("button", { name: "Edit carton 3" })
    await expect(fix).toHaveAccessibleDescription("Carton 3 mixes two packing groups")
    await expect(canvas.getByText("Men / XS and Men / S need separate cartons")).toBeVisible()
    const summary = fix.closest("[data-slot=issue-summary]")
    if (!(summary instanceof HTMLElement)) {
      throw new Error("The issue has no summary")
    }
    await expect(getComputedStyle(summary).backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
    await userEvent.click(fix)
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})

// Several problems collapse into a count, and Review opens them all.
export const SeveralIssues = meta.story({
  args: {
    title: "3 issues in the template",
    description: "Fix them in Copacker, then check again",
    action: "Review"
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Review" }))
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})

// A problem with nothing to fix but trying again, such as Amazon not answering: the action shows the refresh icon.
export const TryAgain = meta.story({
  args: {
    title: "Couldn’t get the carton labels",
    description: "Amazon didn’t respond. Try again in a moment.",
    action: "Try again",
    retry: true
  },
  play: async ({ canvas, args }) => {
    const retry = canvas.getByRole("button", { name: "Try again" })
    await expect(retry).toHaveAccessibleDescription("Couldn’t get the carton labels")
    await expect(retry.querySelector("svg")).not.toBeNull()
    await userEvent.click(retry)
    await expect(args.onAction).toHaveBeenCalledOnce()
  }
})

const onFix = fn()
const onBack = fn()
const onCheckAgain = fn()

// Problems in a template, the third with no fix in Copacker.
const issues: Issue[] = [
  {
    id: "mixed",
    where: "Carton 3",
    what: "Men / XS and Men / S are in different packing groups",
    fix: { label: "Edit carton", onFix }
  },
  { id: "weight", where: "Carton 5", what: "Gross weight is missing", fix: { label: "Edit carton", onFix } },
  { id: "units", where: "Chest protector / Women / M", what: "Amazon expects 13 units, packing has 15" }
]

// Any number of problems: one carton after another without a weight.
const manyIssues: Issue[] = Array.from({ length: 14 }, (_, index) => ({
  id: `carton-${index + 1}`,
  where: `Carton ${index + 1}`,
  what: "Gross weight is missing",
  fix: { label: "Edit carton", onFix }
}))

function Issues({ issues: shown, checking }: { issues: Issue[]; checking?: boolean }) {
  return (
    <BookingDialog open>
      <IssuesView
        title={`Fix ${shown.length} issues in the template`}
        description="Fix them in Copacker, then check the template again."
        issues={shown}
        step={{ current: 1, total: 3 }}
        onBack={onBack}
        onCheckAgain={onCheckAgain}
        checking={checking}
      />
    </BookingDialog>
  )
}

// Every problem as a step of its own: where each is, what's wrong, and its fix when Copacker has one. Back returns to
// the step the problems came from, and Check again asks for the check.
export const EveryIssue = meta.story({
  render: () => <Issues issues={issues} />,
  play: async () => {
    onFix.mockClear()
    onBack.mockClear()
    onCheckAgain.mockClear()
    const dialog = await bookingDialog("Fix 3 issues in the template")
    await expect(dialog.getAllByRole("listitem")).toHaveLength(3)
    const fixes = dialog.getAllByRole("button", { name: "Edit carton" })
    await expect(fixes).toHaveLength(2)
    await expect(fixes[0]).toHaveAccessibleDescription("Carton 3 Men / XS and Men / S are in different packing groups")
    await expect(dialog.getByText("Amazon expects 13 units, packing has 15")).toBeVisible()
    await userEvent.click(fixes[1])
    await expect(onFix).toHaveBeenCalledOnce()
    await userEvent.click(dialog.getByRole("button", { name: "Back" }))
    await expect(onBack).toHaveBeenCalledOnce()
    await userEvent.click(dialog.getByRole("button", { name: "Check again" }))
    await expect(onCheckAgain).toHaveBeenCalledOnce()
  }
})

// While the check runs, Check again shows it and waits, still reachable by keyboard.
export const Checking = meta.story({
  render: () => <Issues issues={issues} checking />,
  play: async () => {
    onCheckAgain.mockClear()
    const dialog = await bookingDialog("Fix 3 issues in the template")
    const check = dialog.getByRole("button", { name: "Check again" })
    await expect(check).toHaveAttribute("aria-disabled", "true")
    await expect(check.querySelector("[data-slot=spinner]")).not.toBeNull()
    await userEvent.click(check)
    await expect(onCheckAgain).not.toHaveBeenCalled()
  }
})

// Any number of problems fits: the list scrolls within the dialog, which keeps its height.
export const ManyIssues = meta.story({
  render: () => <Issues issues={manyIssues} />,
  play: async () => {
    const dialog = await bookingDialog("Fix 14 issues in the template")
    await expect(dialog.getAllByRole("listitem")).toHaveLength(14)
    await expect(dialogBody().scrollHeight).toBeGreaterThan(dialogBody().clientHeight)
    await expect(dialog.getByRole("button", { name: "Check again" })).toBeVisible()
  }
})
