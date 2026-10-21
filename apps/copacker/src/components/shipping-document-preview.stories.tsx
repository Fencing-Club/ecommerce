import preview from "#.storybook/preview"
import { ready, scenario, shippingDocumentStory } from "@/stories/shipping-documents"

const meta = preview.meta({
  ...shippingDocumentStory,
  // Renders real PDFs to look at, so test runs leave it out (vitest.config.ts).
  tags: ["documents"],
  title: "Components/Shipping documents/Preview"
})

export const PacketOverview = meta.story({ args: { initialKind: "overview" }, play: ready })

export const PackingList = meta.story({ play: ready })

export const MixedCartons = meta.story({ args: { data: scenario("mixed-cartons") }, play: ready })

export const GroupedMultipacks = meta.story({ args: { data: scenario("grouped-multipacks") }, play: ready })

export const PackingChecklist = meta.story({
  args: {
    initialKind: "checklist",
    data: {
      ...scenario("parcel-pickup"),
      products: scenario("parcel-pickup").products.map((product) => ({
        ...product,
        tasks: ["sealedPolybag", "sku", "fnsku", "suffocation", "choking", "countryOfOrigin"],
        countryCode: "CN"
      }))
    }
  },
  play: ready
})

export const CartonLabelReference = meta.story({ args: { initialKind: "reference" }, play: ready })

export const AwdCartonLabelReference = meta.story({
  args: { data: scenario("grouped-multipacks"), initialKind: "reference" },
  play: ready
})
