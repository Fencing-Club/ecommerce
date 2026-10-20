import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { SalesStatus } from "./sales-status"

const meta = preview.meta({
  title: "Components/Sales and costs/Sales status",
  component: SalesStatus,
  args: { status: "Fulfilled" }
})

export const Fulfilled = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Fulfilled")).toBeVisible()
  }
})

// Every status the server names, on its tone, and one it doesn't as the server wrote it.
export const Every = meta.story({
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[
        "Fulfilled",
        "Unfulfilled",
        "Partially fulfilled",
        "Pending",
        "Shipped",
        "Unshipped",
        "Partially shipped",
        "Cancelled",
        "Unfulfillable",
        "Unknown",
        "On hold"
      ].map((status) => (
        <SalesStatus key={status} status={status} />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    for (const status of ["Partially shipped", "Unfulfillable", "Unknown", "On hold"]) {
      await expect(canvas.getByText(status)).toBeVisible()
    }
    // Waiting to ship is in progress, cancelled is lost, and anything else is neutral.
    const tone = (text: string) => canvas.getByText(text).closest("[data-tone]")?.getAttribute("data-tone")
    await expect(tone("Shipped")).toBe("success")
    await expect(tone("Unshipped")).toBe("info")
    await expect(tone("Canceled")).toBe("destructive")
    await expect(tone("On hold")).toBe("neutral")
  }
})
