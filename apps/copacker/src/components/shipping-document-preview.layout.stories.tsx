import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { ready, scenario, shippingDocumentStory } from "@/stories/shipping-documents"

const meta = preview.meta({
  ...shippingDocumentStory,
  // Renders real PDFs to look at, so test runs leave it out (vitest.config.ts).
  tags: ["documents"],
  title: "Components/Shipping documents/Layout"
})

export const MultiplePages = meta.story({ args: { data: scenario("long-order") }, play: ready })

// Blocked before anything renders, so it stays a test.
export const ManyIdenticalCartons = meta.story({
  tags: ["!documents"],
  args: { data: scenario("identical-cartons") },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("This carton group is too large for one page")
    await expect(canvas.getByRole("button", { name: /^Download PDF$/ })).toBeDisabled()
  }
})

export const ReferenceContinuation = meta.story({
  args: { data: scenario("long-order"), initialKind: "reference" },
  play: ready
})

export const InstructionsMarkdown = meta.story({
  args: { data: scenario("markdown"), initialKind: "checklist" },
  play: ready
})
