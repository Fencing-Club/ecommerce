import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { order } from "@/stories/fixtures/purchase-orders"
import { OrderFormStory } from "@/stories/order-form"
import { shownDialog, chooseOption } from "@/stories/play"
import { PackingRequirementsDialog } from "./packing-requirements-dialog"

const meta = preview.meta({
  title: "Components/Purchase orders/Packing requirements dialog",
  component: PackingRequirementsDialog,
  args: { index: 0, name: "Canvas tote bag", open: true, onOpenChange: fn() },
  render: (args) => (
    <OrderFormStory
      values={{
        items: [
          {
            ...order.items[0]!,
            fnsku: "X001PACK01",
            packingRequirements: { preparation: "polybag", labels: ["fnsku"], countryCode: "", instructions: "" }
          }
        ]
      }}
    >
      <PackingRequirementsDialog {...args} />
    </OrderFormStory>
  )
})

// How each unit is prepared and labeled, with the FNSKU it would print, a country for a country of origin label, and
// instructions. Done only closes it: the details are the form's.
export const Edit = meta.story({
  play: async ({ args }) => {
    const dialog = await shownDialog("Packing details")
    await expect(dialog.getByText("Canvas tote bag")).toBeVisible()
    await expect(dialog.getByRole("combobox", { name: "Preparation" })).toHaveTextContent("Polybag")
    await expect(dialog.getByRole("checkbox", { name: "FNSKU label" })).toBeChecked()
    await expect(dialog.getByText("X001PACK01", { exact: true })).toBeVisible()
    await expect(dialog.queryByRole("combobox", { name: "Country code" })).toBeNull()
    await userEvent.click(dialog.getByRole("checkbox", { name: "Country of origin label" }))
    await chooseOption(dialog.getByRole("combobox", { name: "Country code" }), /^China$/)
    await expect(dialog.getByRole("combobox", { name: "Country code" })).toHaveTextContent("China")
    await userEvent.click(dialog.getByRole("checkbox", { name: "FNSKU label" }))
    await expect(dialog.getByRole("checkbox", { name: "FNSKU label" })).not.toBeChecked()
    await expect(dialog.getByRole("textbox", { name: "Instructions" })).toHaveAccessibleDescription(
      /Markdown supported/
    )
    await userEvent.click(dialog.getByRole("button", { name: "Done" }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  }
})
