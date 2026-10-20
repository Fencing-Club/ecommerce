import preview from "#.storybook/preview"
import { ready, scenario, shippingDocumentStory } from "@/stories/shipping-documents"

const meta = preview.meta({
  ...shippingDocumentStory,
  title: "Components/Shipping documents/Arrangements"
})

export const FbaParcelDropoff = meta.story({ args: { data: scenario("parcel-dropoff") }, play: ready })

export const FbaPalletFreight = meta.story({
  args: { data: scenario("fba-freight") },
  play: ready
})

export const AwdPalletFreight = meta.story({
  args: { data: scenario("awd-freight") },
  play: ready
})

export const FbaAglPickup = meta.story({ args: { data: scenario("agl-fba") }, play: ready })

export const AwdAglPickup = meta.story({ args: { data: scenario("agl-awd") }, play: ready })

export const OwnWarehouse = meta.story({ args: { data: scenario("warehouse") }, play: ready })

export const SupplierToForwarder = meta.story({ args: { data: scenario("supplier-transfer") }, play: ready })

export const ForwarderPickup = meta.story({ args: { data: scenario("forwarder-pickup") }, play: ready })

export const AglFromForwarder = meta.story({
  args: { data: scenario("forwarder-agl") },
  play: ready
})

export const ForwarderRepacking = meta.story({
  args: { data: scenario("forwarder-repack") },
  play: ready
})
