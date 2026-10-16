import { expect, fn, fireEvent, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { presetRange } from "@/lib/date-range"
import { type PickerPeriod, PeriodPicker } from "./period-picker"

// The picker reads today from the period, so a fixed day keeps every story the same.
const today = "2026-09-28"

const last30: PickerPeriod = {
  key: "last30",
  range: presetRange("last30", today),
  label: "Last 30 days",
  comparison: "previousPeriod",
  comparisonLabel: "Previous period",
  previousLabel: "Jul 30 – Aug 28, 2026",
  today
}

const meta = preview.meta({
  component: PeriodPicker,
  args: { period: last30, onChange: fn() },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/overview" } } }
})

async function open(canvas: { getByRole: typeof screen.getByRole }) {
  await userEvent.click(canvas.getByRole("button", { name: /Last 30 days|Sep 3/ }))
  return screen.findByRole("dialog", { name: "Choose a period" })
}

export const Preset = meta.story({
  play: async ({ canvas, args }) => {
    const picker = await open(canvas)
    // The period is in the "Last" group, which shows as chosen.
    await expect(within(picker).getByRole("button", { name: "Last" })).toHaveAttribute("aria-pressed", "true")
    await expect(within(picker).getByLabelText("Start date")).toHaveValue("2026-08-29")
    await expect(within(picker).getByLabelText("End date")).toHaveValue("2026-09-27")
    await userEvent.click(within(picker).getByRole("button", { name: "Today" }))
    await expect(within(picker).getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    await expect(within(picker).getByLabelText("Start date")).toHaveValue(today)
    await userEvent.click(within(picker).getByRole("button", { name: "Apply" }))
    await expect(args.onChange).toHaveBeenCalledWith({
      key: "today",
      range: { from: today, to: today },
      comparison: "previousPeriod"
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }
})

// The groups of presets, with the channel and comparison kept.
export const PresetGroups = meta.story({
  args: { period: { ...last30, comparison: "previousYear" } },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/overview", query: { channel: "shopify" } } } },
  play: async ({ canvas, args }) => {
    const picker = await open(canvas)
    await userEvent.click(within(picker).getByRole("button", { name: "Last" }))
    await expect(within(picker).getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(within(picker).getByRole("button", { name: "Last week" }))
    await expect(within(picker).getByLabelText("Start date")).toHaveValue("2026-09-20")
    await expect(within(picker).getByLabelText("End date")).toHaveValue("2026-09-26")
    // Back to the main list, then into the "Period to date" group.
    await userEvent.click(within(picker).getByRole("button", { name: "Last" }))
    await userEvent.click(within(picker).getByRole("button", { name: "Period to date" }))
    await expect(within(picker).getByRole("button", { name: "Year to date" })).toBeInTheDocument()
    await userEvent.click(within(picker).getByRole("button", { name: "Period to date" }))
    await expect(within(picker).getByRole("button", { name: "Today" })).toBeInTheDocument()
    await userEvent.click(within(picker).getByRole("button", { name: "Apply" }))
    await expect(args.onChange).toHaveBeenCalledWith({
      key: "lastWeek",
      range: { from: "2026-09-20", to: "2026-09-26" },
      comparison: "previousYear"
    })
  }
})

export const CalendarRange = meta.story({
  play: async ({ canvas, args }) => {
    const picker = await open(canvas)
    await expect(within(picker).getByRole("grid", { name: "September 2026" })).toBeInTheDocument()
    // Days after today can't be picked, nor can next month.
    await expect(within(picker).getByRole("button", { name: "Tuesday, September 29, 2026" })).toBeDisabled()
    await expect(within(picker).getByRole("button", { name: "Next month" })).toBeDisabled()
    // The second day may come before the first.
    await userEvent.click(within(picker).getByRole("button", { name: "Tuesday, September 8, 2026" }))
    await expect(within(picker).getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(within(picker).getByRole("button", { name: "Thursday, September 3, 2026" }))
    await expect(within(picker).getByLabelText("Start date")).toHaveValue("2026-09-03")
    await expect(within(picker).getByLabelText("End date")).toHaveValue("2026-09-08")
    // The range's ends are filled in the brand color, like other chosen things.
    await expect(within(picker).getByRole("button", { name: "Thursday, September 3, 2026" })).toHaveClass("bg-primary")
    await expect(within(picker).getByRole("button", { name: "Saturday, September 5, 2026" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await userEvent.click(within(picker).getByRole("button", { name: "Previous month" }))
    await expect(within(picker).getByRole("grid", { name: "August 2026" })).toBeInTheDocument()
    await expect(within(picker).getByRole("button", { name: "Next month" })).toBeEnabled()
    await userEvent.click(within(picker).getByRole("button", { name: "Apply" }))
    await expect(args.onChange).toHaveBeenCalledWith({
      key: "custom",
      range: { from: "2026-09-03", to: "2026-09-08" },
      comparison: "previousPeriod"
    })
  }
})

export const TypeDates = meta.story({
  play: async ({ canvas, args }) => {
    const picker = await open(canvas)
    fireEvent.change(within(picker).getByLabelText("Start date"), { target: { value: "2026-07-01" } })
    // The calendar follows the typed day.
    await expect(within(picker).getByRole("grid", { name: "July 2026" })).toBeInTheDocument()
    // A day after today is ignored.
    fireEvent.change(within(picker).getByLabelText("End date"), { target: { value: "2026-10-05" } })
    await expect(within(picker).getByLabelText("End date")).toHaveValue("2026-09-27")
    await userEvent.click(within(picker).getByRole("button", { name: "Apply" }))
    await expect(args.onChange).toHaveBeenCalledWith({
      key: "custom",
      range: { from: "2026-07-01", to: "2026-09-27" },
      comparison: "previousPeriod"
    })
  }
})

export const Cancel = meta.story({
  play: async ({ canvas, args }) => {
    let picker = await open(canvas)
    await userEvent.click(within(picker).getByRole("button", { name: "Yesterday" }))
    await userEvent.click(within(picker).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await expect(args.onChange).not.toHaveBeenCalled()
    // Opening it again starts from the period on the page.
    picker = await open(canvas)
    await expect(within(picker).getByRole("button", { name: "Yesterday" })).toHaveAttribute("aria-pressed", "false")
    await expect(within(picker).getByLabelText("Start date")).toHaveValue("2026-08-29")
  }
})

export const CustomPeriod = meta.story({
  args: {
    period: { ...last30, key: "custom", range: { from: "2026-09-03", to: "2026-09-08" }, label: "Sep 3 – Sep 8, 2026" }
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Sep 3 – Sep 8, 2026" })).toBeVisible()
    const picker = await open(canvas)
    await expect(within(picker).getByRole("button", { name: "Custom range" })).toHaveAttribute("aria-pressed", "true")
    await expect(within(picker).getByRole("button", { name: "Thursday, September 3, 2026" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    // Choosing the default period leaves it out of the address.
    await userEvent.click(within(picker).getByRole("button", { name: "Last" }))
    await userEvent.click(within(picker).getByRole("button", { name: "Last 30 days" }))
    await userEvent.click(within(picker).getByRole("button", { name: "Apply" }))
    await expect(args.onChange).toHaveBeenCalledWith({
      key: "last30",
      range: last30.range,
      comparison: "previousPeriod"
    })
  }
})
