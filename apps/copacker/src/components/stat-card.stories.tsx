import { expect, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { StatCard, StatGrid } from "./stat-card"

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

export const WithCaptionAndInfo = meta.story({
  args: {
    label: "Revenue",
    value: "$48,210",
    caption: "+12% from last month",
    info: "Sales across every connected store, before refunds."
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("+12% from last month")).toBeVisible()
    await userEvent.hover(canvas.getByRole("button"))
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
