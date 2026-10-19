import preview from "#.storybook/preview"
import { ready, scenario, shippingDocumentStory } from "@/stories/shipping-documents"

const meta = preview.meta({
  ...shippingDocumentStory,
  title: "Components/Shipping documents/Checklists",
  args: { ...shippingDocumentStory.args, initialKind: "checklist" as const }
})

export const FbaParcel = meta.story({ play: ready })
export const AwdFreight = meta.story({ args: { data: scenario("awd-freight") }, play: ready })
export const AwdMultipacks = meta.story({ args: { data: scenario("grouped-multipacks") }, play: ready })
export const SupplierTransfer = meta.story({ args: { data: scenario("supplier-transfer") }, play: ready })
export const ForwarderAgl = meta.story({ args: { data: scenario("forwarder-agl") }, play: ready })
export const ForwarderRepacking = meta.story({ args: { data: scenario("forwarder-repack") }, play: ready })
export const PolybagAndSealedPolybag = meta.story({
  args: {
    data: {
      ...scenario("parcel-pickup"),
      products: scenario("parcel-pickup").products.map((product, index) => ({
        ...product,
        tasks: [index === 0 ? ("polybag" as const) : ("sealedPolybag" as const)]
      }))
    }
  },
  play: ready
})
