import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { RestockShot } from "./mockups"

// The hero's product shot at the app's own size, 1280 by 800, as the page scales it down.
const meta = preview.meta({
  title: "Components/Marketing/Mockups",
  component: RestockShot,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: 1280, height: 800 }}>
        <Story />
      </div>
    )
  ]
})

export const Restock = meta.story({
  play: async ({ canvasElement }) => {
    // A picture: nothing in it can be focused or clicked, so it's inert and its words are found by text.
    const frame = canvasElement.querySelector("[inert]")
    if (!(frame instanceof HTMLElement)) {
      throw new Error("The shot is inert")
    }
    const shot = within(frame)
    // No landmarks of its own, so the page around it keeps its one main.
    await expect(frame.querySelector("main, header, aside, nav")).toBeNull()
    await expect(shot.getAllByText("Restock").length).toBeGreaterThan(0)
    await expect(shot.getByText("Ridgeline Goods", { selector: "span.truncate" })).toBeVisible()
    await expect(shot.getByText("$15,090.00")).toBeVisible()
    await expect(shot.getByText(/\$18,340/)).toBeVisible()
    // The two products to reorder from the first supplier, and the second supplier folded.
    await expect(shot.getByText("Steel Bottle 32 oz")).toBeVisible()
    await expect(shot.getByText("SM-1204")).toBeVisible()
    await expect(shot.getByText("2,520")).toBeVisible()
    await expect(shot.getByText("Saigon Packaging Co.")).toBeVisible()
    await expect(shot.getAllByText("Reorder", { selector: "button" })).toHaveLength(2)
    // The sidebar is the buyer's, with Restock marked.
    await expect(shot.getByText("Alex Rivera")).toBeVisible()
    await expect(shot.getByText("Restock", { selector: "span.font-medium" })).toBeVisible()
  }
})
