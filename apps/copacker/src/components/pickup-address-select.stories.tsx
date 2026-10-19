import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { pickupLocations } from "@/stories/fixtures/purchase-orders"
import { PickupAddressSelect } from "./pickup-address-select"
const onAdd = fn()
function Example() {
  const [value, setValue] = useState("supplier-origin")
  return (
    <div className="max-w-lg">
      <PickupAddressSelect addresses={pickupLocations} value={value} onChange={setValue} onAdd={onAdd} />
    </div>
  )
}
const meta = preview.meta({ title: "Components/Pickup address select", component: Example })
export const Default = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Ship from" })
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole("option", { name: /Hangzhou factory/ }))
    await expect(trigger).toHaveTextContent("118 Binsheng Road")
    await expect(trigger).toHaveTextContent("Hangzhou factory")
  }
})
export const Expanded = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Ship from" }))
    await waitFor(() => expect(screen.getByRole("option", { name: "Add new address" })).toBeVisible())
    await expect(screen.getAllByRole("option")).toHaveLength(4)
  }
})
export const AddAddress = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("combobox", { name: "Ship from" })
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole("option", { name: "Add new address" }))
    await expect(onAdd).toHaveBeenCalled()
    await expect(trigger).toHaveTextContent("Main factory")
  }
})
