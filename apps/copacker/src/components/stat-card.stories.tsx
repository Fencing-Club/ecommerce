import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { DeltaNote, DeltaPill, StatCard, StatGrid } from "./stat-card"

const meta = preview.meta({
  title: "Components/Display/Stat card",
  component: StatCard,
  args: { label: "Open purchase orders", value: 12 }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Open purchase orders")).toBeVisible()
    await expect(canvas.getByText("12")).toBeVisible()
  }
})

export const WithNoteAndInfo = meta.story({
  args: {
    label: "Revenue",
    value: "$48,210",
    note: "Plus €1,200",
    info: "Sales across every connected store, before refunds."
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Plus €1,200")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "About Revenue" })).toBeVisible()
    await userEvent.hover(canvas.getByRole("button", { name: "About Revenue" }))
  }
})

// The change against the compared period: the pill, with what it's compared with beside it once the card has room.
export const WithChange = meta.story({
  args: { label: "Sales", value: "$22,448", note: <DeltaNote value={0.125} versus="vs previous period" /> },
  play: async ({ canvas }) => {
    await expect(canvas.getByTitle("vs previous period")).toHaveTextContent("+13%")
    await expect(canvas.getByText("vs previous period")).toBeVisible()
  }
})

// A loss reads in red.
export const Loss = meta.story({
  args: { label: "Gross profit", value: "-$1,240", loss: true, note: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("-$1,240")).toHaveClass("text-destructive")
  }
})

// Green up, red down, grey under half a percent, and new for something that had nothing before.
export const Changes = meta.story({
  render: () => (
    <div className="flex items-center gap-3">
      <DeltaPill value={0.125} />
      <DeltaPill value={-0.4} />
      <DeltaPill value={0.001} />
      <DeltaPill value={null} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("+13%")).toHaveAttribute("data-tone", "success")
    await expect(canvas.getByText("-40%")).toHaveAttribute("data-tone", "destructive")
    await expect(canvas.getByText("+0.1%")).toHaveAttribute("data-tone", "neutral")
    await expect(canvas.getByText("New")).toHaveAttribute("data-tone", "success")
  }
})

export const Grid = meta.story({
  render: () => (
    <StatGrid>
      <StatCard label="Open" value={4} />
      <StatCard label="With suppliers" value={2} />
      <StatCard label="Drafts" value={1} />
    </StatGrid>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText(/Open|With suppliers|Drafts/)).toHaveLength(3)
  }
})

// Six cards, as on the Overview: two a row on a phone, three once each has room for its label, and all six on a wide
// screen. A card without a note keeps the note's space, so the row lines up; the grid is a region named by `label`.
export const SixInARow = meta.story({
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="p-4">
      <StatGrid label="Sales, Last 30 days">
        <StatCard label="Sales" value="$22,448" note={<DeltaNote value={0.08} versus="vs previous period" />} />
        <StatCard label="Orders" value="465" note={<DeltaNote value={-0.02} versus="vs previous period" />} />
        <StatCard label="Average order value" value="$48.27" note={null} />
        <StatCard label="Units sold" value="825" note={<DeltaNote value={0} versus="vs previous period" />} />
        <StatCard label="Gross profit" value="$4,123" note="28% margin" />
        <StatCard label="Stockout losses" value="$1,240" loss note="$960 lost this period" />
      </StatGrid>
    </div>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByRole("region", { name: "Sales, Last 30 days" })
    await expect(row).toBeVisible()
    await expect(canvas.getByText("$1,240")).toHaveClass("text-destructive")
  }
})
